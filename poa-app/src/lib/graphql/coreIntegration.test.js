import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { print } from 'graphql';
import { readIdentityFacts } from '@poa-box/core/reads/identity';
import { createApolloProtocolQuery } from '@/lib/graphql/coreQuery';

const fixture = vi.hoisted(() => ({ clients: new Map(), handler: null, calls: [], noSources: false }));
const chains = [
  { chainId: 42161, url: 'https://home.invalid/graphql', name: 'Home' },
  { chainId: 100, url: 'https://org.invalid/graphql', name: 'Org' },
];
const registries = { 42161: `0x${'1'.repeat(40)}`, 100: `0x${'2'.repeat(40)}` };
vi.mock('@/config/networks', () => ({
  DEFAULT_CHAIN_ID: 42161, DEFAULT_SUBGRAPH_URL: 'https://home.invalid/graphql',
  getAllSubgraphUrls: () => fixture.noSources ? [] : [
    { chainId: 42161, url: 'https://home.invalid/graphql', name: 'Home' },
    { chainId: 100, url: 'https://org.invalid/graphql', name: 'Org' },
  ],
}));
vi.mock('@/config/contracts', () => ({ getUniversalAccountRegistryAddress: (chainId) => `0x${(chainId === 100 ? '2' : '1').repeat(40)}` }));
vi.mock('@/util/apolloClient', () => ({ getClient: (endpoint) => fixture.clients.get(endpoint) }));

const address = (n) => `0x${n.toString(16).padStart(40, '0')}`;
const blockHash = `0x${'a'.repeat(64)}`;
const account = (id, registry, username = 'member', metadata = {}) => ({
  __typename: 'Account', id, user: id, username, isDeleted: false,
  registry: { __typename: 'UniversalAccountRegistry', id: registry },
  profileMetadataHash: null, registeredAt: '1', registeredAtBlock: '1', lastUpdatedAt: '2',
  metadata: { __typename: 'UserMetadata', id: `${id}-profile`, bio: null, avatar: null, github: null, twitter: null, website: null, ...metadata },
});
const response = (accounts, number = 12) => ({ data: { accounts, _meta: { __typename: '_Meta_', block: { __typename: '_Block_', number, hash: blockHash, timestamp: 4 } } } });
let usernames;
beforeEach(async () => {
  fixture.clients.clear(); fixture.calls.length = 0; fixture.noSources = false;
  fixture.handler = () => response([]);
  for (const chain of chains) {
    fixture.clients.set(chain.url, new ApolloClient({
      cache: new InMemoryCache(),
      link: new ApolloLink((operation) => new Observable((observer) => {
        fixture.calls.push({ endpoint: chain.url, document: print(operation.query), variables: operation.variables });
        Promise.resolve().then(() => fixture.handler(chain, operation)).then((value) => {
          operation.getContext().onCoreResponse?.(value); observer.next(value); observer.complete();
        }, (error) => observer.error(error));
      })),
    }));
  }
  vi.resetModules();
  usernames = await import('@/util/crossChainUsername');
});

