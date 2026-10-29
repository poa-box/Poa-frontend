/**
 * CashOutService
 * One-click USDC → fiat cashout, atomic.
 *
 *   User signs ONE Permit2 message → Bungee solver delivers USDC on Base AND
 *   calls CashOutRelay.executeData(...) in the same destination tx → relay
 *   creates the ZKP2P deposit owned by the user → P2P taker fills → fiat lands
 *   in the user's payment app.
 *
 * No relay tx, no backend trigger. The relay's executeData IS the deposit
 * creation, and the Bungee solver runs it as part of delivery.
 *
 * Why this works (and the on-chain Inbox path didn't):
 *   - Bungee's solver pool reliably picks up Permit2-signed autoRoute requests
 *     with destinationPayload. The original e2e test ($10 → Venmo) verified
 *     this end-to-end with the same destinationPayload encoding.
 *   - On-chain `BungeeInbox.createRequest` requests with destinationPayload
 *     have effectively zero solver coverage at small order sizes — confirmed
 *     by two production tests that sat for 10 min and auto-refunded.
 *
 * Passkey accounts: their account contract has no `isValidSignature`, so
 * Permit2's EIP-1271 path can't validate them. Atomic cashout for passkey
 * users requires a contract upgrade to PasskeyAccount (track in a follow-up).
 */

import {
  createPublicClient,
  http,
  keccak256,
  parseUnits,
  toBytes,
} from 'viem';
import { utils as ethersUtils } from 'ethers';
import { base } from 'viem/chains';
import { encodeCashoutPayload, CASHOUT_ESCROW_ABI_V1, CASHOUT_RELAY_ABI_V1, decodeCashoutDeposit, projectRecoveryFacts,
  buildWithdrawDeposit as coreWithdrawDeposit, buildRecoverFailed as coreRecoverFailed, readCashoutDiscovery,
} from '@poa-box/core/integrations/cashout';
import { unknownFact, requireCompleteSnapshot, assertPlanScope, assertSourceBlock } from '@poa-box/core/data/facts';
import { FETCH_CASHOUT_DISCOVERY_STATE } from '@poa-box/core/graph/documents/indexed-completeness';
import { createApolloProtocolQuery } from '@/lib/graphql/coreQuery';
// An explicit refresh must discover candidates against a fresh indexed head.
const cashoutProtocolQuery = createApolloProtocolQuery({ fetchPolicy: 'network-only' });
import { pinIndexedSource } from '@/lib/graphql/indexedSnapshot';
import { requireRawUint } from '@poa-box/core/amounts';
import { encodeIntent } from '@poa-box/core/tx/intent';
import {
  PEER_CASHOUTRELAY_BASE_URL,
} from '@/util/cashoutQueries';

/*══════════════════════════════════ CONSTANTS ══════════════════════════════════*/

// Deployed CashOutRelay on Base mainnet — runs on the destination side,
// receives USDC, decodes the destinationPayload, and creates the ZKP2P deposit.
export const CASHOUT_RELAY_ADDRESS = '0xA65414A21dc114199cAfD7c6c3ed99488Eb9eFE5';

// peer.xyz EscrowV2 on Base — holds the user-owned ZKP2P deposit. The relay
// creates the deposit; if no taker fills it, the user can recover via
// withdrawDeposit(depositId) directly from this contract.
export const ESCROW_V2_ADDRESS = '0x777777779d229cdF3110e9de47943791c26300Ef';

// Permit2 — same address on every chain
export const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

// USDC addresses
export const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

export const ARBITRUM_CHAIN_ID = 42161;
export const BASE_CHAIN_ID = 8453;

// 0.98 USD per USDC = 2% spread to the P2P seller. Lower rates don't fill.
// Confirmed in production with $10 → @hudsonhrh on Venmo.
export const DEFAULT_CONVERSION_RATE = parseUnits('0.98', 18);
export const DEFAULT_MIN_INTENT = 1n * 10n ** 6n;     // $1 minimum P2P intent
export const DEFAULT_MIN_DEST_GAS = 800_000n;        // executeData → ZKP2P deposit

// External APIs (no auth required)
const BUNGEE_API = 'https://public-backend.bungee.exchange/api';
const ZKP2P_CURATOR_API = 'https://api.peer.xyz/v1';

