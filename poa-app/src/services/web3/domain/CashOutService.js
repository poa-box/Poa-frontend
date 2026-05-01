/**
 * CashOutService
 * One-click USDC → fiat cashout via Bungee bridge + ZKP2P P2P offramp.
 *
 * Architecture:
 *   1. Frontend calls ZKP2P curator to register a payment handle (Venmo, CashApp, ...)
 *   2. Frontend calls Bungee /quote to get a route + witness for Arb→Base USDC
 *   3. Frontend overrides the witness sender→BungeeInbox, nonce→fresh,
 *      destinationPayload→encoded CashOutParams
 *   4. User submits a UserOp/tx batch:
 *        a. USDC.approve(BungeeInbox, amount)
 *        b. BungeeInbox.createRequest(request, refundAddress)
 *   5. Bungee transmitter delivers USDC on Base, calls CashOutRelay.executeData()
 *   6. Relay decodes payload + creates ZKP2P deposit owned by user
 *   7. P2P taker fills the deposit by sending fiat to the user's handle
 *
 * Why on-chain createRequest (not Permit2)?
 *   Permit2 needs an off-chain EIP-712 signature. Passkey smart accounts (ERC-4337)
 *   cannot produce off-chain sigs. The on-chain inbox path takes a UserOp batch
 *   signed once with WebAuthn — works for both EOA and passkey users with the
 *   same code path.
 */

import {
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  parseUnits,
  toBytes,
} from 'viem';

/*══════════════════════════════════ CONSTANTS ══════════════════════════════════*/

// Deployed CashOutRelay on Base mainnet — receives USDC + creates ZKP2P deposit
export const CASHOUT_RELAY_ADDRESS = '0xA65414A21dc114199cAfD7c6c3ed99488Eb9eFE5';

// Bungee Inbox — same address on every chain (cross-chain entry point)
export const BUNGEE_INBOX_ADDRESS = '0x5E0f8E7337C8955D2124b8e85Ca74aF884b3E124';

// USDC addresses
export const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

export const ARBITRUM_CHAIN_ID = 42161;
export const BASE_CHAIN_ID = 8453;

// 0.98 USD per USDC = 2% spread to the P2P seller. Lower rates don't get filled
// (other Venmo deposits sit at 1.02+). Confirmed in production with $10 → @hudsonhrh.
export const DEFAULT_CONVERSION_RATE = parseUnits('0.98', 18);
export const DEFAULT_MIN_INTENT = 1n * 10n ** 6n;       // $1 minimum P2P intent
export const DEFAULT_MIN_DEST_GAS = 800_000n;          // executeData → ZKP2P deposit creation

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

const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
];

const BUNGEE_INBOX_ABI = [
  {
    type: 'function',
    name: 'createRequest',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'singleOutputRequest',
        type: 'tuple',
        components: [
          {
            name: 'basicReq',
            type: 'tuple',
            components: [
              { name: 'originChainId', type: 'uint256' },
              { name: 'destinationChainId', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
              { name: 'nonce', type: 'uint256' },
              { name: 'sender', type: 'address' },
              { name: 'receiver', type: 'address' },
              { name: 'delegate', type: 'address' },
              { name: 'bungeeGateway', type: 'address' },
              { name: 'switchboardId', type: 'uint32' },
              { name: 'inputToken', type: 'address' },
              { name: 'inputAmount', type: 'uint256' },
              { name: 'outputToken', type: 'address' },
              { name: 'minOutputAmount', type: 'uint256' },
              { name: 'refuelAmount', type: 'uint256' },
            ],
          },
          { name: 'swapOutputToken', type: 'address' },
          { name: 'minSwapOutput', type: 'uint256' },
          { name: 'metadata', type: 'bytes32' },
          { name: 'affiliateFees', type: 'bytes' },
          { name: 'minDestGas', type: 'uint256' },
          { name: 'destinationPayload', type: 'bytes' },
          { name: 'exclusiveTransmitter', type: 'address' },
        ],
      },
      { name: 'refundAddress', type: 'address' },
    ],
    outputs: [],
  },
];

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
 * Register a P2P payment handle with the ZKP2P curator. Returns the on-chain hash
 * the relay uses to bind a deposit to a specific payee identity.
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
 * Get a Bungee bridge quote for Arb→Base USDC delivery to the relay.
 * Returns the autoRoute object — we only need the witness fields (rates,
 * gateway, delegate, switchboard, affiliate fees, metadata).
 */
export async function getBridgeQuote({ amountWei, userAddress }) {
  const params = new URLSearchParams({
    originChainId: String(ARBITRUM_CHAIN_ID),
    destinationChainId: String(BASE_CHAIN_ID),
    inputToken: USDC_ARBITRUM,
    outputToken: USDC_BASE,
    inputAmount: String(amountWei),
    userAddress,
    receiverAddress: CASHOUT_RELAY_ADDRESS,
  });
  const res = await fetch(`${BUNGEE_API}/v1/bungee/quote?${params}`, {
    headers: { 'User-Agent': 'POA-CashOut/1.0' },
  });
  if (!res.ok) throw new Error(`Bungee HTTP ${res.status}: ${await res.text()}`);

  const data = await res.json();
  if (!data.success || !data.result?.autoRoute) {
    throw new Error(`Bungee quote: ${data.message || 'no route available'}`);
  }
  return data.result.autoRoute;
}

