import { describe, expect, it, vi } from 'vitest';
import { fetchSupportedOrganizations, ORGANIZATION_DIRECTORY_QUERY } from '@/util/orgDirectory';
import { authorityNode } from '@/lib/accessV2/fixtures';
import { buildSchema, graphql } from 'graphql';
import { fetchOrgTaskCounts } from '@/util/orgTaskCounts';
const response = organizations => ({ ok: true, json: async () => ({ data: { organizations } }) });
const current = { id: '0x' + 'f'.repeat(64), name: 'Poa', membershipAuthority: authorityNode(), deployedAt: null, metadataHash: null, metadata: null, participationToken: null, taskManager: null };
describe('supported org directory', () => {
  it('does not request the unused capped historical user roster', () => {
    expect(ORGANIZATION_DIRECTORY_QUERY).not.toMatch(/\busers\s*\(/);
  });
  it('loads task counts for surviving orgs through the fields actually selected by GraphQL', async () => {
    const schema = buildSchema(`
      scalar Bytes
      input Block_height { number: Int, hash: Bytes }
      type MetaBlock { number: Int, hash: Bytes, timestamp: Int }
      type Meta { block: MetaBlock }
      enum Organization_orderBy { id }
      enum OrderDirection { asc desc }
      input Organization_filter { id_gt: Bytes }
      type Authority { id: ID, isRouterBound: Boolean, cutoverAt: String }
      type Metadata { id: ID, description: String, logo: String, backgroundColor: String, useTokenSymbol: Boolean }
      type Token { id: ID, name: String, symbol: String, totalSupply: String }
      type Contract { id: ID, organization: Organization }
      type User { id: ID }
      type Organization { id: ID, name: String, metadataHash: String, deployedAt: String, membershipAuthority: Authority, metadata: Metadata, participationToken: Token, quickJoin: Contract, taskManager: Contract, users(first: Int): [User] }
      type Query { _meta(block: Block_height): Meta, organizations(block: Block_height, first: Int, where: Organization_filter, orderBy: Organization_orderBy, orderDirection: OrderDirection): [Organization] }
    `);
    const manager = '0x' + '1'.repeat(40);
    const fetcher = async (_, options) => {
      const { query, variables } = JSON.parse(options.body);
      return { ok: true, json: () => graphql({ schema, source: query, variableValues: variables, rootValue: { organizations: [{ ...current, id: '0x' + '0'.repeat(63) + '1', name: 'Argus', membershipAuthority: null }, { ...current, taskManager: { id: manager, organization: { id: current.id } } }] } }) };
    };
    const orgs = await fetchSupportedOrganizations('endpoint', { fetcher, chainId: 100 });
    expect(orgs).toHaveLength(1);
    expect(orgs[0].taskManager).toMatchObject({ id: manager });
    const countsFetcher = vi.fn(async (_, options) => {
      expect(JSON.parse(options.body).variables.taskManagers).toEqual([manager]);
      return { ok: true, json: async () => ({ data: { tasks: [{ id: 'task', taskManager: manager, status: 'Open' }] } }) };
    });
    const counts = await fetchOrgTaskCounts('endpoint', orgs.map(org => org.taskManager.id), countsFetcher, { chainId: 100 });
    expect(counts).toEqual({ [manager]: { open: 1, total: 1 } });
  });
  it('hides retired rows while preserving metadata and full survivor history totals', async () => {
    const fetcher = vi.fn().mockResolvedValue(response([{ ...current, id: '0x' + '0'.repeat(63) + '1', name: 'Argus', membershipAuthority: null }, current]));
    expect(await fetchSupportedOrganizations('endpoint', { fetcher, chainId: 100 })).toMatchObject([current]);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).query).toMatch(/isRouterBound\s+cutoverAt/);
  });
  it('paginates across a whole page of retired orgs to find a future supported org', async () => {
    const retired = Array.from({ length: 100 }, (_, index) => ({ ...current, id: `0x${(index + 1).toString(16).padStart(64, '0')}`, name: 'Retired', membershipAuthority: null }));
    const fetcher = vi.fn().mockResolvedValueOnce(response(retired)).mockResolvedValueOnce(response([current]));
    expect(await fetchSupportedOrganizations('endpoint', { fetcher, chainId: 100 })).toMatchObject([current]);
    expect(JSON.parse(fetcher.mock.calls[1][1].body).variables.cursor).toBe(retired.at(-1).id);
  });
  it('never falls back to the old org schema after an unknown field error or partial response', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { organizations: [current] }, errors: [{ message: 'Unknown field membershipAuthority' }] }) });
    await expect(fetchSupportedOrganizations('endpoint', { fetcher, chainId: 100 })).rejects.toThrow('public data is unavailable');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
