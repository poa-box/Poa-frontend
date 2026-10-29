import { afterEach, expect, it, vi } from 'vitest';
import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';

const state = vi.hoisted(() => ({ client: null }));
vi.mock('@/util/apolloClient', () => ({ getClient: () => state.client }));
import { roleOperationQuery } from '@/lib/accessV2/roleOperationQuery';

afterEach(() => { state.client?.stop(); state.client = null; });

it('observes a new indexed head after an asynchronous gap even with the first head cached', async () => {
  let height = 100, requests = 0;
  state.client = new ApolloClient({ cache: new InMemoryCache(), link: new ApolloLink(() => new Observable(observer => {
    requests++;
    observer.next({ data: { _meta: { block: { number: height, hash: `0x${height.toString(16).padStart(64, '0')}`, timestamp: 1000 + height } } } });
    observer.complete();
  })) });
  const source = { chainId: 100, orgId: `0x${'11'.repeat(32)}`, contract: `0x${'22'.repeat(20)}`,
    endpoint: 'https://index.invalid', method: 'role-operation-head', indexed: true, snapshot: 'latest' };
  const document = 'query RoleOperationHead { _meta { block { number hash timestamp } } }';
  const before = await roleOperationQuery(document, {}, source);
  await Promise.resolve();
  height = 110;
  const after = await roleOperationQuery(document, {}, source);
  expect(before._meta.block.number).toBe(100);
  expect(after._meta.block.number).toBe(110);
  expect(requests).toBe(2);
});
