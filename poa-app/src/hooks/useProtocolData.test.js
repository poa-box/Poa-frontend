import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ slots: [], cursor: 0, effects: [], fetch: vi.fn(), wait: vi.fn(), listener: null, subscribe: vi.fn() }));
vi.mock('react', async original => {
  const actual = await original();
  const memo = (fn, deps) => { const index = fixture.cursor++, previous = fixture.slots[index];
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) fixture.slots[index] = { deps, value: fn() };
    return fixture.slots[index].value;
  };
  return { ...actual,
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
    useRef: initial => { const index = fixture.cursor++; return fixture.slots[index] ||= { current: initial }; },
    useState: initial => { const index = fixture.cursor++; fixture.slots[index] ||= { value: initial };
      return [fixture.slots[index].value, next => { fixture.slots[index].value = typeof next === 'function' ? next(fixture.slots[index].value) : next; }]; },
    useEffect: (fn, deps) => { const index = fixture.cursor++, previous = fixture.slots[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) fixture.effects.push(() => {
        previous?.cleanup?.(); fixture.slots[index] = { deps, cleanup: fn() };
      }); },
  };
});
vi.mock('@/config/networks', () => ({ getAllSubgraphUrls: () => [
  { chainId: 100, name: 'Gnosis', url: 'https://gnosis.invalid' },
  { chainId: 42161, name: 'Arbitrum', url: 'https://arbitrum.invalid' },
], getNetworkByChainId: () => ({ nativeCurrency: { symbol: 'XDAI' } }) }));
vi.mock('@/lib/graphql/protocolData', async original => ({ ...await original(), fetchProtocolChainData: (...args) => fixture.fetch(...args) }));
vi.mock('@/context/RefreshContext', () => ({ RefreshEvent: { SOLIDARITY_DONATED: 'protocol:solidarity_donated' },
  useRefreshSubscription: (event, listener) => { fixture.subscribe(event); fixture.listener = listener; } }));
vi.mock('@/util/apolloClient', () => ({ getClient: vi.fn() }));
vi.mock('@/util/waitForSubgraph', () => ({ waitForSubgraphBlock: (...args) => fixture.wait(...args) }));
import { useProtocolData } from '@/hooks/useProtocolData';
const HUB = `0x${'1'.repeat(40)}`;
const event = (extra = {}) => ({ data: { chainId: 100, endpoint: 'https://gnosis.invalid', paymasterAddress: HUB, blockNumber: '30', ...extra } });
const result = chain => ({ source: { chainId: chain.chainId, endpoint: chain.url, contract: HUB, block: { number: '10' } },
  orgStats: { totalOrgs: '1', totalContracts: '2' }, accountStats: { totalAccounts: '3' }, infrastructure: { beaconCount: '4' }, gasUsage: { totalUserOps: '5' } });
