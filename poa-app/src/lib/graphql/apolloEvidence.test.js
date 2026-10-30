import { afterEach, describe, expect, it, vi } from 'vitest';
import { readIdentityFacts } from '@poa-box/core/reads/identity';
import { getClient } from '@/util/apolloClient';
import { createApolloProtocolQuery } from '@/lib/graphql/coreQuery';
const id = `0x${'7'.repeat(40)}`, registry = `0x${'1'.repeat(40)}`, hash = `0x${'c'.repeat(64)}`;
afterEach(() => vi.unstubAllGlobals());
describe('host Apollo response evidence', () => {
  it('does not let an earlier cached _meta attest a terminal response that omitted it', async () => {
    const endpoint = 'https://same-response-evidence.invalid/graphql';
    const fetch = vi.fn(async (_, request) => {
      const { variables } = JSON.parse(request.body);
      const data = variables.cursor === '0x' ? {
        accounts: [{ id, user: id, username: 'member', isDeleted: false, registry: { id: registry }, profileMetadataHash: null,
          registeredAt: '1', registeredAtBlock: '1', lastUpdatedAt: '1', metadata: null }],
        _meta: { block: { number: 10, hash, timestamp: 1 } },
      } : { accounts: [] };
      return new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetch);
    const source = { chainId: 100, endpoint, contract: registry, indexed: true, snapshot: 'pinned', method: 'graph', block: { number: '10', hash } };
    const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
    let facts;
    try { facts = await readIdentityFacts({ sources: [source], query: createApolloProtocolQuery(), selector: { kind: 'addresses', addresses: [id] }, pageSize: 1 }); }
    finally { warning.mockRestore(); }
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(facts.data).toHaveLength(1);
    expect(facts.coverage.status).toBe('incomplete');
    expect(facts.coverage.issues.some((issue) => issue.code === 'BLOCK_EVIDENCE_UNAVAILABLE')).toBe(true);
    // The public cache still retains valid older evidence. The reader rejects
    // using it as proof of a different HTTP response rather than clearing it.
    expect(getClient(endpoint).cache.extract().ROOT_QUERY).toBeDefined();
  });
});
