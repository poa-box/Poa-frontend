import { normalizeIndexedRecordedInflows } from '@poa-box/core/treasury/indexed-inflows';
import { requireRawUint, parseDecimalAmountToRaw } from '@poa-box/core/amounts';
import { requireCompleteSnapshot } from '@poa-box/core/data/facts';
import { formatTokenAmount } from '@/util/formatToken';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const lower = (value) => value?.toLowerCase();

export function addressTopic(address) {
  return `0x${address.slice(2).toLowerCase().padStart(64, '0')}`;
}


/**
 * Sum external deposits, retaining integer precision until display. ERC20 event
 * amounts use the token's on-chain decimals (USDC is 6); native deposits use 18.
 * Neither minted participation shares nor arbitrary unsolicited tokens are money.
 *
 * The USD column is the configured USD-pegged assets, not a market-price estimate.
 * Transfers directly between Poa pots do not create new external deposits.
 * Do not net by transaction: a bundler may include unrelated orgs' deposits and
 * payouts in the same transaction. Withdrawals never erase a historical inflow.
 */
export function aggregateChainInflows({ transferLogs, network, tokens, evidence }) {
  if (!evidence) throw new Error('Inflow source evidence unavailable');
  const pots = Object.values(evidence.pots).flatMap(snapshot =>
    requireCompleteSnapshot(snapshot, { snapshot: 'pinned', block: evidence.block }));
  const destinations = new Set(pots.map(p => p.address.toLowerCase()));
  const tokenMap = new Map(tokens.filter(t => t.isStable).map(t => [t.address.toLowerCase(), t]));
  const decodeLogs = logs => {
  const events = [];
  // The host decodes its existing bounded RPC Transfer response. Core owns
  // identity, deduplication, historical pot binding and movement classification.
  for (const log of logs) {
    if (log.removed || log.topics?.[0] !== TRANSFER_TOPIC || log.topics.length !== 3) continue;
    const token = tokenMap.get(lower(log.address));
    if (!token) continue;
    const from = `0x${log.topics[1].slice(-40)}`.toLowerCase();
    const to = `0x${log.topics[2].slice(-40)}`.toLowerCase();
    if (!destinations.has(to)) continue;
    events.push({ chainId: network.chainId, transactionHash: log.transactionHash, logIndex: requireRawUint(BigInt(log.logIndex)),
      blockNumber: requireRawUint(BigInt(log.blockNumber)), from, to,
      asset: { chainId: network.chainId, address: token.address.toLowerCase(), decimals: token.decimals },
      amountRaw: requireRawUint(BigInt(log.data)), provenance: 'erc20-transfer' });
  }
  return events;
  };
  const nativeAsset = { chainId: network.chainId, address: ZERO_ADDRESS, decimals: network.nativeCurrency.decimals };
  const normalized = normalizeIndexedRecordedInflows({ pots: evidence.pots, streams: evidence.streams,
    nativeAsset, block: evidence.block, fromBlock: evidence.fromBlock,
    chunks: (evidence.transferChunks || [{ fromBlock: evidence.fromBlock, toBlock: evidence.block.number, logs: transferLogs }]).map(chunk => ({
      source: evidence.logSource, coverage: { ...evidence.logCoverage, receivedKeys: [...new Set(chunk.logs.map(log => `${log.transactionHash}:${log.logIndex}`))] },
      data: { fromBlock: chunk.fromBlock, toBlock: chunk.toBlock, events: decodeLogs(chunk.logs) },
    })) });
  if (normalized.externalRecordedTotals.state !== 'known') throw new Error('Inflow history incomplete');
  const amounts = {};
  for (const total of normalized.externalRecordedTotals.value) {
    const decimals = total.asset.decimals;
    if (decimals > 18 || decimals < 0) throw new Error('Invalid inflow decimals');
    const native = total.asset.address.toLowerCase() === ZERO_ADDRESS;
    const currency = native && !network.nativeCurrency.usdPegged ? network.nativeCurrency.symbol : 'USD';
    const raw = BigInt(requireRawUint(total.rawAmount)) * 10n ** BigInt(18 - decimals);
    amounts[currency] = (amounts[currency] || 0n) + raw;
  }
  // This is recorded gross inflow only. Core's completeRevenue stays unknown.
  return amounts;
}

/** Format without Number(rawWei), scientific notation, or a rounded-down zero. */
export function formatInflowAmount(raw, fractionDigits = 2) {
  const amount = BigInt(raw);
  if (amount === 0n) return '0';
  const unit = 10n ** BigInt(18 - fractionDigits);
  if (amount < unit) return `<${fractionDigits === 0 ? '1' : `0.${'0'.repeat(fractionDigits - 1)}1`}`;
  const rounded = ((amount + unit / 2n) / unit) * unit;
  const formatted = formatTokenAmount(rounded, 18, Math.max(1, fractionDigits));
  const [whole, fraction = ''] = formatted.split('.');
  const trimmed = fraction.slice(0, fractionDigits).replace(/0+$/, '');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${trimmed ? `.${trimmed}` : ''}`;
}

// Quotes stay decimal strings so conversion never rounds a wei amount through
// Number. Reject missing/invalid prices rather than dropping native deposits.
export function parseUsdRate(value) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,18})?$/.test(value)) {
    throw new Error('USD exchange rate unavailable');
  }
  const rate = BigInt(parseDecimalAmountToRaw(value, 18));
  if (rate <= 0n) throw new Error('USD exchange rate unavailable');
  return rate;
}

export function summarizeInflows(chains, usdRates = {}) {
  const amounts = chains.reduce((total, chain) => {
    for (const [currency, amount] of Object.entries(chain)) {
      total[currency] = (total[currency] || 0n) + amount;
    }
    return total;
  }, {});
  let usd = amounts.USD || 0n;
  for (const [currency, amount] of Object.entries(amounts)) {
    if (currency !== 'USD' && amount > 0n) {
      usd += amount * parseUsdRate(usdRates[currency]) / 10n ** 18n;
    }
  }
  const formatted = formatInflowAmount(usd);
  if (formatted.startsWith('<')) return { formattedUsd: `<$${formatted.slice(1)}` };
  const [whole, cents = ''] = formatted.split('.');
  return { formattedUsd: `$${whole}.${cents.padEnd(2, '0')}` };
}
