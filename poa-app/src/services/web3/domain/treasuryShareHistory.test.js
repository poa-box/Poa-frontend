import { it, expect, vi } from 'vitest';
import { readTreasuryShareRequests } from '@/components/treasury/shareHistory';
const ORG = `0x${'1'.repeat(64)}`, TOKEN = `0x${'2'.repeat(40)}`, HASH = `0x${'3'.repeat(64)}`;
const source = { chainId: 100, orgId: ORG, endpoint: 'https://index.invalid', method: 'graphql', indexed: true, snapshot: 'pinned', block: { number: '100', hash: HASH } };
const meta = { block: { number: 100, hash: HASH, timestamp: null } };
it('keeps exact approved Shares rewards, scope bindings, and complete terminal evidence', async () => {
  const rows = Array.from({ length: 500 }, (_, i) => ({ id: `${TOKEN}-${String(i).padStart(4, '0')}`, amount: i === 0 ? '9007199254740993' : '1', status: 'Approved', approvedAt: '1000' }));
  const client = { query: vi.fn(async ({ variables }) => ({ data: { organization: { id: ORG, participationToken: { id: TOKEN } },
    tokenRequests: variables.cursor ? [] : rows, _meta: meta } })) };
  const complete = await readTreasuryShareRequests({ client, source, tokenAddress: TOKEN });
  expect(complete.coverage.status).toBe('complete');
  expect(complete.data[0].amount).toBe('9007199254740993');
  expect(client.query).toHaveBeenCalledTimes(2);
  expect(client.query.mock.calls[1][0].variables.block).toEqual({ hash: HASH });
  client.query.mockImplementation(async ({ variables }) => ({ data: { organization: { id: ORG, participationToken: { id: TOKEN } }, tokenRequests: variables.cursor ? [] : rows,
    ...(variables.cursor ? {} : { _meta: meta }) } }));
  expect((await readTreasuryShareRequests({ client, source, tokenAddress: TOKEN })).coverage.status).not.toBe('complete');
});
it('refuses unrelated token/module bindings even on a known empty page', async () => {
  const client = { query: vi.fn(async () => ({ data: { organization: { id: ORG, participationToken: { id: `0x${'4'.repeat(40)}` } }, tokenRequests: [], _meta: meta } })) };
  expect((await readTreasuryShareRequests({ client, source, tokenAddress: TOKEN })).coverage.status).not.toBe('complete');
});