// Supported P2P payment platforms — keyed by ZKP2P processor name
export const PAYMENT_PLATFORMS = {
  venmo:    { label: 'Venmo',    handleField: 'venmoUsername'      },
  cashapp:  { label: 'Cash App', handleField: 'cashtag'            },
  paypal:   { label: 'PayPal',   handleField: 'paypalEmail'        },
  zelle:    { label: 'Zelle',    handleField: 'zelleEmail'         },
  revolut:  { label: 'Revolut',  handleField: 'revolutUsername'    },
  wise:     { label: 'Wise',     handleField: 'wisetag'            },
};

/*══════════════════════════════════ STEP-LEVEL HELPERS ══════════════════════════════════*/

/**
 * Register a P2P payment handle with the ZKP2P curator. Returns the on-chain
 * hash that proves payee identity to the relay.
 */
export async function registerPayee(platform, handle) {
  const config = PAYMENT_PLATFORMS[platform];
  if (!config) throw new Error(`Unsupported platform: ${platform}`);

  const res = await fetch(`${ZKP2P_CURATOR_API}/makers/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      processorName: platform,
      depositData: { [config.handleField]: handle },
    }),
  });
  if (!res.ok) throw new Error(`Curator HTTP ${res.status}: ${await res.text()}`);

  const data = await res.json();
  if (!data.success) throw new Error(`Curator: ${data.message || 'unknown error'}`);
  return data.responseObject.hashedOnchainId;
}

/**
 * Encode CashOutParams as the destinationPayload bytes the relay decodes.
 */
export function encodeCashOutPayload({
  depositor,
  platform,
  payeeDetailsHash,
  conversionRate = DEFAULT_CONVERSION_RATE,
  minIntentAmount = DEFAULT_MIN_INTENT,
  maxIntentAmount,
}) {
  if (!PAYMENT_PLATFORMS[platform]) throw new Error('Unsupported payment platform');
  return encodeCashoutPayload({
    depositor,
    paymentMethod: keccak256(toBytes(platform)),
    payeeDetailsHash,
    fiatCurrency: keccak256(toBytes('USD')),
    conversionRate: String(conversionRate),
    minIntentAmount: String(minIntentAmount),
    maxIntentAmount: String(maxIntentAmount),
  });
}

/**
 * Get a Bungee autoRoute quote (Permit2-signed) for Arb→Base USDC delivery to
 * the relay, with our destinationPayload baked in at quote time.
 *
 * Critical: passing `destinationPayload` + `destinationGasLimit` as query
 * params makes Bungee (a) include them in the witness so the user signs them
 * directly, and (b) price the bridge accounting for the destination call's
 * gas cost — solvers reject quotes that under-price the work they're being
 * asked to do.
 */
export async function getAutoRouteQuote({
  amountWei,
  userAddress,
  destinationPayload,
  minDestGas = DEFAULT_MIN_DEST_GAS,
}) {
  const params = new URLSearchParams({
    originChainId: String(ARBITRUM_CHAIN_ID),
    destinationChainId: String(BASE_CHAIN_ID),
    inputToken: USDC_ARBITRUM,
    outputToken: USDC_BASE,
    inputAmount: String(amountWei),
    userAddress,
    receiverAddress: CASHOUT_RELAY_ADDRESS,
    destinationPayload,
    destinationGasLimit: String(minDestGas),
  });
  const res = await fetch(`${BUNGEE_API}/v1/bungee/quote?${params}`);
  if (!res.ok) throw new Error(`Bungee HTTP ${res.status}: ${await res.text()}`);

  const data = await res.json();
  if (!data.success || !data.result?.autoRoute) {
    throw new Error(`Bungee quote: ${data.message || 'no autoRoute available'}`);
  }
  return data.result.autoRoute;
}

/**
 * Build the Permit2 typed data from a quote, normalizing bigints to strings so
 * the wallet can serialize the message. The witness already contains our
 * destinationPayload (baked in at quote time) — no mutation needed here.
 */
export function buildPermit2TypedData({ quote }) {
  const std = quote.signTypedData;
  const message = JSON.parse(JSON.stringify(std.values, (_k, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ));
  return {
    domain: std.domain,
    types: std.types,
    primaryType: 'PermitWitnessTransferFrom',
    message,
  };
}

/**
 * Submit the user-signed witness to Bungee's auction. Bungee distributes it to
 * solvers, the winning solver delivers USDC on Base + calls executeData in the
 * same destination tx (atomic).
 */
export async function submitSignedRequest({ quote, signature, message }) {
  const res = await fetch(`${BUNGEE_API}/v1/bungee/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestType: quote.requestType,        // SINGLE_OUTPUT_REQUEST
      request: message.witness,
      userSignature: signature,
      quoteId: quote.quoteId,
      permitted: message.permitted,
    }),
  });
  if (!res.ok) throw new Error(`Bungee submit HTTP ${res.status}: ${await res.text()}`);

  const data = await res.json();
  if (!data.success) throw new Error(`Bungee submit: ${data.message || 'rejected'}`);

  return {
    requestHash: data.result?.requestHash || quote.requestHash,
  };
}

