import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createParityHost } from '@/test/parityHost';
const f = vi.hoisted(() => ({ read: vi.fn(), client: {}, callbacks: [] }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => ({ orgId: 'org', orgChainId: 100, subgraphUrl: 'https://index.invalid' }) }));
vi.mock('@/hooks/accessV2/useOrgAuthority', () => ({ useOrgAuthority: () => ({ enabled: true, address: `0x${'1'.repeat(40)}` }) }));
vi.mock('@/util/apolloClient', () => ({ useSubgraphClient: () => f.client }));
vi.mock('@/context/RefreshContext', () => ({ RefreshEvent: {}, useRefreshSubscription: (_events, callback) => { f.callbacks.push(callback); } }));
vi.mock('@/lib/accessV2/authorityEvidence', async original => ({ ...await original(), observeAuthority: (...args) => f.read(...args) }));
import { useAuthorityEvidence } from '@/hooks/accessV2/useAuthorityEvidence';
let host;
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
function Child() { const value = useAuthorityEvidence(); return <span>{value.complete ? 'Verified members' : 'Pending members'}</span>; }
function Parent() { const value = useAuthorityEvidence(); return value.loading ? <span>Loading team</span> : <Child />; }
beforeEach(() => { f.client = {}; f.callbacks = []; f.read.mockReset(); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); })); host = createParityHost(); });
afterEach(async () => { await host.unmount(); expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
describe('shared authority reads under a loading-gated parent', () => {
  it('mounts children from the completed observation and refreshes once per explicit event without a remount loop', async () => {
    const first = deferred(), second = deferred();
    f.read.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    await host.render(<Parent />); expect(f.read).toHaveBeenCalledOnce();
    await act(async () => { first.resolve({ coverage: { status: 'complete' }, data: {} }); await Promise.resolve(); });
    expect(host.container.textContent).toBe('Verified members'); expect(f.read).toHaveBeenCalledOnce();
    await act(async () => { f.callbacks[0](); await Promise.resolve(); });
    expect(host.container.textContent).toBe('Loading team'); expect(f.read).toHaveBeenCalledTimes(2);
    await act(async () => { second.resolve({ coverage: { status: 'complete' }, data: {} }); await Promise.resolve(); });
    expect(host.container.textContent).toBe('Verified members'); expect(f.read).toHaveBeenCalledTimes(2);
  });
  it('shares a failed observation with a remounted child until an explicit retry succeeds', async () => {
    const first = deferred(), retry = deferred(), unexpected = deferred();
    f.read.mockImplementation(() => unexpected.promise).mockImplementationOnce(() => first.promise).mockImplementationOnce(() => retry.promise);
    await host.render(<Parent />); expect(f.read).toHaveBeenCalledOnce();
    await act(async () => { first.reject(new Error('Controlled unavailable source')); await Promise.resolve(); });
    expect(host.container.textContent).toBe('Pending members'); expect(f.read).toHaveBeenCalledOnce();
    await act(async () => { await Promise.resolve(); });
    expect(f.read).toHaveBeenCalledOnce();
    await act(async () => { f.callbacks[0](); await Promise.resolve(); });
    expect(host.container.textContent).toBe('Loading team'); expect(f.read).toHaveBeenCalledTimes(2);
    await act(async () => { retry.resolve({ coverage: { status: 'complete' }, data: {} }); await Promise.resolve(); });
    expect(host.container.textContent).toBe('Verified members'); expect(f.read).toHaveBeenCalledTimes(2);
  });
});
