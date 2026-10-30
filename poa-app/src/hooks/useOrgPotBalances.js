/** Action-only, bounded, same-block reads of the organization's three distinct pots. */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getAddress } from 'viem';
import { multicall } from 'viem/actions';
import { arbitrum, gnosis } from 'viem/chains';
import { gql } from '@apollo/client';
import { usePOContext } from '@/context/POContext';
import { RefreshEvent, useRefreshSubscription } from '@/context/RefreshContext';
import { createPublicClientForChain } from '@/services/web3/utils/publicChainClient';
import { getNetworkByChainId } from '@/config/networks';
import { getClient } from '@/util/apolloClient';
import { treasuryTokenAddress } from '@poa-box/core/treasury/planning';
import { requireRawUint } from '@poa-box/core/amounts';
import { knownFact } from '@poa-box/core/data/facts';

const MAX_DISTRIBUTIONS_READ = 50;
const DISTRIBUTION_BATCH_SIZE = 20;
const HEAD = gql`query TreasuryPlanningHead { _meta { block { number hash } hasIndexingErrors } }`;
const checksum = address => getAddress(String(address).toLowerCase());
const coverage = keys => ({ status: 'complete', receivedKeys: keys, missingIds: [], failedIds: [], issues: [] });
const EMPTY = Object.freeze({ executor: null, paymentManager: null, bountyPool: null, distributions: [],
  distributionsTruncated: false, planningEvidence: null });