/*══════════════════════════════════ ORCHESTRATION ══════════════════════════════════*/

/**
 * Full cashout up to the Permit2 sign step. Auth-agnostic; the caller signs.
 *
 * Returns:
 *   - typedData: pass to walletClient.signTypedData
 *   - approval:  { token, spender, amount } — caller must ensure allowance ≥ amount
 *                 to Permit2 BEFORE submitting the signed message
 *   - submit:    async (signature) => { requestHash } — calls Bungee /submit
 *   - quote:     full autoRoute quote
 */
export async function prepareCashOut({
  amountWei,
  userAddress,
  platform,
  payeeHandle,
  conversionRate,
  onStep,
}) {
  const tick = (step, message, extra = {}) => onStep?.({ step, message, ...extra });

  tick('registering', `Registering ${PAYMENT_PLATFORMS[platform]?.label || platform}…`);
  const payeeDetailsHash = await registerPayee(platform, payeeHandle);

  // Encode the payload BEFORE quoting so Bungee builds the witness with it
  // and prices the destination-call gas into the bridge fee. Quoting empty
  // and mutating after leaves solvers under-paid — that's what stalled the
  // earlier on-chain createRequest experiments.
  const cashOutPayload = encodeCashOutPayload({
    depositor: userAddress,
    platform,
    payeeDetailsHash,
    conversionRate: conversionRate ?? DEFAULT_CONVERSION_RATE,
    maxIntentAmount: amountWei,
  });

  tick('quoting', 'Getting bridge route…');
  const quote = await getAutoRouteQuote({
    amountWei,
    userAddress,
    destinationPayload: cashOutPayload,
  });

  const typedData = buildPermit2TypedData({ quote });
  tick('ready', 'Ready to sign.', { quote, payeeDetailsHash, typedData });

  return {
    typedData,
    approval: {
      token: USDC_ARBITRUM,
      spender: PERMIT2_ADDRESS,
      amount: amountWei,
    },
    submit: async (signature) => submitSignedRequest({
      quote,
      signature,
      message: typedData.message,
    }),
    quote,
    payeeDetailsHash,
  };
}

/*══════════════════════════════════ OUTSTANDING / FAILED CASHOUTS ══════════════════════════════════*/

const CASHOUT_RELAY_ABI = JSON.parse(new ethersUtils.Interface([...CASHOUT_RELAY_ABI_V1]).format(ethersUtils.FormatTypes.json));
const ESCROW_V2_ABI = JSON.parse(new ethersUtils.Interface([...CASHOUT_ESCROW_ABI_V1]).format(ethersUtils.FormatTypes.json));
export const CASHOUT_DESCRIPTOR = Object.freeze({
  chainId: BASE_CHAIN_ID, relay: CASHOUT_RELAY_ADDRESS, escrow: ESCROW_V2_ADDRESS, token: USDC_BASE,
});

// Maps the bytes32 paymentMethod stored on each cashout (= keccak256 of the
// platform key) back to the human label. Keys mirror PAYMENT_PLATFORMS above.
const PAYMENT_METHOD_TO_PLATFORM = Object.fromEntries(
  Object.entries(PAYMENT_PLATFORMS).map(([key, { label }]) => [
    keccak256(toBytes(key)),
    label,
  ])
);

function platformLabelFor(paymentMethod) {
  if (!paymentMethod) return null;
  return PAYMENT_METHOD_TO_PLATFORM[paymentMethod.toLowerCase()] || null;
}

// Reusable read-only viem client for Base. RPC override via env, public fallback.
const baseRpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org';
const baseClient = createPublicClient({
  chain: base,
  transport: http(baseRpcUrl),
});

