import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/graphql/coreQuery', () => ({ createApolloProtocolQuery: () => () => { throw new Error('Inject a mock query'); } }));
import { resolveAccountWriteSource } from '@/services/web3/core/accountWriteSource';
const account = '0x1111111111111111111111111111111111111111';
const homeRegistry = '0x2222222222222222222222222222222222222222';
const orgRegistry = '0x3333333333333333333333333333333333333333';
const sources = [{ chainId: 42161, url: 'https://home.test' }, { chainId: 100, url: 'https://org.test' }];
const row = (registry, metadata = {}) => ({ id: account, user: account, username: 'member', isDeleted: false,
  registry: { id: registry }, profileMetadataHash: null, registeredAt: '1', registeredAtBlock: '1', lastUpdatedAt: '2',
  metadata: { id: 'metadata', bio: null, avatar: null, github: null, twitter: null, website: null, ...metadata } });
const response = accounts => ({ accounts, _meta: { block: { number: 12, hash: `0x${'aa'.repeat(32)}`, timestamp: 123 } } });
const query = (mode = 'both') => vi.fn(async (document, variables, source) => {
  const registry = source.chainId === 100 ? orgRegistry : homeRegistry;
  if (document.includes('FetchInfrastructureAddresses')) return { universalAccountRegistries: [{ id: registry }] };
  if (source.chainId === 42161 && mode === 'outage') throw new Error('offline');
  if (mode === 'absent' || (mode === 'gnosis-only' && source.chainId === 42161)) return response([]);
  return response([row(mode === 'mismatch' ? account : registry, source.chainId === 100 ? { bio: 'org', github: 'member' } : {})]);
});
beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); })));
afterEach(() => vi.unstubAllGlobals());
describe('registration provenance through actual core identity reader', () => {
  it('routes a Gnosis-only registration to its observed registry instead of home defaults', async () => {
    const read = query('gnosis-only');
    const result = await resolveAccountWriteSource(account, { query: read, sources });
    expect(result.source).toMatchObject({ account, chainId: 100, contract: orgRegistry, endpoint: 'https://org.test' });
    expect(read.mock.calls.filter(([document]) => !document.includes('FetchInfrastructureAddresses')).map(([, variables]) => variables.registry)).toEqual([homeRegistry, orgRegistry]);
  });
  it('preserves first-username and richest-profile selection as separate host policies', async () => {
    const name = await resolveAccountWriteSource(account, { query: query(), sources });
    const profile = await resolveAccountWriteSource(account, { query: query(), sources, purpose: 'profile' });
    expect(name.source.chainId).toBe(42161);
    expect(profile.source.chainId).toBe(100);
    expect(profile.metadata.bio).toBe('org');
  });
  it.each(['outage', 'mismatch', 'absent'])('rejects %s instead of selecting a default write target', async mode => {
    await expect(resolveAccountWriteSource(account, { query: query(mode), sources })).rejects.toThrow();
  });
  it('rejects stale results after the source request, before preparing a write', async () => {
    let current = true;
    const read = query();
    await expect(resolveAccountWriteSource(account, { sources,
      query: async (...args) => { const result = await read(...args); current = false; return result; },
      guard: () => { if (!current) throw new Error('stale'); },
    })).rejects.toThrow('stale');
  });
});