/**
 * Build the Request struct for BungeeInbox.createRequest from a quote.
 * Overrides:
 *   - basicReq.sender → BungeeInbox (required by inbox._checkRequestValidity)
 *   - basicReq.nonce  → fresh unique value
 *   - destinationPayload → our encoded CashOutParams
 *   - minDestGas → bumped so executeData has gas
 */
export function buildRequestFromQuote({
  quote,
  cashOutPayload,
  minDestGas = DEFAULT_MIN_DEST_GAS,
}) {
  const witness = quote.signTypedData.values.witness;
  const basic = witness.basicReq;

  // Unique-per-(time, randomness) — must not collide with prior requestInbox[nonce]
  const nonce = BigInt(Date.now()) * 100000n + BigInt(Math.floor(Math.random() * 100000));

  return {
    basicReq: {
      originChainId: BigInt(basic.originChainId),
      destinationChainId: BigInt(basic.destinationChainId),
      deadline: BigInt(basic.deadline),
      nonce,
      sender: BUNGEE_INBOX_ADDRESS,
      receiver: CASHOUT_RELAY_ADDRESS,
      delegate: basic.delegate,
      bungeeGateway: basic.bungeeGateway,
      switchboardId: Number(basic.switchboardId),
      inputToken: basic.inputToken,
      inputAmount: BigInt(basic.inputAmount),
      outputToken: basic.outputToken,
      minOutputAmount: BigInt(basic.minOutputAmount),
      refuelAmount: BigInt(basic.refuelAmount),
    },
    swapOutputToken: witness.swapOutputToken,
    minSwapOutput: BigInt(witness.minSwapOutput),
    metadata: witness.metadata,
    affiliateFees: witness.affiliateFees,
    minDestGas,
    destinationPayload: cashOutPayload,
    exclusiveTransmitter: witness.exclusiveTransmitter,
  };
}

/**
 * Encode the two calls a UserOp/tx batch needs:
 *   1. USDC.approve(BungeeInbox, amount)
 *   2. BungeeInbox.createRequest(request, refundAddress)
 *
 * Returns [{ to, value, data }, { to, value, data }] — pass directly to:
 *   - SmartAccountTransactionManager.executeBatch() for passkey
 *   - sequential walletClient.writeContract() for EOA
 */
export function buildBatchCalls({ amountWei, request, refundAddress }) {
  return [
    {
      to: USDC_ARBITRUM,
      value: 0n,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [BUNGEE_INBOX_ADDRESS, amountWei],
      }),
    },
    {
      to: BUNGEE_INBOX_ADDRESS,
      value: 0n,
      data: encodeFunctionData({
        abi: BUNGEE_INBOX_ABI,
        functionName: 'createRequest',
        args: [request, refundAddress],
      }),
    },
  ];
}

/**
 * Poll Bungee status until the bridge fills or times out.
 */
export async function pollBridgeStatus(requestHash, { intervalMs = 5000, timeoutMs = 600_000, onTick } = {}) {
  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < timeoutMs) {
    attempt += 1;
    try {
      const res = await fetch(
        `${BUNGEE_API}/v1/bungee/status?requestHash=${requestHash}`,
        { headers: { 'User-Agent': 'POA-CashOut/1.0' } },
      );
      if (res.ok) {
        const data = await res.json();
        const result = Array.isArray(data?.result) ? data.result[0] : data?.result;
        if (result) {
          const status = result.bungeeStatusCode ?? 1;
          onTick?.({ attempt, elapsedSec: Math.round((Date.now() - start) / 1000), status, result });
          if (status === 3) return result;             // COMPLETED
          if (status === 4) throw new Error('Bridge failed at the gateway');
        }
      }
    } catch (e) {
      if (e.message?.includes('Bridge failed')) throw e;
      // Otherwise transient — keep polling
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Bridge timed out — funds may still arrive at the relay');
}

/*══════════════════════════════════ ORCHESTRATION ══════════════════════════════════*/

/**
 * Full cashout pipeline up to the moment we hand off the batch calls. Auth-agnostic.
 *
 * Flow:
 *   1. registerPayee  — get payeeDetailsHash from ZKP2P curator
 *   2. encodeCashOutPayload + getBridgeQuote — get fee/route info
 *   3. buildRequestFromQuote — produce the Request struct
 *   4. buildBatchCalls — produce [approve, createRequest]
 *
 * Returns { calls, request, payeeDetailsHash, quote } so the caller can submit via
 * passkey executeBatch or EOA sequential txs.
 */
export async function prepareCashOut({
  amountWei,
  userAddress,
  platform,
  payeeHandle,
  conversionRate,
  refundAddress,
  onStep,
}) {
  const tick = (step, msg, extra = {}) => onStep?.({ step, message: msg, ...extra });

  tick('registering', `Registering ${PAYMENT_PLATFORMS[platform]?.label || platform}…`);
  const payeeDetailsHash = await registerPayee(platform, payeeHandle);

  tick('quoting', 'Getting bridge quote…');
  const quote = await getBridgeQuote({ amountWei, userAddress });

  const cashOutPayload = encodeCashOutPayload({
    depositor: userAddress,
    platform,
    payeeDetailsHash,
    conversionRate: conversionRate ?? DEFAULT_CONVERSION_RATE,
    maxIntentAmount: amountWei,
  });

  const request = buildRequestFromQuote({ quote, cashOutPayload });
  const calls = buildBatchCalls({
    amountWei,
    request,
    refundAddress: refundAddress || userAddress,
  });

  tick('ready', 'Ready to sign.', { request, quote, payeeDetailsHash });
  return { calls, request, quote, payeeDetailsHash };
}