/**
 * Fetch the user's recoverable cashouts via the peer-cashoutrelay-base subgraph.
 *
 * Returns a unified list of two row kinds the UI can render directly:
 *   - { kind: 'unfilled', depositId, requestHash, ... } → recover via
 *       EscrowV2.withdrawDeposit(depositId). Issue #380 case.
 *   - { kind: 'failed',                requestHash, ... } → recover via
 *       CashOutRelay.recoverFailed(requestHash). USDC stuck in the relay.
 *
 * Path:
 *   1. Core keyset-pages FAILED/RECOVERED and DEPOSITED candidate streams.
 *   2. For each DEPOSITED row, getTransactionReceipt(createdTxHash) → parse
 *      the inline EscrowV2.DepositReceived log → depositId.
 *   3. multicall EscrowV2.getDeposit(id) for each → keep only those still
 *      unfilled (remainingDeposits > 0).
 *
 * An empty candidate list is known only through the indexed block. Current RPC
 * balances are separate evidence; failed/partial streams retain explicit coverage.
 */
const outstandingRequests = new Map();
const RPC_BATCH = 24;

// Share active refreshes only. A subsequent refresh must prove current RPC state.
export function fetchOutstandingDeposits(userAddress) {
  if (!userAddress) return Promise.resolve([]);
  const key = JSON.stringify([BASE_CHAIN_ID, PEER_CASHOUTRELAY_BASE_URL, baseRpcUrl, CASHOUT_RELAY_ADDRESS, userAddress.toLowerCase()]);
  if (outstandingRequests.has(key)) return outstandingRequests.get(key);
  const request = readOutstandingDeposits(userAddress).finally(() => outstandingRequests.delete(key));
  outstandingRequests.set(key, request);
  return request;
}