describe('actual core identity readers behind frontend Apollo routing', () => {
  it('does not represent an unavailable source universe as an empty search or a free name', async () => {
    fixture.noSources = true;
    await expect(usernames.searchUsersByUsernameAcrossChains('member')).rejects.toMatchObject({ name: 'PublicDataUnavailable' });
    await expect(usernames.isUsernameTakenGlobally('member')).rejects.toMatchObject({ name: 'PublicDataUnavailable' });
    expect(fixture.calls).toHaveLength(0);
  });

  it('isolates the same account ID and a second account across endpoints and selects richest metadata', async () => {
    const a = address(10), b = address(11);
    fixture.handler = (chain, operation) => response(operation.variables.addresses.map((id) => account(id, registries[chain.chainId], id === b ? 'second' : 'first',
      chain.chainId === 100 ? { bio: 'Org profile', avatar: 'org-avatar' } : { bio: 'Home profile' })));
    const profile = await usernames.findUserProfileByAddress(a);
    expect(profile).toMatchObject({ address: a, username: 'first', sourceChainId: 100, metadata: { bio: 'Org profile' }, isComplete: true });
    const second = await usernames.findUserProfileByAddress(b);
    expect(second).toMatchObject({ address: b, username: 'second' });
    const map = await usernames.findUserProfilesByAddresses([a, b]);
    expect(map.get(a).username).toBe('first'); expect(map.get(b).username).toBe('second');
    expect(fixture.clients.get(chains[0].url).cache.extract()[`Account:${a}`].metadata.__ref).toBe(`UserMetadata:${a}-profile`);
    const key = `UserMetadata:${a}-profile`;
    expect(fixture.clients.get(chains[0].url).cache.extract()[key].bio).toBe('Home profile');
    expect(fixture.clients.get(chains[1].url).cache.extract()[key].bio).toBe('Org profile');
    expect(fixture.calls.every((call) => call.variables.registry === registries[chains.find((chain) => chain.url === call.endpoint).chainId])).toBe(true);
  });

  it('requests the terminal page after an exactly full 1000-address batch and preserves every result', async () => {
    const ids = Array.from({ length: 1000 }, (_, index) => address(index + 1));
    fixture.handler = (chain, operation) => response(chain.chainId === 42161 && operation.variables.cursor === '0x'
      ? ids.map((id) => account(id, registries[42161])) : []);
    const profiles = await usernames.findUserProfilesByAddresses(ids);
    expect(profiles.size).toBe(1000);
    expect(profiles.coverage.status).toBe('complete');
    expect(fixture.calls.filter((call) => call.endpoint === chains[0].url).map((call) => call.variables.cursor)).toEqual(['0x', ids.at(-1)]);
  });

  it('distinguishes incomplete enumeration from a free name or missing account while retaining a known profile', async () => {
    const id = address(12);
    fixture.handler = (chain) => {
      if (chain.chainId === 100) throw new Error('mock outage');
      return response([]);
    };
    await expect(usernames.isUsernameTakenGlobally('available')).rejects.toMatchObject({ name: 'PublicDataUnavailable' });
    await expect(usernames.findUserProfileByAddress(id)).rejects.toMatchObject({ name: 'PublicDataUnavailable' });
    fixture.handler = (chain) => {
      if (chain.chainId === 100) throw new Error('mock outage');
      return response([account(id, registries[42161])]);
    };
    await fixture.clients.get(chains[0].url).clearStore();
    expect(await usernames.findUserProfileByAddress(address(13)).catch(() => null)).toBeNull(); // Selector mismatch stays unavailable.
    const result = await usernames.findUserProfileByAddress(id);
    expect(result).toMatchObject({ address: id, isComplete: false });
  });

  it('does not accept a registry mismatch, a missing selected scalar, or an indexed deletion as a live identity', async () => {
    const id = address(14);
    fixture.handler = (chain) => response([account(id, registries[chain.chainId === 100 ? 42161 : 100])]);
    await expect(usernames.findUserProfileByAddress(id)).rejects.toMatchObject({ name: 'PublicDataUnavailable' });
    fixture.handler = (chain) => { const row = account(id, registries[chain.chainId]); row.lastUpdatedAt = null; return response([row]); };
    await expect(usernames.findUserProfileByAddress(address(15))).rejects.toMatchObject({ name: 'PublicDataUnavailable' });
    fixture.handler = (chain) => response([{ ...account(address(16), registries[chain.chainId]), isDeleted: true }]);
    expect(await usernames.findUserProfileByAddress(address(16))).toMatchObject({ address: null, isComplete: true });
  });

  it('does not copy the requested block/hash into absent proof on a full terminal page', async () => {
    const id = address(17);
    const source = { chainId: 42161, endpoint: chains[0].url, contract: registries[42161], indexed: true, method: 'graph', snapshot: 'pinned', block: { number: '12', hash: blockHash } };
    const query = createApolloProtocolQuery({ fetchPolicy: 'network-only' });
    fixture.handler = (_chain, operation) => operation.variables.cursor === '0x' ? response([account(id, registries[42161])]) : { data: { accounts: [] } };
    const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let facts;
    try { facts = await readIdentityFacts({ sources: [source], query, selector: { kind: 'addresses', addresses: [id] }, pageSize: 1 }); }
    finally { warning.mockRestore(); }
    expect(fixture.calls.every((call) => call.variables.block.hash === blockHash)).toBe(true);
    expect(facts.coverage.status).toBe('incomplete');
    expect(facts.data).toHaveLength(1);
    expect(facts.coverage.issues.some((issue) => issue.code === 'BLOCK_EVIDENCE_UNAVAILABLE')).toBe(true);
  });

  it('ranks complete substring search and batch resolution with explicit home-chain precedence', async () => {
    const a = address(18), b = address(19), c = address(20);
    fixture.handler = (chain) => response([account(a, registries[chain.chainId], 'alice'), account(b, registries[chain.chainId], 'alice_team'), account(c, registries[chain.chainId], 'malice')]);
    const results = await usernames.searchUsersByUsernameAcrossChains('alice', 3);
    expect(results.map((row) => row.username)).toEqual(['alice', 'alice_team', 'malice']);
    const resolved = await usernames.resolveUsernamesAcrossChains(['Alice', 'alice_team', 'malice']);
    expect(resolved.resolved.get('alice')).toBe(a);
    expect(resolved.notFound).toEqual([]);
    expect(fixture.calls.some((call) => call.variables.names?.includes('alice'))).toBe(true);
  });
});

