import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoleOperationHost, requireRoleOperation } from '@/lib/accessV2/roleOperationHost';
const deferred = () => { let resolve; const promise = new Promise(finish => { resolve = finish; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const ready = data => ({ status: 'ready', data, consequences: [] });
const input = () => ({ scope: { chainId: 100, orgId: 'org', account: 'account', contracts: { membershipAuthority: 'authority' } },
  endpoint: 'mock://index', rpcEndpoint: 'mock://rpc', snapshot: { source: { endpoint: 'mock://index', block: { number: '1', hash: 'hash' } }, data: {} },
  request: { mode: 'create', role: { name: 'Builders' } }, query: vi.fn(async () => ({ indexed: true })), now: () => 1000 });
function fixture(read) {
  const provider = Object.fromEntries(['call', 'getNetwork', 'getBlock', 'getTransaction', 'getTransactionReceipt'].map(name => [name, vi.fn(async () => ({ name }))]));
  const operations = { readRoleOperationEvidence: vi.fn(read || (async () => ready({ observed: true }))),
    reviewRoleOperation: vi.fn(async () => ready({ review: true })), prepareRoleOperation: vi.fn(async () => ready({ prepared: true })),
    revalidatePreparedRoleOperation: vi.fn(async () => ready({ prepared: true })), readRoleOperationStatus: vi.fn(async () => ready({ next: 'wait' })) };
  return { provider, operations, host: createRoleOperationHost({ provider }, { operations }) };
}
beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('OFFLINE_NETWORK_FORBIDDEN'); })));
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe('role operation host boundary (protocol results explicitly stubbed)', () => {
  it('separates simultaneous capability and operation reads while deduplicating their own equivalent purposes', async () => {
    const gate = deferred(), f = fixture(async ({ purpose = 'operation' }) => { await gate.promise; return ready({ purpose }); });
    const args = input();
    const operation = f.host.read(args);
    const explicitOperation = f.host.read({ ...args, purpose: 'operation' });
    const capabilities = f.host.read({ ...args, purpose: 'capabilities' });
    const duplicateCapabilities = f.host.read({ ...args, purpose: 'capabilities' });
    await flush();
    expect(f.operations.readRoleOperationEvidence).toHaveBeenCalledTimes(2);
    gate.resolve();
    expect((await operation).data.purpose).toBe('operation');
    expect((await explicitOperation).data.purpose).toBe('operation');
    expect((await capabilities).data.purpose).toBe('capabilities');
    expect((await duplicateCapabilities).data.purpose).toBe('capabilities');
  });
  it('forwards canonical requests and original indexed snapshots and wraps every transport under aggregate concurrency three', async () => {
    let active = 0, max = 0;
    const f = fixture(async ({ sources, authoritySnapshot, request }) => {
      expect(authoritySnapshot).toBe(args.snapshot); expect(request).toBe(args.request);
      const reads = [...Object.values(sources.rpc.provider).map(read => () => read('arg')), () => sources.indexed.query({ indexed: true }, 'document', { block: { hash: 'hash' } })];
      await Promise.all(reads.map(read => read())); return ready({ observed: true });
    });
    for (const method of Object.keys(f.provider)) f.provider[method].mockImplementation(async () => {
      active++; max = Math.max(active, max); await flush(); active--; return method;
    });
    const args = input();
    expect(requireRoleOperation(await f.host.read(args))).toEqual({ observed: true }); expect(max).toBe(3);
    for (const method of Object.keys(f.provider)) expect(f.provider[method]).toHaveBeenCalledOnce();
    expect(args.query).toHaveBeenCalledOnce();
  });
  it('adapts the public AuthoritySnapshotQuery signature to the validated host query and retains its source envelope', async () => {
    const source = { endpoint: 'mock://index', indexed: true, snapshot: 'pinned', block: { number: '1', hash: 'hash' } };
    const variables = { block: { hash: 'hash' }, orgId: 'org' }, data = { _meta: { block: { hash: 'hash' } } };
    const f = fixture(async ({ sources }) => {
      const result = await sources.indexed.query(source, 'authority-document', variables);
      expect(result).toEqual({ source, data, issues: [] }); expect(result.source).toBe(source);
      return ready({ observed: true });
    });
    const args = input(); args.query.mockResolvedValue(data);
    expect((await f.host.read(args)).status).toBe('ready');
    expect(args.query).toHaveBeenCalledExactlyOnceWith('authority-document', variables, source);
  });
  it('coalesces equivalent consumers, cancels one independently and lets a reopen reclaim pending work', async () => {
    const gate = deferred(), f = fixture(async ({ sources }) => { await gate.promise; await sources.rpc.provider.getBlock(1); return ready({}); });
    const args = input(), a = new AbortController(), b = new AbortController();
    const first = f.host.read({ ...args, signal: a.signal }).catch(error => error);
    const second = f.host.read({ ...args, signal: b.signal }); await flush();
    a.abort();
    const reopened = f.host.read({ ...args, snapshot: { ...args.snapshot, source: { ...args.snapshot.source, observedAt: 1001 } } });
    gate.resolve(); await Promise.all([second, reopened]);
    expect((await first).name).toBe('AbortError'); expect(f.operations.readRoleOperationEvidence).toHaveBeenCalledOnce();
    expect(f.provider.getBlock).toHaveBeenCalledOnce();
  });
  it('cancels the last consumer before further queued reads and retries a reopened observation', async () => {
    const gate = deferred(), f = fixture(async ({ sources, signal }) => {
      await gate.promise;
      await sources.rpc.provider.getBlock(1); return ready({ aborted: signal.aborted });
    });
    const args = input(), controller = new AbortController();
    const pending = f.host.read({ ...args, signal: controller.signal }).catch(error => error);
    await flush(); controller.abort(); await flush(); gate.resolve(); await flush();
    expect((await pending).name).toBe('AbortError'); expect(f.provider.getBlock).not.toHaveBeenCalled();
    expect((await f.host.read(args)).status).toBe('ready'); expect(f.provider.getBlock).toHaveBeenCalledOnce();
  });
  it.each(['account', 'organization', 'endpoint', 'module', 'block'])('isolates cached responses for changed %s', async dimension => {
    const f = fixture(async ({ sources }) => { await sources.rpc.provider.call({ to: 'authority', data: '0xab' }, 1); await sources.rpc.provider.getBlock(1); return ready({}); });
    const args = input(); await f.host.read(args); await f.host.read(args);
    expect(f.provider.call).toHaveBeenCalledOnce(); expect(f.provider.getBlock).toHaveBeenCalledTimes(2);
    const changed = structuredClone({ ...args, query: undefined, now: undefined }); changed.query = args.query; changed.now = args.now;
    if (dimension === 'account') changed.scope.account = 'another';
    if (dimension === 'organization') changed.scope.orgId = 'another';
    if (dimension === 'endpoint') changed.endpoint = 'mock://another';
    if (dimension === 'module') changed.scope.contracts.membershipAuthority = 'another';
    if (dimension === 'block') changed.snapshot.source.block.hash = 'another';
    await f.host.read(changed); expect(f.provider.call).toHaveBeenCalledTimes(2);
  });
  it('never retains failed or unknown reads as positive proof and keeps source heads uncached', async () => {
    const f = fixture(async ({ sources }) => { await sources.rpc.provider.call({}, 1); await sources.indexed.query({ indexed: true }, 'head', {}); return { status: 'unknown', codes: ['UNAVAILABLE'] }; });
    const args = input(); await f.host.read(args); await f.host.read(args);
    expect(f.provider.call).toHaveBeenCalledTimes(2); expect(args.query).toHaveBeenCalledTimes(2);
    expect(() => requireRoleOperation({ status: 'unknown', codes: ['UNAVAILABLE'] })).toThrow('could not be verified');
  });
  it('never uses the earlier snapshot as a cache pin for prepare/revalidate fresh-head reads', async () => {
    const f = fixture(async ({ sources }) => { await sources.rpc.provider.call({}, 1); return ready({}); });
    f.operations.prepareRoleOperation.mockImplementation(async ({ sources, authoritySnapshot }) => {
      expect(authoritySnapshot).toBeUndefined(); await sources.rpc.provider.call({}, 1); return ready({});
    });
    const args = input(); await f.host.read(args); await f.host.prepare(args); await f.host.prepare(args);
    expect(f.provider.call).toHaveBeenCalledTimes(3);
  });
  it('reuses only the actually observed prepare block and refreshes a same-height reorg', async () => {
    const f = fixture(async ({ sources }) => { await sources.rpc.provider.getBlock(1); return ready(await sources.rpc.provider.call({}, 1)); });
    f.provider.getBlock.mockResolvedValue({ number: 1, hash: 'first' }); f.provider.call.mockResolvedValue('first-value');
    f.operations.prepareRoleOperation.mockImplementation(async ({ sources }) => {
      await sources.rpc.provider.getBlock(1); return ready(await sources.rpc.provider.call({}, 1));
    });
    const args = input(); await f.host.read(args);
    expect((await f.host.prepare(args)).data).toBe('first-value'); expect(f.provider.call).toHaveBeenCalledOnce();
    f.provider.getBlock.mockResolvedValue({ number: 1, hash: 'reorg' }); f.provider.call.mockResolvedValue('new-value');
    expect((await f.host.prepare(args)).data).toBe('new-value'); expect(f.provider.call).toHaveBeenCalledTimes(2);
    expect(f.provider.getBlock).toHaveBeenCalledTimes(3);
  });
  it('forwards the actual opaque review/prepared handles and keeps read-only final revalidation distinct from publication', async () => {
    const f = fixture(), args = input(), review = Object.freeze({ marker: 'opaque-review' }), prepared = Object.freeze({ marker: 'opaque-prepared' });
    const publishDocument = vi.fn();
    await f.host.review(args); await f.host.prepare({ ...args, review, currentRequest: args.request, publishDocument });
    await f.host.revalidate({ ...args, review, prepared, currentRequest: args.request });
    expect(f.operations.prepareRoleOperation.mock.calls[0][0].review).toBe(review);
    expect(f.operations.revalidatePreparedRoleOperation.mock.calls[0][0].prepared).toBe(prepared);
    expect(f.operations.revalidatePreparedRoleOperation.mock.calls[0][0].publishDocument).toBeUndefined();
    expect(publishDocument).not.toHaveBeenCalled();
  });
});
