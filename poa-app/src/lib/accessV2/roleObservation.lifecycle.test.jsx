import React, { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountedHostDocument } from '@/test/mountedHost';
import { createRoleOperationHost } from '@/lib/accessV2/roleOperationHost';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
let root, container, commits, outcomes;
function Consumer({ host, input, name, revision = 0 }) {
  const [status, setStatus] = useState('checking');
  useEffect(() => {
    const controller = new AbortController();
    host.read({ ...input, signal: controller.signal }).then(result => {
      outcomes.push({ name, result }); if (!controller.signal.aborted) { commits.push(name); setStatus(result.status); }
    }, error => { outcomes.push({ name, error }); if (!controller.signal.aborted) setStatus('unavailable'); });
    return () => controller.abort();
  }, [host, input, name, revision]);
  return <span>{name}:{status}</span>;
}
const render = children => act(async () => { root.render(children); await flush(); });
function fixture() {
  const provider = { getNetwork: vi.fn(async () => ({})), getBlock: vi.fn(async () => ({})), call: vi.fn(async () => '0x1234') };
  const operation = vi.fn(async ({ sources }) => { await sources.rpc.provider.getBlock(123); await sources.rpc.provider.call({}, 123); return { status: 'ready', data: {} }; });
  const host = createRoleOperationHost({ provider }, { operations: { readRoleOperationEvidence: operation } });
  const input = { scope: { orgId: 'org', account: 'account' }, endpoint: 'mock://index', rpcEndpoint: 'mock://rpc',
    snapshot: { source: { block: { number: '123', hash: 'hash' } }, data: {} }, request: { mode: 'create', role: {} }, now: () => 1000 };
  return { host, input, provider, operation };
}
beforeEach(() => {
  commits = []; outcomes = [];
  const doc = mountedHostDocument(); container = doc.createElement('main');
  vi.stubGlobal('document', doc); vi.stubGlobal('window', { document: doc, HTMLIFrameElement: class {} });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('OFFLINE_NETWORK_FORBIDDEN'); })); root = createRoot(container);
});
afterEach(async () => { await act(async () => { root.unmount(); await flush(); }); expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe('mounted shared host observation (domain outcomes explicitly stubbed)', () => {
  it('shares equivalent rerenders/reopens without letting one consumer cancel another', async () => {
    const f = fixture(), gate = deferred(); f.provider.getBlock.mockImplementation(async () => { await gate.promise; return {}; });
    await render(<><Consumer key="a" {...f} name="removed" /><Consumer key="b" {...f} name="remaining" /></>);
    const equivalent = { ...f.input, snapshot: { ...f.input.snapshot, source: { ...f.input.snapshot.source, observedAt: 1001 } } };
    await render(<Consumer key="b" {...f} input={equivalent} name="remaining" revision={1} />);
    await act(async () => { gate.resolve(); await f.host.read(f.input); });
    expect(commits).toEqual(['remaining']); expect(f.operation).toHaveBeenCalledOnce();
    expect(outcomes.some(row => row.name === 'removed' && row.error?.name === 'AbortError')).toBe(true);
    await render(null); await render(<Consumer {...f} name="reopened" />);
    expect(commits).toContain('reopened'); expect(f.provider.call).toHaveBeenCalledOnce();
    expect(f.provider.getBlock).toHaveBeenCalledTimes(2); // canonicality is never cached
  });
  it('aborts the last consumer, starts no further queued calls and suppresses late commits', async () => {
    const f = fixture(), gate = deferred(); f.provider.getBlock.mockImplementation(async () => { await gate.promise; return {}; });
    await render(<Consumer {...f} name="closed" />); await render(null);
    await act(async () => { gate.resolve(); await flush(); });
    expect(f.provider.call).not.toHaveBeenCalled(); expect(commits).toEqual([]); expect(outcomes[0].error.name).toBe('AbortError');
  });
  it('retries a failed operation without retaining partial transport responses as proof', async () => {
    const f = fixture(); f.provider.call.mockRejectedValueOnce(new Error('RPC unavailable'));
    await render(<Consumer {...f} name="retry" />); expect(container.textContent).toContain('unavailable');
    await render(<Consumer {...f} name="retry" revision={1} />); expect(container.textContent).toContain('ready');
    expect(f.provider.call).toHaveBeenCalledTimes(2); expect(f.operation).toHaveBeenCalledTimes(2);
  });
  it.each(['account', 'endpoint', 'module'])('isolates mounted %s changes while old reads finish', async dimension => {
    const f = fixture(), gate = deferred(); f.provider.getBlock.mockImplementationOnce(async () => { await gate.promise; return {}; });
    await render(<Consumer {...f} name="changed" />);
    const changed = { ...f.input, scope: { ...f.input.scope } };
    if (dimension === 'account') changed.scope.account = 'another';
    if (dimension === 'endpoint') changed.endpoint = 'mock://another';
    if (dimension === 'module') changed.scope.contracts = { membershipAuthority: 'another' };
    await render(<Consumer {...f} input={changed} name="changed" revision={1} />);
    await act(async () => { gate.resolve(); await flush(); });
    expect(commits).toEqual(['changed']); expect(f.operation).toHaveBeenCalledTimes(2);
    expect(outcomes.some(row => row.error?.name === 'AbortError')).toBe(true);
  });
});
