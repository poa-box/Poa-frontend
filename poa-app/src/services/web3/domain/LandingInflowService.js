import { NETWORKS } from '@/config/networks';
import { getBountyTokenOptions } from '@/util/tokens';
import { LANDING_INFLOWS_QUERY } from '@/util/landingInflowQueries';
import { readHistoricalPotFacts } from '@poa-box/core/treasury/inflows';
import { readHistoricalPaymasterHubPotFacts, readIndexedNativeInflowFacts } from '@poa-box/core/treasury/indexed-inflows';
import { requireCompleteSnapshot, assertSourceBlock } from '@poa-box/core/data/facts';
import { requireRawUint } from '@poa-box/core/amounts';
import { addressTopic, aggregateChainInflows, parseUsdRate, summarizeInflows, TRANSFER_TOPIC } from '@/lib/landing/inflows';

const REQUEST_TIMEOUT = 15000;
const CACHE_DURATION = 5 * 60 * 1000;
let cached = null;
let pending = null;

export async function fetchUsdSpotRate(symbol, fetcher = fetch) {
  const response = await fetcher(`https://api.coinbase.com/v2/prices/${encodeURIComponent(symbol)}-USD/spot`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('USD exchange rate unavailable');
  const { data } = await response.json();
  if (data?.base !== symbol || data?.currency !== 'USD') {
    throw new Error('USD exchange rate unavailable');
  }
  parseUsdRate(data.amount);
  return data.amount;
}

async function post(url, body, fetcher) {
  const response = await fetcher(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });
  if (!response.ok) throw new Error('Inflow source unavailable');
  const json = await response.json();
  if (json.errors?.length || json.error) throw new Error('Inflow source rejected request');
  return json;
}

const MAX_TRANSFER_RANGE = 10_000_000n;
const MAX_TRANSFER_REQUESTS = 64;
const TRANSFER_CONCURRENCY = 4;

/** RPC transport limits only. The complete indexed pot universe and pinned head
 * are established by the caller; any missing filter/range fails the whole read. */
export async function readInflowTransferChunks({ rpc, tokens, contracts, fromBlock, toBlock }) {
  const from = BigInt(requireRawUint(fromBlock)), to = BigInt(requireRawUint(toBlock));
  if (from > to) throw new Error('Invalid transfer history range');
  const addresses = [...new Set(tokens.map(token => token.address.toLowerCase()))];
  const destinations = [...new Set(contracts.map(pot => addressTopic(pot.address)))];
  if (!addresses.length || !destinations.length) return [{ fromBlock: from.toString(), toBlock: to.toString(), logs: [], filters: [] }];
  const hex = n => `0x${n.toString(16)}`;
  let attempted = 0;
  if (to - from + 1n <= MAX_TRANSFER_RANGE) {
    const filter = { address: addresses, fromBlock: hex(from), toBlock: hex(to), topics: [TRANSFER_TOPIC, null, destinations] };
    try {
      attempted++;
      const logs = await rpc('eth_getLogs', [filter]);
      if (!Array.isArray(logs)) throw new Error('Transfer history unavailable');
      return [{ fromBlock: from.toString(), toBlock: to.toString(), logs, filters: [filter] }];
    } catch { /* A finite singleton filter plan may fit a provider's narrower limits. */ }
  }
  const ranges = (to - from) / MAX_TRANSFER_RANGE + 1n;
  if (ranges * BigInt(addresses.length) * BigInt(destinations.length) > BigInt(MAX_TRANSFER_REQUESTS - attempted)) {
    throw new Error('Transfer history request limit exceeded');
  }
  const chunks = [];
  for (let start = from; start <= to; start += MAX_TRANSFER_RANGE) {
    const end = start + MAX_TRANSFER_RANGE - 1n < to ? start + MAX_TRANSFER_RANGE - 1n : to;
    const filters = addresses.flatMap(address => destinations.map(destination => ({ address,
      fromBlock: hex(start), toBlock: hex(end), topics: [TRANSFER_TOPIC, null, destination] })));
    const logs = [];
    for (let i = 0; i < filters.length; i += TRANSFER_CONCURRENCY) {
      const results = await Promise.all(filters.slice(i, i + TRANSFER_CONCURRENCY).map(filter => rpc('eth_getLogs', [filter])));
      if (results.some(result => !Array.isArray(result))) throw new Error('Transfer history unavailable');
      logs.push(...results.flat());
    }
    chunks.push({ fromBlock: start.toString(), toBlock: end.toString(), logs, filters });
  }
  return chunks;
}