function ProtocolHarness() { fixture.cursor = 0; const output = useProtocolData(); for (const effect of fixture.effects.splice(0)) effect(); return output; }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; }
function cleanup() { for (const slot of fixture.slots) slot?.cleanup?.(); }
beforeEach(() => {
  vi.clearAllMocks(); fixture.slots = []; fixture.cursor = 0; fixture.effects = [];
  fixture.fetch.mockImplementation(async (chain, _network, options) => ({ ...result(chain), source: { ...result(chain).source, block: { number: options?.minimumBlockNumber || '10' } } })); fixture.wait.mockResolvedValue();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function ready() { ProtocolHarness(); await vi.waitFor(() => expect(ProtocolHarness().isLoading).toBe(false)); }

describe('public protocol chain refresh lifecycle', () => {
  it('refetches only the donated source after its indexing wait and passes the exact target block', async () => {
    await ready(); fixture.fetch.mockClear();
    expect(fixture.subscribe).toHaveBeenCalledWith('protocol:solidarity_donated');
    const delay = deferred(); fixture.wait.mockReturnValue(delay.promise);
    fixture.listener(event());
    expect(fixture.wait).toHaveBeenCalledExactlyOnceWith('https://gnosis.invalid', '30');
    expect(fixture.fetch).not.toHaveBeenCalled();
    expect(ProtocolHarness().chains[42161]).toBeDefined();
    delay.resolve();
    await vi.waitFor(() => expect(fixture.fetch).toHaveBeenCalledOnce());
    expect(fixture.fetch.mock.calls[0][0].chainId).toBe(100);
    expect(fixture.fetch.mock.calls[0][2]).toEqual({ minimumBlockNumber: '30' });
    expect(ProtocolHarness().aggregated.isComplete).toBe(true);
  });
  it('retains the newest confirmation block when a delayed older event arrives', async () => {
    await ready(); fixture.listener(event({ blockNumber: '40' }));
    await vi.waitFor(() => expect(ProtocolHarness().chains[100].source.block.number).toBe('40'));
    fixture.fetch.mockClear(); fixture.listener(event({ blockNumber: '20' }));
    await vi.waitFor(() => expect(fixture.fetch).toHaveBeenCalledOnce());
    expect(fixture.fetch.mock.calls[0][2].minimumBlockNumber).toBe('40');
    expect(fixture.wait).toHaveBeenLastCalledWith('https://gnosis.invalid', '40');
  });
  it('ignores foreign chain, endpoint and hub events without any network or wait', async () => {
    await ready(); fixture.fetch.mockClear();
    for (const extra of [{ chainId: 1 }, { endpoint: 'https://foreign.invalid' }, { paymasterAddress: `0x${'2'.repeat(40)}` }, { paymasterAddress: undefined }, { paymasterAddress: 1 }]) fixture.listener(event(extra));
    expect(fixture.wait).not.toHaveBeenCalled(); expect(fixture.fetch).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves known chain rows on a failed refresh, marks totals unknown and recovers on real retry', async () => {
    await ready(); const known = ProtocolHarness().chains[100];
    fixture.fetch.mockImplementation(async chain => { if (chain.chainId === 100) throw new Error('outage'); return result(chain); });
    fixture.listener(event());
    await vi.waitFor(() => expect(ProtocolHarness().unavailableChains).toEqual([100]));
    expect(ProtocolHarness().chains[100]).toBe(known); expect(ProtocolHarness().aggregated.totalOrgs).toBeNull();
    fixture.fetch.mockImplementation(async (chain, _network, options) => ({ ...result(chain), source: { ...result(chain).source, block: { number: options?.minimumBlockNumber || '10' } } }));
    fixture.fetch.mockClear(); await ProtocolHarness().refetch();
    expect(fixture.fetch.mock.calls.find(call => call[0].chainId === 100)[2].minimumBlockNumber).toBe('30'); expect(ProtocolHarness().unavailableChains).toEqual([]); expect(ProtocolHarness().aggregated.totalOrgs).toBe('2');
  });
  it('refuses out-of-order refresh responses and invalidates in-flight waits and saved retry after unmount', async () => {
    await ready(); const old = deferred(), latest = deferred();
    fixture.fetch.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => latest.promise);
    fixture.listener(event({ blockNumber: undefined })); fixture.listener(event({ blockNumber: undefined }));
    latest.resolve({ ...result({ chainId: 100, url: 'https://gnosis.invalid' }), marker: 'latest' });
    await vi.waitFor(() => expect(ProtocolHarness().chains[100].marker).toBe('latest'));
    old.resolve({ ...result({ chainId: 100, url: 'https://gnosis.invalid' }), marker: 'old' });
    await Promise.resolve(); await Promise.resolve(); expect(ProtocolHarness().chains[100].marker).toBe('latest');
    const delay = deferred(); fixture.wait.mockReturnValue(delay.promise);
    fixture.listener(event()); const retry = ProtocolHarness().refetch; cleanup(); fixture.fetch.mockClear();
    delay.resolve(); await Promise.resolve(); await retry();
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
  it('keeps first-load failures distinct from a confirmed empty protocol', async () => {
    fixture.fetch.mockRejectedValue(new Error('outage')); await ready();
    expect(ProtocolHarness()).toMatchObject({ chains: {}, unavailableChains: [100, 42161], aggregated: { totalOrgs: null, isComplete: false } });
  });
});
