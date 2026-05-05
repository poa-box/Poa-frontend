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
  encodeAbiParameters,
  encodeFunctionData,
  http,
  keccak256,
  parseAbi,
  parseAbiItem,
  parseUnits,
  toBytes,
} from 'viem';
import { base } from 'viem/chains';

/*══════════════════════════════════ CONSTANTS ══════════════════════════════════*/

// Deployed CashOutRelay on Base mainnet — runs on the destination side,
// receives USDC, decodes the destinationPayload, and creates the ZKP2P deposit.
export const CASHOUT_RELAY_ADDRESS = '0xA65414A21dc114199cAfD7c6c3ed99488Eb9eFE5';

// peer.xyz EscrowV2 on Base — holds the user-owned ZKP2P deposit. The relay
// creates the deposit; if no taker fills it, the user can recover via
// withdrawDeposit(depositId) directly from this contract.
export const ESCROW_V2_ADDRESS = '0x777777779d229cdF3110e9de47943791c26300Ef';

// Block EscrowV2 was deployed at on Base. Used as fromBlock for the
// DepositReceived getLogs scan (filtered by indexed depositor topic, so the
// result set is small even over a wide range).
// Source: zkp2p/zkp2p-contracts/deployments/base/EscrowV2.json receipt.blockNumber
export const ESCROW_V2_DEPLOY_BLOCK = 43224628n;

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

/*══════════════════════════════════ ABIs ══════════════════════════════════*/

// Same encoding the relay's executeData decodes
const CASHOUT_PARAMS_TUPLE = [
  {
    type: 'tuple',
    components: [
      { name: 'depositor', type: 'address' },
      { name: 'paymentMethod', type: 'bytes32' },
      { name: 'payeeDetailsHash', type: 'bytes32' },
      { name: 'fiatCurrency', type: 'bytes32' },
      { name: 'conversionRate', type: 'uint256' },
      { name: 'minIntentAmount', type: 'uint256' },
      { name: 'maxIntentAmount', type: 'uint256' },
    ],
  },
];

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
  return encodeAbiParameters(CASHOUT_PARAMS_TUPLE, [
    {
      depositor,
      paymentMethod: keccak256(toBytes(platform)),
      payeeDetailsHash,
      fiatCurrency: keccak256(toBytes('USD')),
      conversionRate,
      minIntentAmount,
      maxIntentAmount,
    },
  ]);
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

/*══════════════════════════════════ OUTSTANDING DEPOSITS (recover unfilled) ══════════════════════════════════*/

// Minimal EscrowV2 ABI — just what we need to enumerate, inspect, and withdraw
// the user's deposits. Full ABI in zkp2p/zkp2p-contracts/deployments/base/EscrowV2.json.
const ESCROW_V2_ABI = parseAbi([
  'function getDeposit(uint256 depositId) view returns ((address depositor, address delegate, address token, (uint256 min, uint256 max) intentAmountRange, bool acceptingIntents, uint256 remainingDeposits, uint256 outstandingIntentAmount, address intentGuardian, bool retainOnEmpty))',
  'function getDepositPaymentMethods(uint256 depositId) view returns (bytes32[])',
  'function withdrawDeposit(uint256 depositId)',
]);

const DEPOSIT_RECEIVED_EVENT = parseAbiItem(
  'event DepositReceived(uint256 indexed depositId, address indexed depositor, address indexed token, uint256 amount, (uint256 min, uint256 max) intentAmountRange, address delegate, address intentGuardian)'
);

// Maps the bytes32 paymentMethod stored on each deposit (= keccak256 of the
// platform key) back to the human label. Keys mirror PAYMENT_PLATFORMS above.
const PAYMENT_METHOD_TO_PLATFORM = Object.fromEntries(
  Object.entries(PAYMENT_PLATFORMS).map(([key, { label }]) => [
    keccak256(toBytes(key)),
    label,
  ])
);

// Reusable read-only viem client for Base. RPC override via env, public fallback.
const baseRpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org';
const baseClient = createPublicClient({
  chain: base,
  transport: http(baseRpcUrl),
});

// Public Base RPCs (mainnet.base.org, publicnode, etc.) cap eth_getLogs to ~10k
// blocks per request. Since our query is filtered by an indexed depositor topic
// the result set per chunk is tiny — we just need to chunk the range.
const LOG_CHUNK_SIZE = 9_500n;

