import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getAllSubgraphUrls, getNetworkByChainId } from '@/config/networks';
import { fetchProtocolChainData, aggregateProtocolChains } from '@/lib/graphql/protocolData';
import { RefreshEvent, useRefreshSubscription } from '@/context/RefreshContext';
import { requireRawUint } from '@poa-box/core/amounts';
import { waitForSubgraphBlock } from '@/util/waitForSubgraph';

/** Public indexed data uses each endpoint's Apollo cache. No signing or RPC runtime. */
export function useProtocolData() {
  const chains = useMemo(() => getAllSubgraphUrls(), []);
  const [chainData, setChainData] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [unavailableChains, setUnavailableChains] = useState([]);
  const lifecycle = useRef({ active: false, generations: new Map(), pending: new Map(), minimumBlocks: new Map(), initialized: false, data: {} });
  const refetch = useCallback(async (selected = chains, event) => {
    const state = lifecycle.current;
    if (!state.active) return;
    if (selected.length === 0) { setIsLoading(false); return; }
    setIsLoading(Object.keys(state.data).length === 0);
    await Promise.all(selected.map(async chain => {
      const generation = (state.generations.get(chain.chainId) || 0) + 1;
      state.generations.set(chain.chainId, generation);
      state.pending.set(chain.chainId, generation);
      const current = () => state.active && state.generations.get(chain.chainId) === generation;
      try {
        const observedMinimum = state.minimumBlocks.get(chain.chainId);
        const eventBlock = event?.blockNumber == null ? undefined : requireRawUint(event.blockNumber);
        const minimumBlockNumber = eventBlock !== undefined && (observedMinimum === undefined || BigInt(eventBlock) > BigInt(observedMinimum))
          ? eventBlock : observedMinimum;
        if (minimumBlockNumber !== undefined) state.minimumBlocks.set(chain.chainId, minimumBlockNumber);
        if (eventBlock !== undefined) await waitForSubgraphBlock(chain.url, minimumBlockNumber);
        if (!current()) return;
        const value = await fetchProtocolChainData(chain, getNetworkByChainId(chain.chainId), {
          minimumBlockNumber,
        });
        if (!current()) return;
        if (value.source?.block?.number != null) state.minimumBlocks.set(chain.chainId, requireRawUint(value.source.block.number));
        state.data = { ...state.data, [chain.chainId]: value };
        setChainData(state.data);
        setUnavailableChains(previous => previous.filter(id => id !== chain.chainId));
      } catch {
        if (!current()) return;
        // Preserve known rows, but never count an unavailable source in totals.
        setUnavailableChains(previous => [...new Set([...previous, chain.chainId])]);
      } finally {
        if (current()) {
          state.pending.delete(chain.chainId);
          if (state.pending.size === 0) state.initialized = true;
          setIsLoading(!state.initialized);
        }
      }
    }));
  }, [chains]);
  useEffect(() => {
    const state = lifecycle.current;
    state.active = true;
    void refetch();
    return () => { state.active = false; state.pending.clear(); };
  }, [refetch]);
  useRefreshSubscription(RefreshEvent.SOLIDARITY_DONATED, ({ data }) => {
    const chain = chains.find(item => item.chainId === data?.chainId && item.url === data.endpoint);
    const knownSource = lifecycle.current.data[chain?.chainId]?.source;
    if (!chain || typeof data.paymasterAddress !== 'string' || !knownSource?.contract || knownSource.endpoint !== data.endpoint ||
        knownSource.contract.toLowerCase() !== data.paymasterAddress?.toLowerCase()) return;
    void refetch([chain], data);
  }, [chains, refetch]);
  const aggregated = useMemo(() => aggregateProtocolChains(Object.fromEntries(
    Object.entries(chainData).filter(([id]) => !unavailableChains.includes(Number(id)))
  ), chains.length), [chainData, chains, unavailableChains]);
  return { isLoading, chains: chainData, aggregated, unavailableChains, refetch: () => refetch() };
}
