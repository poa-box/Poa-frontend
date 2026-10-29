import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ slots: [], cursor: 0, effects: [] }));
vi.mock('react', async original => {
  const actual = await original();
  const memo = (fn, deps) => {
    const index = fixture.cursor++, previous = fixture.slots[index];
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
import { useOrganizationTotals } from '@/hooks/useOrganizationTotals';
import { print } from 'graphql';

const ORG = `0x${'ee'.repeat(32)}`, AUTH = `0x${'12'.repeat(20)}`, TOKEN = `0x${'34'.repeat(20)}`, HUB = `0x${'56'.repeat(20)}`;
const HASH = `0x${'ab'.repeat(32)}`;
let options, client;
vi.mock('@/util/apolloClient', () => ({ getClient: () => client }));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; }
function OrganizationTotalsHarness(next, effects = true) {
  if (next) options = { ...options, ...next };
  fixture.cursor = 0;
  const result = useOrganizationTotals(options);
  if (effects) for (const effect of fixture.effects.splice(0)) effect();
  return result;
}
const response = () => ({ data: { _meta: { deployment: 'fixture', hasIndexingErrors: false, block: { number: 100, hash: HASH, timestamp: 1000 } },
  organization: { id: options.orgId, executorContract: null, eligibilityModule: null,
    membershipAuthority: { id: options.authority, isRouterBound: true, cutoverAt: '1', acceptedMembershipCount: 0 } },
  participationTokenContract: { id: options.token, totalSupply: '0', organization: { id: options.orgId } },
  educationHubContract: { id: options.hub, organization: { id: options.orgId } },
  subjectMemberships: [], tokenBalances: [], moduleCompletions: [],
} });
async function ready() { OrganizationTotalsHarness(); await vi.waitFor(() => expect(OrganizationTotalsHarness().loading).toBe(false)); return OrganizationTotalsHarness(); }
beforeEach(() => {
  fixture.slots = []; fixture.cursor = 0; fixture.effects = [];
  options = { chainId: 100, endpoint: `https://hook-${Math.random()}.invalid`, orgId: ORG, authority: AUTH, token: TOKEN, hub: HUB };
  client = { query: vi.fn(async () => response()) };
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
});
afterEach(() => { for (const slot of fixture.slots) slot?.cleanup?.(); vi.unstubAllGlobals(); });
describe('actual organization totals hook lifecycle and installed core readers', () => {
  it('returns verified zeros, shares endpoint readers and exposes all-learner totals without a new UI', async () => {
    const result = await ready();
    expect(result.totals).toEqual({ members: 0, holders: 0, completions: 0, learners: 0 });
    expect(result.source.block.hash).toBe(HASH);
    expect(result.snapshots.education.data.rewardTotalRaw.state).toBe('unknown');
    expect(client.query.mock.calls.every(([{ fetchPolicy }]) => fetchPolicy === 'network-only' || fetchPolicy === 'cache-first')).toBe(true);
    expect(client.query.mock.calls.filter(([{ query }]) => print(query).includes('CurrentMemberTotalState'))).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('replaces current totals with unknown on failed refresh, then recovers known zero', async () => {
    const result = await ready();
    client.query.mockRejectedValue(new Error('offline'));
    await result.refetch(); expect(OrganizationTotalsHarness().totals).toBeUndefined(); expect(OrganizationTotalsHarness().error).toMatch(/unavailable/);
    client.query.mockImplementation(async () => response());
    await OrganizationTotalsHarness().refetch(); expect(OrganizationTotalsHarness().totals.members).toBe(0);
  });
  it.each([{ chainId: 42161 }, { endpoint: 'https://other.invalid' }, { orgId: HASH },
    { authority: TOKEN }, { token: HUB }, { hub: AUTH }])('masks stale counts synchronously and rejects late reads for %j', async next => {
    await ready(); const old = deferred(); client.query.mockImplementationOnce(() => old.promise);
    const saved = OrganizationTotalsHarness().refetch, pending = saved();
    await vi.waitFor(() => expect(client.query.mock.calls.at(-1)[0].variables.block).toBeUndefined());
    expect(OrganizationTotalsHarness(next, false).totals).toBeUndefined(); OrganizationTotalsHarness();
    await vi.waitFor(() => expect(OrganizationTotalsHarness().loading).toBe(false));
    old.resolve(response()); await pending;
    expect(OrganizationTotalsHarness().source.chainId).toBe(options.chainId); expect(OrganizationTotalsHarness().source.orgId).toBe(options.orgId);
    const calls = client.query.mock.calls.length; await saved(); expect(client.query).toHaveBeenCalledTimes(calls);
  });
  it('masks a disabled reader immediately', async () => {
    await ready(); expect(OrganizationTotalsHarness({ enabled: false }, false).totals).toBeUndefined();
  });
  it('blocks unresolved bindings and saved retries after unmount', async () => {
    options.authority = undefined; OrganizationTotalsHarness(); await Promise.resolve(); expect(client.query).not.toHaveBeenCalled();
    OrganizationTotalsHarness({ authority: AUTH }); await vi.waitFor(() => expect(OrganizationTotalsHarness().loading).toBe(false));
    const saved = OrganizationTotalsHarness().refetch;
    for (const slot of fixture.slots) slot?.cleanup?.();
    client.query.mockClear(); await saved(); expect(client.query).not.toHaveBeenCalled();
  });
});