async function readOutstandingDeposits(userAddress) {
  if (BigInt(await baseClient.getChainId()) !== BigInt(BASE_CHAIN_ID)) throw new Error('Cashout chain mismatch');
  const indexedSource = await pinIndexedSource({ source: { chainId: BASE_CHAIN_ID, endpoint: PEER_CASHOUTRELAY_BASE_URL,
    account: userAddress, contract: CASHOUT_RELAY_ADDRESS, indexed: true, snapshot: 'latest', method: 'graph:cashout-discovery' },
    query: cashoutProtocolQuery, document: FETCH_CASHOUT_DISCOVERY_STATE, variables: { relay: CASHOUT_RELAY_ADDRESS.toLowerCase() } });
  let discovery;
  try {
    discovery = await readCashoutDiscovery({ source: indexedSource, query: cashoutProtocolQuery,
      descriptor: CASHOUT_DESCRIPTOR, pageSize: 100, maxPages: 100 });
    // Partial streams can retain proven candidates only after the relay universe
    // and its token/escrow binding are independently complete.
    requireCompleteSnapshot(discovery.data.evidence.state, { scope: indexedSource, indexed: true,
      snapshot: 'pinned', block: indexedSource.block });
    const state = discovery.data.evidence.state.data;
    if (state?.usdc?.toLowerCase() !== USDC_BASE.toLowerCase() || state?.escrow?.toLowerCase() !== ESCROW_V2_ADDRESS.toLowerCase()) throw new Error('Cashout relay binding unavailable');
    assertPlanScope(discovery.source, indexedSource);
    assertSourceBlock(discovery.source.block, indexedSource.block);
  } catch (error) { throw new Error('Cashout history unavailable', { cause: error }); }
  const issues = [...discovery.coverage.issues];
  const candidates = kind => {
    const stream = discovery.data.evidence[kind];
    try {
      assertPlanScope(stream.source, indexedSource);
      assertSourceBlock(stream.source.block, indexedSource.block);
      if (stream.source.snapshot !== 'pinned') throw new Error('Unproven stream');
      return discovery.data[kind];
    } catch { issues.push({ code: 'CASHOUT_STREAM_SOURCE_UNAVAILABLE', id: kind }); return []; }
  };
  const failedRequests = candidates('failed'), depositedRequests = candidates('deposited');
  const observed = await baseClient.getBlock({ blockTag: 'latest' });
  const block = { number: requireRawUint(observed.number), hash: observed.hash };
  if (!/^0x[\da-fA-F]{64}$/.test(block.hash) || BigInt(block.number) < BigInt(indexedSource.block.number)) throw new Error('Cashout block unavailable');
  const multicall = async contracts => {
    const results = [];
    for (let offset = 0; offset < contracts.length; offset += RPC_BATCH) {
      const batch = contracts.slice(offset, offset + RPC_BATCH);
      try {
        const values = await baseClient.multicall({ blockNumber: BigInt(block.number), allowFailure: true, contracts: batch });
        if (!Array.isArray(values) || values.length !== batch.length) throw new Error('Cashout batch incomplete');
        results.push(...values);
      }
      catch { results.push(...batch.map(() => ({ status: 'failure' }))); }
    }
    return results;
  };
  const sourceFor = contract => ({ chainId: BASE_CHAIN_ID, account: userAddress, contract,
    endpoint: baseRpcUrl, method: 'eth_call', indexed: false, snapshot: 'pinned', block });
  const recoveryFact = (state, contract) => projectRecoveryFacts({ descriptor: CASHOUT_DESCRIPTOR, account: userAddress, block,
    snapshot: { source: sourceFor(contract), data: state, coverage: { status: 'complete', receivedKeys: ['state'], missingIds: [], failedIds: [], issues: [] } },
    transactionCapability: unknownFact('HOST_TRANSACTION_CAPABILITY_UNPROVEN') });
  const failedStates = await multicall(failedRequests.flatMap(row => ['failedDepositor', 'failedAmount', 'usdc'].map(functionName => ({
    address: CASHOUT_RELAY_ADDRESS, abi: CASHOUT_RELAY_ABI, functionName,
    args: functionName === 'usdc' ? [] : [row.requestHash],
  }))));
  const failedRows = failedRequests.flatMap((row, index) => {
    const reads = failedStates.slice(index * 3, index * 3 + 3);
    let fact = unknownFact('CASHOUT_FAILED_STATE_UNAVAILABLE');
    if (reads.length === 3 && reads.every(read => read.status === 'success')) fact = recoveryFact({ kind: 'failed',
      requestHash: row.requestHash, depositor: reads[0].result, amountRaw: String(reads[1].result), token: reads[2].result }, CASHOUT_RELAY_ADDRESS);
    if (fact.state !== 'known') issues.push({ code: fact.code, id: row.requestHash });
    else if (!fact.value.owner || fact.value.recoverableAmountRaw === '0') return [];
    return [{ kind: 'failed', requestHash: row.requestHash,
      amount: BigInt(fact.state === 'known' ? fact.value.recoverableAmountRaw : requireRawUint(row.amount)), recoveryFacts: fact,
      paymentMethod: row.paymentMethod || null, platform: platformLabelFor(row.paymentMethod), createdAtSec: Number(row.createdAtTimestamp) }];
  });

  // Recover depositId per DEPOSITED row from its creation tx receipt — the relay
  // calls EscrowV2.depositTo inline, so the DepositReceived log is in the same tx.
  // Finite batches and per-request deduplication keep large histories bounded.
  const receiptByHash = new Map(), canonicalBlocks = new Map();
  const hashes = [...new Set(depositedRequests.map(row => row.createdTxHash))];
  for (let offset = 0; offset < hashes.length; offset += 8) {
    await Promise.all(hashes.slice(offset, offset + 8).map(async hash => {
      try {
        const receipt = await baseClient.getTransactionReceipt({ hash });
        if (receipt?.transactionHash?.toLowerCase() !== hash.toLowerCase() || receipt.status !== 'success'
          || !Array.isArray(receipt.logs) || receipt.blockNumber == null || BigInt(receipt.blockNumber) > BigInt(block.number)
          || !/^0x[\da-f]{64}$/i.test(receipt.blockHash)) throw new Error('Receipt unavailable');
        const number = String(receipt.blockNumber);
        if (!canonicalBlocks.has(number)) canonicalBlocks.set(number, baseClient.getBlock({ blockNumber: BigInt(number) }));
        const canonical = await canonicalBlocks.get(number);
        if (canonical?.hash?.toLowerCase() !== receipt.blockHash.toLowerCase()) throw new Error('Receipt block changed');
        receiptByHash.set(hash, receipt);
      } catch { receiptByHash.set(hash, null); }
    }));
  }
  const receipts = depositedRequests.map(row => receiptByHash.get(row.createdTxHash));
  const depositIds = receipts.map((receipt, index) => {
    if (!receipt || receipt.status !== 'success') {
      issues.push({ code: 'CASHOUT_RECEIPT_UNAVAILABLE', id: depositedRequests[index].requestHash });
      return null;
    }
    const fact = decodeCashoutDeposit({
      descriptor: CASHOUT_DESCRIPTOR, chainId: BASE_CHAIN_ID, depositor: userAddress,
      transactionHash: depositedRequests[index].createdTxHash,
      logs: receipt.logs.map(log => ({ ...log, logIndex: String(log.logIndex) })),
    });
    if (fact.state !== 'known') {
      issues.push({ code: fact.code, id: depositedRequests[index].requestHash });
      return null;
    }
    return BigInt(fact.value.depositId);
  });

  const validIndexes = depositIds.flatMap((id, i) => (id === null ? [] : [i]));
  const fillStates = await multicall(validIndexes.map(i => ({
    address: ESCROW_V2_ADDRESS, abi: ESCROW_V2_ABI, functionName: 'getDeposit', args: [depositIds[i]],
  })));
  const stateByIndex = new Map();
  validIndexes.forEach((i, k) => stateByIndex.set(i, fillStates[k]));

  const unfilledRows = depositedRequests.flatMap((r, i) => {
    const id = depositIds[i];
    if (id === null) return [];
    const state = stateByIndex.get(i);
    if (state?.status !== 'success') {
      issues.push({ code: 'CASHOUT_STATE_UNAVAILABLE', id: r.requestHash });
      return [];
    }
    const fact = recoveryFact({ kind: 'escrow', depositId: id.toString(), depositor: state.result?.depositor, token: state.result?.token,
      remainingDeposits: String(state.result?.remainingDeposits), outstandingIntentAmount: String(state.result?.outstandingIntentAmount) }, ESCROW_V2_ADDRESS);
    if (fact.state !== 'known') { issues.push({ code: fact.code, id: r.requestHash }); return []; }
    if (!fact.value.owner || fact.value.recoverableAmountRaw === '0') return [];
    const remainingDeposits = BigInt(fact.value.recoverableAmountRaw), outstandingIntentAmount = BigInt(fact.value.outstandingIntentAmountRaw);
    return [{
      kind: 'unfilled',
      recoveryFacts: fact,
      depositId: id,
      requestHash: r.requestHash,
      amount: BigInt(r.amount),
      remainingAmount: remainingDeposits,
      outstandingIntentAmount,
      paymentMethod: r.paymentMethod || null,
      platform: platformLabelFor(r.paymentMethod),
      createdAtSec: Number(r.createdAtTimestamp),
    }];
  });

  const again = await baseClient.getBlock({ blockNumber: BigInt(block.number) });
  if (again?.hash?.toLowerCase() !== block.hash.toLowerCase()) throw new Error('Cashout block changed');
  const rows = [...failedRows, ...unfilledRows].sort((a, b) => b.createdAtSec - a.createdAtSec);
  // Preserve the array API; consumers must distinguish partial enumeration from an empty history.
  rows.coverage = { status: issues.length || discovery.coverage.status !== 'complete' ? 'incomplete' : 'complete', issues,
    discovery: discovery.coverage, source: discovery.source, stateSource: sourceFor(CASHOUT_RELAY_ADDRESS),
    outstandingCount: discovery.data.outstandingCount, scope: 'indexed-relay-candidates' };
  rows.discovery = discovery;
  return rows;
}

/**
 * Build the calldata for EscrowV2.withdrawDeposit(depositId). The caller is
 * responsible for switching the wallet to Base and signing/sending the tx —
 * keeps this service auth-agnostic, mirroring prepareCashOut.
 */
export function buildWithdrawDeposit(depositId) {
  const tx = encodeIntent(coreWithdrawDeposit({ descriptor: CASHOUT_DESCRIPTOR, depositId: String(depositId) }));
  return { ...tx, chainId: BASE_CHAIN_ID, value: BigInt(tx.value) };
}

/**
 * Build the calldata for CashOutRelay.recoverFailed(requestHash). Used to pull
 * USDC out of the relay when the downstream EscrowV2.depositTo reverted (the
 * relay holds the funds for the depositor; only msg.sender == depositor passes
 * the contract's NotOwner check).
 */
export function buildRecoverFailed(requestHash) {
  const tx = encodeIntent(coreRecoverFailed({ descriptor: CASHOUT_DESCRIPTOR, requestHash }));
  return { ...tx, chainId: BASE_CHAIN_ID, value: BigInt(tx.value) };
}