describe('frontend membership cards keep current authority and historical contributions', () => {
  it.each([[false, 'MiXeD', 'Shares'], [null, 'MiXeD', 'Shares'], [true, 'MiXeD', 'MiXeD'], [true, '', 'Shares'], [true, null, 'Shares']])('honors organization label configuration (flag %s, symbol %s) without fabricating unknown history', async (enabled, symbol, expectedLabel) => {
    const user = address(21), orgId = `0x${'a'.repeat(64)}`, oldOrgId = `0x${'b'.repeat(64)}`;
    const organization = (id) => ({ id, name: 'Fixture', metadataHash: null,
      metadata: { id: `${id}-meta`, logo: null, description: null, useTokenSymbol: enabled },
      participationToken: symbol === null ? null : { symbol },
      membershipAuthority: { id: registries[100], isRouterBound: true, cutoverAt: '1750000000' } });
    const history = { id: `${oldOrgId}-${user}`, address: user, firstSeenAt: '100', lastActiveAt: '200', participationTokenBalance: '0',
      totalTasksCompleted: '4', totalVotes: '0', totalModulesCompleted: '0', organization: organization(oldOrgId) };
    const membership = { id: 'membership', user, accepted: true, eligible: false, isMember: false, claimable: false, acceptedAt: '1', seededWhilePaused: true,
      ruleKind: 'None', emailVerified: false, vouchCount: 0, vouchEpoch: '0', vouchMet: false, eligibilitySource: 'None',
      subject: { subjectId: ((1n << 224n) | (1n << 208n)).toString(), kind: 'Role', defaultAllow: true, vouchConfig: null },
      organization: organization(orgId), userEntity: null };
    fixture.handler = (chain, operation) => ({ data: { _meta: response([]).data._meta,
      ...(operation.operationName === 'AuthorityMembershipCardsPage' ? { subjectMemberships: chain.chainId === 42161 ? [membership] : [] }
        : { users: chain.chainId === 42161 ? [history] : [] }) } });
    const cards = await usernames.findUserOrgsAcrossChains(user);
    expect(cards.isComplete).toBe(true);
    const active = cards.find((card) => card.organization.id === orgId);
    expect(active).toMatchObject({ membershipStatus: 'Active', historyIndexed: false, firstSeenAt: null, participationTokenBalance: null, tokenLabel: expectedLabel });
    const former = cards.find((card) => card.organization.id === oldOrgId);
    expect(former).toMatchObject({ membershipStatus: 'Inactive', historyIndexed: true, firstSeenAt: '100', totalTasksCompleted: '4', participationTokenBalance: '0' });
  });
});
