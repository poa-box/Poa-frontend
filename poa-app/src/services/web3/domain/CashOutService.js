/**
 * CashOutService
 * One-click USDC → fiat cashout via Bungee bridge (deposit route) + ZKP2P P2P offramp.
 *
 * Architecture (after switch from autoRoute → deposit):
 *   1. Frontend registers a payee handle with the ZKP2P curator
 *   2. Frontend asks Bungee for a `deposit` route quote
 *      (`enableDepositAddress=true&refundAddress=<user>`)
 *   3. The quote returns a pre-built ERC20 transfer tx — `USDC.transfer(depositAddr, amount)`
 *   4. User signs ONE transaction (works trivially for EOA and passkey)
 *   5. Bungee solver pool picks up the deposit-address transfer (~2s), bridges, and
 *      delivers USDC to the receiver on Base (= our relay)
 *   6. A backend (or admin script) calls CashOutRelay.createDepositFromBalance(params)
 *      to convert the relay's USDC into a ZKP2P deposit owned by the user
 *   7. P2P taker fills the deposit, fiat arrives at the user's handle
 *
 * Why deposit route, not autoRoute?
 *   The autoRoute + destinationPayload combination has poor solver coverage at small
 *   sizes — even with 5% slippage giving transmitters ~$0.35 margin on a $7 bridge,
 *   no solver took the request and it auto-refunded after the deadline. The `deposit`
 *   route is a vanilla USDC bridge with no destination call, which every Bungee
 *   solver handles. Tradeoff: ZKP2P deposit creation moves off-chain, requiring a
 *   backend trigger.
 */

import { keccak256, parseUnits, toBytes } from 'viem';

/*══════════════════════════════════ CONSTANTS ══════════════════════════════════*/

// CashOutRelay on Base mainnet — receives USDC + creates ZKP2P deposit (owner-only)
export const CASHOUT_RELAY_ADDRESS = '0xA65414A21dc114199cAfD7c6c3ed99488Eb9eFE5';

// Token addresses
export const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

export const ARBITRUM_CHAIN_ID = 42161;
export const BASE_CHAIN_ID = 8453;

// 0.98 USD per USDC = 2% spread to the P2P seller. Lower rates don't fill —
// other Venmo deposits sit at 1.02+. Confirmed in production with $10 → @hudsonhrh.
export const DEFAULT_CONVERSION_RATE = parseUnits('0.98', 18);
export const DEFAULT_MIN_INTENT = 1n * 10n ** 6n;       // $1 minimum P2P intent

// External APIs (no auth required)
const BUNGEE_API = 'https://public-backend.bungee.exchange/api';
const ZKP2P_CURATOR_API = 'https://api.peer.xyz/v1';

// Backend that fulfills cashouts (admin-keyed createDepositFromBalance trigger).
// May be unset in dev — frontend logs the intent so an admin can run the
// fulfillment script manually until the backend is wired up.
const CASHOUT_INTENT_ENDPOINT = process.env.NEXT_PUBLIC_CASHOUT_INTENT_ENDPOINT || null;

// P2P platforms — keyed by ZKP2P processor name
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
 * Get a Bungee `deposit` route quote — a vanilla cross-chain bridge with no
 * destination call. Returns pre-built txData (a USDC.transfer to a per-request
 * deposit address), the depositData (address + amount), and the requestHash for
 * status tracking. Settles in ~2s in production.
 *
 * Critical query params: `enableDepositAddress=true` + `refundAddress=<user>` —
 * without these, Bungee's API only returns autoRoute (which has poor solver
 * coverage when combined with destinationPayload at small order sizes).
 */
export async function getDepositRouteQuote({ amountWei, userAddress }) {
  const params = new URLSearchParams({
    originChainId: String(ARBITRUM_CHAIN_ID),
    destinationChainId: String(BASE_CHAIN_ID),
    inputToken: USDC_ARBITRUM,
    outputToken: USDC_BASE,
    inputAmount: String(amountWei),
    userAddress,
    receiverAddress: CASHOUT_RELAY_ADDRESS,
    enableDepositAddress: 'true',
    refundAddress: userAddress,
  });
  const res = await fetch(`${BUNGEE_API}/v1/bungee/quote?${params}`);
  if (!res.ok) throw new Error(`Bungee HTTP ${res.status}: ${await res.text()}`);

  const data = await res.json();
  if (!data.success || !data.result?.deposit) {
    throw new Error(`No deposit route returned: ${data.message || 'see API response'}`);
  }
  return data.result.deposit;
}

/**
 * Build the cashout intent — the params the backend will pass to
 * CashOutRelay.createDepositFromBalance once USDC arrives at the relay.
 */
export function buildCashOutIntent({
  depositor,
  platform,
  payeeDetailsHash,
  amountWei,
  conversionRate = DEFAULT_CONVERSION_RATE,
  minIntentAmount = DEFAULT_MIN_INTENT,
}) {
  return {
    depositor,
    paymentMethod: keccak256(toBytes(platform)),
    payeeDetailsHash,
    fiatCurrency: keccak256(toBytes('USD')),
    conversionRate: conversionRate.toString(),
    minIntentAmount: minIntentAmount.toString(),
    maxIntentAmount: amountWei.toString(),
  };
}

/**
 * Best-effort: tell the backend to fulfill the cashout once USDC arrives at the
 * relay. If no backend is configured, the intent is just logged — an admin can
 * use it to call createDepositFromBalance manually via the existing script.
 */
export async function notifyBackend({ intent, bridgeRequestHash, bridgeTxHash }) {
  const payload = { intent, bridgeRequestHash, bridgeTxHash };

  if (!CASHOUT_INTENT_ENDPOINT) {
    console.info('[CashOut] No NEXT_PUBLIC_CASHOUT_INTENT_ENDPOINT set. Intent:', payload);
    return { delivered: false, reason: 'no-backend' };
  }
  try {
    const res = await fetch(CASHOUT_INTENT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`backend HTTP ${res.status}`);
    return { delivered: true };
  } catch (e) {
    console.warn('[CashOut] Backend notify failed (non-fatal):', e.message);
    return { delivered: false, reason: e.message };
  }
}

/*══════════════════════════════════ ORCHESTRATION ══════════════════════════════════*/

/**
 * Full cashout pipeline up to the bridge tx. Auth-agnostic.
 *
 * Returns:
 *   - bridgeTx: { to, data, value }  — pass straight to a wallet/UserOp
 *   - intent:   the CashOutRelay params the backend / admin will call with
 *   - quote:    the full Bungee deposit route quote (output amount, requestHash, ...)
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

  tick('quoting', 'Getting bridge route…');
  const quote = await getDepositRouteQuote({ amountWei, userAddress });

  const intent = buildCashOutIntent({
    depositor: userAddress,
    platform,
    payeeDetailsHash,
    amountWei,
    conversionRate: conversionRate ?? DEFAULT_CONVERSION_RATE,
  });

  const bridgeTx = {
    to: quote.txData.to,
    data: quote.txData.data,
    value: BigInt(quote.txData.value || 0),
  };

  tick('ready', 'Ready to sign.', { intent, quote, payeeDetailsHash });
  return { bridgeTx, intent, quote, payeeDetailsHash };
}