/**
 * Scan EscrowV2 DepositReceived events filtered by indexed depositor across the
 * full contract lifetime, chunked to fit public RPC block-range limits.
 */
async function scanDepositReceivedLogs(userAddress) {
  const head = await baseClient.getBlockNumber();
  const ranges = [];
  for (let from = ESCROW_V2_DEPLOY_BLOCK; from <= head; from += LOG_CHUNK_SIZE) {
    const to = from + LOG_CHUNK_SIZE - 1n;
    ranges.push({ fromBlock: from, toBlock: to > head ? head : to });
  }
  const chunks = await Promise.all(
    ranges.map(({ fromBlock, toBlock }) =>
      baseClient.getLogs({
        address: ESCROW_V2_ADDRESS,
        event: DEPOSIT_RECEIVED_EVENT,
        args: { depositor: userAddress },
        fromBlock,
        toBlock,
      })
    )
  );
  return chunks.flat();
}

/**
 * Fetch all of a user's outstanding (unfilled) cashout deposits in EscrowV2.
 *
 * Path:
 *   1. chunked getLogs(DepositReceived, depositor=user) → list of (depositId, blockNumber)
 *   2. multicall getDeposit(id) + getDepositPaymentMethods(id) for each
 *   3. filter remainingDeposits > 0 (= USDC still sitting unfilled in the deposit)
 *   4. resolve creation timestamp via batched eth_getBlockByNumber
 *
 * Returns rows shaped for the UI: { depositId, remainingAmount, paymentMethod, platform, createdAtSec }.
 * Returns [] for any falsy address.
 */
export async function fetchOutstandingDeposits(userAddress) {
  if (!userAddress) return [];

  const logs = await scanDepositReceivedLogs(userAddress);
  if (logs.length === 0) return [];

  // Batch deposit reads via multicall3 (auto-detected on Base by viem).
  const depositCalls = logs.flatMap((log) => [
    { address: ESCROW_V2_ADDRESS, abi: ESCROW_V2_ABI, functionName: 'getDeposit', args: [log.args.depositId] },
    { address: ESCROW_V2_ADDRESS, abi: ESCROW_V2_ABI, functionName: 'getDepositPaymentMethods', args: [log.args.depositId] },
  ]);
  const results = await baseClient.multicall({ contracts: depositCalls, allowFailure: true });

  // Resolve unique block timestamps for "Listed N hours ago" display.
  const uniqueBlocks = [...new Set(logs.map((l) => l.blockNumber))];
  const blockResults = await Promise.all(
    uniqueBlocks.map((bn) => baseClient.getBlock({ blockNumber: bn }))
  );
  const blockTimes = new Map(blockResults.map((b) => [b.number, Number(b.timestamp)]));

  const rows = [];
  for (let i = 0; i < logs.length; i += 1) {
    const log = logs[i];
    const depositRes = results[i * 2];
    const methodsRes = results[i * 2 + 1];
    if (depositRes.status !== 'success' || methodsRes.status !== 'success') continue;

    const deposit = depositRes.result;
    if (deposit.remainingDeposits === 0n) continue;

    const paymentMethod = (methodsRes.result?.[0]) || null;
    rows.push({
      depositId: log.args.depositId,
      remainingAmount: deposit.remainingDeposits,
      outstandingIntentAmount: deposit.outstandingIntentAmount,
      paymentMethod,
      platform: paymentMethod ? (PAYMENT_METHOD_TO_PLATFORM[paymentMethod] || null) : null,
      createdAtSec: blockTimes.get(log.blockNumber) ?? null,
    });
  }
  // Newest first
  rows.sort((a, b) => (b.createdAtSec || 0) - (a.createdAtSec || 0));
  return rows;
}

/**
 * Build the calldata for EscrowV2.withdrawDeposit(depositId). The caller is
 * responsible for switching the wallet to Base and signing/sending the tx —
 * keeps this service auth-agnostic, mirroring prepareCashOut.
 */
export function buildWithdrawDeposit(depositId) {
  return {
    chainId: BASE_CHAIN_ID,
    to: ESCROW_V2_ADDRESS,
    data: encodeFunctionData({
      abi: ESCROW_V2_ABI,
      functionName: 'withdrawDeposit',
      args: [BigInt(depositId)],
    }),
    value: 0n,
  };
}
