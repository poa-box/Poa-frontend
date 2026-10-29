import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ query: vi.fn(), directory: vi.fn() }));
vi.mock('@/util/apolloClient', () => ({ getClient: endpoint => ({ query: options => f.query(endpoint, options) }) }));
vi.mock('@/util/orgDirectory', () => ({ fetchSupportedOrganizations: (...args) => f.directory(...args) }));
vi.mock('@/util/orgTaskCounts', () => ({ fetchOrgTaskCounts: async () => ({}) }));
import { loadProfileHubDirectory, profileHubOrganization } from '@/context/profileHubDirectory';
const ORG = `0x${'ee'.repeat(32)}`, AUTH = `0x${'12'.repeat(20)}`, HASH = `0x${'ab'.repeat(32)}`;
const networks = [{ chainId: 100, subgraphUrl: 'https://one.invalid', name: 'One' }, { chainId: 42161, subgraphUrl: 'https://two.invalid', name: 'Two' }];
const org = { id: ORG, name: 'Community', membershipAuthority: { id: AUTH }, _network: networks[0] };
function data({ variables }, endpoint) {
  return { data: { _meta: { deployment: 'fixture', hasIndexingErrors: false, block: { number: 100, hash: HASH, timestamp: 1000 } },
    organization: { id: variables.orgId, executorContract: null, eligibilityModule: null,
      membershipAuthority: { id: AUTH, isRouterBound: true, cutoverAt: '1', acceptedMembershipCount: 0 } },
    ...(endpoint === networks[0].subgraphUrl ? { subjectMemberships: [] } : {}),
  } };
}
beforeEach(() => {
  vi.clearAllMocks(); f.query.mockImplementation(async (endpoint, options) => data(options, endpoint));
  f.directory.mockImplementation(async () => Object.defineProperty([{ ...org }], 'snapshot', { value: {} }));
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
});
afterEach(() => vi.unstubAllGlobals());
describe('production profile directory member-total integration', () => {
  it('routes identical organization IDs to separate endpoint caches and publishes known zero versus unavailable', async () => {
    const onDirectory = vi.fn(), onMemberTotals = vi.fn();
    await loadProfileHubDirectory(networks, { force: true, onDirectory, onCounts: vi.fn(), onMemberTotals });
    const members = Object.assign({}, ...onMemberTotals.mock.calls.map(([totals]) => totals));
    const cards = onDirectory.mock.calls[0][0].map(row => profileHubOrganization(row, {}, members));
    expect(cards.map(card => card.totalMembers)).toEqual([0, null]);
    expect(f.query.mock.calls.every(([endpoint]) => networks.some(network => network.subgraphUrl === endpoint))).toBe(true);
    expect(f.query.mock.calls.filter(([, { variables }]) => !variables.block)).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not publish a late count after scope disposal', async () => {
    let complete, active = true;
    f.query.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const onMemberTotals = vi.fn();
    const pending = loadProfileHubDirectory([networks[0]], { force: true, onDirectory: vi.fn(), onCounts: vi.fn(),
      onMemberTotals, isCurrent: () => active });
    await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
    active = false; complete(data({ variables: { orgId: ORG } }, networks[0].subgraphUrl)); await pending;
    expect(onMemberTotals).not.toHaveBeenCalled();
  });
});