/** Injected clients also make this safety boundary testable without a network. */
export async function readOrgPotBalances({ client, apollo, network, orgId, token = '', decimals = 18,
  executor, paymentManager, bountyPool }) {
  const [{ PaymentManagerAbi }, { ERC20Abi }, readers] = await Promise.all([
    import('@poa-box/core/abis/PaymentManager'), import('@poa-box/core/abis/ERC20'), import('@poa-box/core/reads/treasury'),
  ]);
  const actualChain = await client.request({ method: 'eth_chainId' });
  if (BigInt(actualChain) !== BigInt(network.chainId)) throw new Error('Treasury chain mismatch');
  const head = await apollo.query({ query: HEAD, fetchPolicy: 'network-only' });
  if (head.errors?.length || head.data?._meta?.hasIndexingErrors) throw new Error('Treasury index unavailable');
  const indexed = head.data?._meta?.block;
  const number = requireRawUint(indexed?.number);
  const observed = await client.request({ method: 'eth_getBlockByNumber', params: [`0x${BigInt(number).toString(16)}`, false] });
  if (!observed || BigInt(observed.number).toString() !== number || !/^0x[\da-fA-F]{64}$/.test(observed.hash)
      || (indexed.hash && indexed.hash.toLowerCase() !== observed.hash.toLowerCase())) throw new Error('Treasury block mismatch');
  const block = { number, hash: observed.hash };
  const contracts = { ...(executor ? { executor: checksum(executor) } : {}),
    ...(paymentManager ? { paymentManager: checksum(paymentManager) } : {}),
    ...(bountyPool ? { taskManager: checksum(bountyPool) } : {}) };
  const scope = { chainId: network.chainId, orgId, contracts };
  const asset = { chainId: network.chainId, address: treasuryTokenAddress(token ? checksum(token) : ''), decimals };
  const sourceFor = contract => ({ ...scope, contract, endpoint: network.rpcUrl, method: 'eth_call', indexed: false, snapshot: 'pinned', block });
  const balance = async holder => {
    if (!holder) return null;
    const raw = asset.address === treasuryTokenAddress('')
      ? await client.getBalance({ address: checksum(holder), blockNumber: BigInt(number) })
      : await client.readContract({ address: asset.address, abi: ERC20Abi, functionName: 'balanceOf', args: [checksum(holder)], blockNumber: BigInt(number) });
    return requireRawUint(raw.toString());
  };
  const source = paymentManager ? sourceFor(checksum(paymentManager)) : null;
  const creationBlocks = {};
  if (source) {
    const graphSource = { ...source, endpoint: network.subgraphUrl, method: 'graphql', indexed: true };
    const history = await readers.readDistributionHistoryFacts({ source: graphSource, pageSize: 50, maxPages: 2,
      query: async (document, variables) => {
        const result = await apollo.query({ query: gql(document), variables, fetchPolicy: 'network-only' });
        if (result.errors?.length) throw new Error('Treasury history unavailable');
        return result.data;
      } });
    // A partial index cannot attest creation facts. Unknown facts block free round closure.
    if (history.coverage.status === 'complete') {
      for (const row of history.data) creationBlocks[row.distributionId] = { row, fact: knownFact(row.createdAtBlock, history.source) };
    }
  }
  const creationFacts = {};
  let roundCounter;
  let roundsPromise;
  // Core still proves every ID against the authoritative counter. Its per-ID
  // reader consumes this one bounded preload rather than issuing one RPC per ID.
  const preloadRounds = () => roundsPromise ||= (async () => {
    const count = Number(roundCounter);
    if (!Number.isSafeInteger(count) || count < 0 || count > MAX_DISTRIBUTIONS_READ) throw new Error('Treasury round bound unavailable');
    const ids = Array.from({ length: count }, (_, i) => String(i + 1));
    const batches = [];
    for (let start = 0; start < ids.length; start += DISTRIBUTION_BATCH_SIZE) batches.push(ids.slice(start, start + DISTRIBUTION_BATCH_SIZE));
    const results = await Promise.allSettled(batches.map(batch => {
      const args = { blockNumber: BigInt(number), allowFailure: true,
        contracts: batch.map(id => ({ address: source.contract, abi: PaymentManagerAbi,
          functionName: 'getDistribution', args: [BigInt(id)] })) };
      if (client.multicall) return client.multicall(args);
      // The lightweight host client omits chain contract metadata. Supply viem's
      // chain-specific deployment explicitly without widening that shared client.
      const deployment = [arbitrum, gnosis].find(chain => chain.id === network.chainId)?.contracts?.multicall3;
      if (!deployment || BigInt(number) < BigInt(deployment.blockCreated)) throw new Error('Treasury batch reader unavailable at this block');
      return multicall(client, { ...args, multicallAddress: deployment.address, batchSize: 0 });
    }));
    const rows = new Map();
    results.forEach((result, batchIndex) => batches[batchIndex].forEach((id, index) => {
      const entry = result.status === 'fulfilled' ? result.value[index] : null;
      if (entry?.status === 'success') rows.set(id, entry.result);
    }));
    return rows;
  })();
  const settled = await Promise.allSettled([
    balance(executor), balance(bountyPool),
    source ? readers.readPaymentManagerPlanningSnapshot({ source, asset, maxRounds: MAX_DISTRIBUTIONS_READ,
      reader: {
        readCounter: async () => {
          roundCounter = requireRawUint(String(await client.readContract({ address: source.contract, abi: PaymentManagerAbi,
            functionName: 'distributionCounter', blockNumber: BigInt(number) })));
          return knownFact(roundCounter, source);
        },
        readBalance: async () => knownFact(await balance(paymentManager), { ...source,
          contract: asset.address === treasuryTokenAddress('') ? source.contract : asset.address, account: source.contract }),
        readDistribution: async id => {
          const raw = (await preloadRounds()).get(id);
          if (!raw) throw new Error('Treasury round unavailable');
          const pick = (key, index) => raw[key] ?? raw[index];
          const row = { distributionId: id, payoutToken: pick('payoutToken', 0), totalAmount: String(pick('totalAmount', 1)),
            checkpointBlock: String(pick('checkpointBlock', 2)), merkleRoot: pick('merkleRoot', 3),
            totalClaimed: String(pick('totalClaimed', 4)), finalized: pick('finalized', 5) };
          const indexedRow = creationBlocks[id]?.row;
          if (indexedRow && ['payoutToken', 'totalAmount', 'checkpointBlock', 'merkleRoot', 'totalClaimed'].every(key =>
            String(indexedRow[key]).toLowerCase() === String(row[key]).toLowerCase()) && (indexedRow.status === 'Finalized') === row.finalized) {
            creationFacts[id] = creationBlocks[id].fact;
          }
          return knownFact(row, source);
        },
      }, creationBlocks: creationFacts }) : Promise.resolve(null),
  ]);
  const again = await client.request({ method: 'eth_getBlockByNumber', params: [`0x${BigInt(number).toString(16)}`, false] });
  if (again?.hash?.toLowerCase() !== observed.hash.toLowerCase()) throw new Error('Treasury block changed');
  const value = i => settled[i].status === 'fulfilled' ? settled[i].value : null;
  const pmObserved = value(2);
  const narrowed = pmObserved ? readers.paymentManagerPlanningState(pmObserved) : null;
  const evidence = { scope, block, asset, minClaimPeriodBlocks: '0',
    executor: value(0) === null ? null : { source: sourceFor(checksum(executor)), data: { asset, rawAmount: value(0) }, coverage: coverage(['balance']) },
    paymentManager: narrowed?.state === 'known' ? narrowed.value : null };
  const error = settled.find(r => r.status === 'rejected')?.reason ||
    (narrowed?.state === 'unknown' ? new Error('Treasury rounds incomplete') : null);
  return { executor: value(0), bountyPool: value(1), paymentManager: pmObserved?.data.balanceRaw.state === 'known' ? pmObserved.data.balanceRaw.value : null,
    distributions: pmObserved?.data.rounds.map(row => ({ ...row, id: row.distributionId })) || [],
    distributionsTruncated: pmObserved?.coverage.status !== 'complete', planningEvidence: evidence, error,
    coverage: pmObserved?.coverage || null };
}

