import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ slots: [], cursor: 0, effects: [], name: 'Test6', data: null, lookup: vi.fn(), query: vi.fn(), totalsQuery: vi.fn(), totals: {} }));
vi.mock('react', async original => {
  const actual = await original();
  const state = initial => {
    const index = fixture.cursor++;
    fixture.slots[index] ||= { value: typeof initial === 'function' ? initial() : initial };
    return [fixture.slots[index].value, next => { fixture.slots[index].value = typeof next === 'function' ? next(fixture.slots[index].value) : next; }];
  };
  const memo = (compute, deps) => {
    const index = fixture.cursor++, previous = fixture.slots[index];
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) fixture.slots[index] = { deps, value: compute() };
    return fixture.slots[index].value;
  };
  const hooks = {
    useState: state,
    useReducer: (reducer, initial) => { const [value, set] = state(initial); return [value, action => set(previous => reducer(previous, action))]; },
    useRef: initial => { const index = fixture.cursor++; return fixture.slots[index] ||= { current: initial }; },
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect: (fn, deps) => {
      const index = fixture.cursor++, previous = fixture.slots[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) fixture.effects.push(() => {
        previous?.cleanup?.(); fixture.slots[index] = { deps, cleanup: fn() };
      });
    },
  };
  return { ...actual, ...hooks, default: { ...actual.default, ...hooks } };
});
vi.mock('next/router', () => ({ useRouter: () => ({ query: {}, pathname: '/home' }) }));
vi.mock('@apollo/client', () => ({ useQuery: (_document, options) => { fixture.query(options); return { data: fixture.data, loading: false, refetch: vi.fn() }; } }));
vi.mock('@/util/queries', () => ({ FETCH_ORG_FULL_DATA: {} }));
vi.mock('@/hooks/useOrgName', () => ({ useOrgNameState: () => ({ orgName: fixture.name, resolved: true }) }));
vi.mock('@/context/ipfsContext', () => ({ useIPFScontext: () => ({ safeFetchFromIpfs: vi.fn() }) }));
vi.mock('@/context/IdentityContext', () => ({ useIdentityContext: () => ({ seedIdentities: vi.fn() }) }));
vi.mock('@/context/RefreshContext', () => ({ useRefreshSubscription() {}, RefreshEvent: {} }));
vi.mock('@/hooks/useOrganizationTotals', () => ({ useOrganizationTotals: options => {
  fixture.totalsQuery(options);
  return { ...fixture.totals, refetch: vi.fn() };
} }));
vi.mock('@/hooks/useEducationRead', () => ({ useEducationRead: () => ({ refetch: vi.fn() }) }));
vi.mock('@/config/networks', () => ({ getAllSubgraphUrls: () => [{ chainId: 100 }], getSubgraphUrl: chain => chain ? `https://chain-${chain}.invalid` : null }));
vi.mock('@/util/apolloClient', () => ({ useSubgraphClient: endpoint => endpoint }));
vi.mock('@/util/orgLookup', () => ({ lookupOrganization: options => fixture.lookup(options) }));
vi.mock('@/util/orgSnapshot', () => ({ fetchOrganizationSnapshot: vi.fn(), seedOrganizationSnapshot: () => true }));
import { POProvider } from '@/context/POContext';
const orgId = `0x${'11'.repeat(32)}`, otherId = `0x${'22'.repeat(32)}`;
const hub = `0x${'33'.repeat(20)}`, invites = `0x${'44'.repeat(20)}`, zero = `0x${'00'.repeat(20)}`;
function render() {
  fixture.cursor = 0;
  const value = POProvider({ children: null }).props.value;
  for (const effect of fixture.effects.splice(0)) effect();
  return value;
}
async function settle() { for (let i = 0; i < 4; i++) { render(); await Promise.resolve(); } return render(); }
beforeEach(() => {
  fixture.slots = []; fixture.cursor = 0; fixture.effects = []; fixture.name = 'Test6'; fixture.data = null;
  fixture.lookup.mockReset().mockResolvedValue({ org: { id: orgId, chainId: 100 } });
  fixture.query.mockClear(); fixture.totalsQuery.mockClear(); fixture.totals = {};
});
afterEach(() => { for (const slot of fixture.slots) slot?.cleanup?.(); });
describe('actual POProvider optional module dispatch', () => {
  it('passes the indexed authority, token and education addresses to aggregate readers and masks them on navigation', async () => {
    const authority = `0x${'55'.repeat(20)}`, token = `0x${'66'.repeat(20)}`;
    fixture.data = { organization: { id: orgId, membershipAuthority: { id: authority },
      participationToken: { id: token }, educationHub: { id: hub } } };
    const host = await settle();
    expect(host).toMatchObject({ participationTokenAddress: token, educationHubAddress: hub });
    expect(fixture.totalsQuery.mock.calls.at(-1)[0]).toEqual({ chainId: 100, endpoint: 'https://chain-100.invalid',
      orgId, authority, token, hub, enabled: true });
    fixture.name = 'Other';
    render();
    expect(fixture.totalsQuery.mock.calls.at(-1)[0]).toMatchObject({ orgId: null,
      authority: undefined, token: undefined, hub: undefined, enabled: false });
  });

  it.each([
    [{}, undefined, 'Shares'], [{ useTokenSymbol: false }, 'mIx', 'Shares'],
    [{ useTokenSymbol: true }, 'mIx', 'mIx'], [{ useTokenSymbol: true }, '', 'Shares'],
  ])('publishes verified totals and canonical reward label %j / %s', async (metadata, symbol, label) => {
    fixture.totals = { totals: { members: 0, holders: 2, completions: 3, learners: 2 },
      coverage: { holders: { status: 'complete' } }, snapshots: { holders: { data: { balanceTotalRaw: { state: 'known', value: '2' } } },
        education: { data: { learners: { state: 'known', value: '2' } } } } };
    fixture.data = { organization: { id: orgId, participationToken: { id: hub, symbol }, metadata: { ...metadata, taskPayoutHourlyRate: 1 } } };
    const host = await settle();
    expect(host).toMatchObject({ poMembers: 0, currentHolderCount: 2, currentHolderBalanceRaw: '2', tokenLabel: label });
    expect(host.leaderboardCoverage.status).toBe('preview');
    expect(host.educationCompletionTotals.data.learners.value).toBe('2');
  });

  it.each([
    [{ educationHub: { id: hub }, zkEmailInvites: { id: invites } }, hub, invites, true],
    [{}, '', '', false],
    [{ educationHub: { id: zero }, zkEmailInvites: { id: zero } }, zero, zero, false],
  ])('processes present, absent and zero module addresses: %j', async (modules, educationHubAddress, zkEmailInvitesAddress, enabled) => {
    fixture.data = { organization: { id: orgId, ...modules, metadata: { description: 'Current description', taskPayoutHoursOnly: false } } };
    const host = await settle();
    expect(host).toMatchObject({ orgId, orgChainId: 100, poContextLoading: false, poDescription: 'Current description',
      educationHubAddress, zkEmailInvitesAddress, educationHubEnabled: enabled, zkEmailInvitesEnabled: enabled });
    expect(fixture.query.mock.calls.at(-1)[0]).toMatchObject({ client: 'https://chain-100.invalid', variables: { orgId } });
  });
  it('masks previous module addresses immediately and rejects retained Apollo data and late lookup on scope change', async () => {
    fixture.data = { organization: { id: orgId, educationHub: { id: hub }, zkEmailInvites: { id: invites } } };
    expect((await settle()).educationHubAddress).toBe(hub);
    let completeLookup;
    fixture.lookup.mockImplementationOnce(() => new Promise(resolve => { completeLookup = resolve; }));
    fixture.name = 'Other';
    expect(render()).toMatchObject({ orgId: null, educationHubAddress: '', zkEmailInvitesAddress: '', educationHubEnabled: false });
    fixture.name = 'Third';
    fixture.lookup.mockResolvedValue({ org: { id: otherId, chainId: 100 } });
    expect((await settle()).educationHubAddress).toBe('');
    completeLookup({ org: { id: orgId, chainId: 100 } });
    expect((await settle()).orgId).toBe(otherId);
    expect(render()).toMatchObject({ educationHubAddress: '', zkEmailInvitesAddress: '' });
    fixture.data = { organization: { id: otherId, metadata: { description: 'Fresh', taskPayoutHoursOnly: false } } };
    expect((await settle()).poDescription).toBe('Fresh');
  });
});