export async function fetchChainInflows(network, fetcher = fetch) {
  const initial = await post(network.subgraphUrl, { query: LANDING_INFLOWS_QUERY }, fetcher);
  const initialMeta = initial.data?._meta;
  const blockNumber = requireRawUint(initialMeta?.block?.number);
  if (initialMeta?.hasIndexingErrors || BigInt(blockNumber) > 2147483647n) throw new Error('Inflow index unavailable');
  const block = { number: blockNumber, ...(initialMeta.block.hash ? { hash: initialMeta.block.hash } : {}),
    ...(initialMeta.block.timestamp != null ? { timestamp: requireRawUint(initialMeta.block.timestamp) } : {}) };
  const source = { chainId: network.chainId, endpoint: network.subgraphUrl, method: 'graphql', indexed: true, snapshot: 'pinned', block };
  const options = { source, pageSize: 1000, maxPages: 10,
    query: async (query, variables) => (await post(network.subgraphUrl, { query, variables }, fetcher)).data };
  const [histories, hubs] = await Promise.all([
    readHistoricalPotFacts(options), readHistoricalPaymasterHubPotFacts(options),
  ]);
  const potFacts = { ...histories, 'paymaster-hub': hubs };
  const contracts = Object.values(potFacts).flatMap(snapshot => {
    const pots = requireCompleteSnapshot(snapshot, { snapshot: 'pinned', block });
    assertSourceBlock(snapshot.source.block, block); assertSourceBlock(block, snapshot.source.block);
    return pots;
  });
  const firstBlock = contracts.reduce((min, p) => BigInt(p.createdAtBlock) < min ? BigInt(p.createdAtBlock) : min, BigInt(blockNumber));
  const streams = await Promise.all(['payments', 'paymasterDepositEvents', 'solidarityEvents'].map(collection =>
    readIndexedNativeInflowFacts({ ...options, collection, fromBlock: firstBlock.toString() })));
  for (const stream of streams) {
    try {
      requireCompleteSnapshot(stream, { scope: source, indexed: true, snapshot: 'pinned', block });
      assertSourceBlock(block, stream.source.block);
    } catch { throw new Error('Inflow history incomplete'); }
  }
  const tokens = getBountyTokenOptions(network.chainId).filter(t => t.isStable);
  const rpc = async (method, params) => (await post(network.rpcUrl, { jsonrpc: '2.0', id: 1, method, params }, fetcher)).result;
  if (BigInt(await rpc('eth_chainId', [])) !== BigInt(network.chainId)) throw new Error('Inflow RPC chain mismatch');
  const height = `0x${BigInt(blockNumber).toString(16)}`;
  const observed = await rpc('eth_getBlockByNumber', [height, false]);
  if (!observed || BigInt(observed.number).toString() !== blockNumber || !/^0x[\da-fA-F]{64}$/.test(observed.hash) ||
      (block.hash && observed.hash.toLowerCase() !== block.hash.toLowerCase()) ||
      (block.timestamp !== undefined && BigInt(observed.timestamp).toString() !== block.timestamp)) throw new Error('Inflow RPC block mismatch');
  const transferChunks = await readInflowTransferChunks({ rpc, tokens, contracts,
    fromBlock: firstBlock.toString(), toBlock: blockNumber });
  const transferLogs = transferChunks.flatMap(chunk => chunk.logs);
  const again = await rpc('eth_getBlockByNumber', [height, false]);
  if (again?.hash?.toLowerCase() !== observed.hash.toLowerCase()) throw new Error('Inflow RPC block changed');
  return aggregateChainInflows({ transferLogs, network, tokens, evidence: { pots: potFacts, streams, block, fromBlock: firstBlock.toString(),
    logSource: { ...source, block, endpoint: network.rpcUrl, method: 'eth_getLogs', indexed: false },
    transferChunks, logCoverage: { status: 'complete', receivedKeys: transferLogs.map(l => `${l.transactionHash}:${l.logIndex}`), missingIds: [], failedIds: [], issues: [] } } });
}

/**
 * Recorded app-supported external inflows on every production chain: gas pool
 * and solidarity deposits; supported stablecoins entering treasury, bounty and
 * executor contracts; indexed native treasury payments. Direct native sends to
 * TaskManager/Executor emit no indexed receive event and cannot be reconstructed
 * by this lightweight public reader. Native deposits are valued at the current
 * USD spot rate, not their historical deposit-day prices.
 * Returns from external exchanges are incoming transfers; event data alone does
 * not reliably attribute those to earlier outgoing funds inside bundled calls.
 */
export async function fetchLandingInflows() {
  if (cached && Date.now() - cached.at < CACHE_DURATION) return cached.value;
  if (pending) return pending;
  pending = Promise.all(
    Object.values(NETWORKS).filter((network) => !network.isTestnet).map((network) => fetchChainInflows(network))
  ).then(async (chains) => {
    const currencies = [...new Set(chains.flatMap((amounts) => Object.entries(amounts)
      .filter(([symbol, amount]) => symbol !== 'USD' && amount > 0n)
      .map(([symbol]) => symbol)))];
    const rates = Object.fromEntries(await Promise.all(currencies.map(async (symbol) =>
      [symbol, await fetchUsdSpotRate(symbol)])));
    const value = summarizeInflows(chains, rates);
    cached = { at: Date.now(), value };
    return value;
  }).finally(() => { pending = null; });
  return pending;
}