export function useOrgPotBalances({ token = '', decimals = 18, enabled = true } = {}) {
  const { orgId, subgraphUrl, orgChainId, executorContractAddress, paymentManagerAddress, taskManagerContractAddress } = usePOContext();
  const [state, setState] = useState({ loading: false, error: null, data: EMPTY });
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const scopeKey = [orgId, subgraphUrl, orgChainId, token, decimals, executorContractAddress, paymentManagerAddress, taskManagerContractAddress, enabled].join(':');
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  const fetchAll = useCallback(async () => {
    if (!mounted.current || scopeRef.current !== scopeKey) return null;
    const request = ++generation.current;
    if (!enabled || !orgChainId || !orgId || !subgraphUrl) { setState({ loading: false, error: null, data: EMPTY, scopeKey }); return null; }
    const current = () => mounted.current && generation.current === request && scopeRef.current === scopeKey;
    setState({ loading: true, error: null, data: EMPTY, scopeKey });
    try {
      const data = await readOrgPotBalances({ client: createPublicClientForChain(orgChainId), apollo: getClient(subgraphUrl),
        network: { ...getNetworkByChainId(orgChainId), subgraphUrl }, orgId, token, decimals,
        executor: executorContractAddress, paymentManager: paymentManagerAddress, bountyPool: taskManagerContractAddress });
      if (current()) { setState({ loading: false, error: data.error, data, scopeKey }); return data; }
      return null;
    } catch (error) {
      if (current()) { setState({ loading: false, error, data: EMPTY, scopeKey }); return { ...EMPTY, error }; }
      return null;
    }
  }, [enabled, orgChainId, orgId, subgraphUrl, token, decimals, executorContractAddress, paymentManagerAddress, taskManagerContractAddress, scopeKey]);
  useEffect(() => { const sequence = generation; fetchAll(); return () => { sequence.current++; }; }, [fetchAll]);
  useRefreshSubscription([RefreshEvent.TREASURY_DEPOSITED, RefreshEvent.PROPOSAL_COMPLETED], fetchAll, [fetchAll]);
  return useMemo(() => ({ ...(state.scopeKey === scopeKey ? state.data : EMPTY),
    loading: state.scopeKey === scopeKey ? state.loading : !!(enabled && orgChainId && orgId && subgraphUrl),
    error: state.scopeKey === scopeKey ? state.error : null,
    addresses: { executor: executorContractAddress || '', paymentManager: paymentManagerAddress || '', bountyPool: taskManagerContractAddress || '' },
    refetch: fetchAll }), [state, scopeKey, enabled, orgChainId, orgId, subgraphUrl, executorContractAddress, paymentManagerAddress, taskManagerContractAddress, fetchAll]);
}
export default useOrgPotBalances;
