import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthorityJoinRoles } from '@/hooks/useAuthorityJoinRoles';
const state = vi.hoisted(() => ({ value: null, subjects: null }));
vi.mock('@/context/authState', () => ({ useAuth: () => ({ accountAddress: '0x' + '1'.repeat(40), isAuthHydrated: true }) }));
vi.mock('@/context/RefreshContext', () => ({ RefreshEvent: {}, useRefreshSubscription() {} }));
vi.mock('@/hooks/useWeb3Services', () => ({ useWeb3Services: () => ({ membershipAuthority: null }) }));
// Complete observations now live in the shared indexed store, not a useQuery nested relation.
vi.mock('@/hooks/accessV2', () => ({ useAuthoritySubjects: () => state.subjects }));
function Probe() { state.value = useAuthorityJoinRoles(); return null; }
const render = () => renderToStaticMarkup(<Probe />);
beforeEach(() => {
  state.subjects = { roles: [], loading: false, error: null, refetch: vi.fn(async () => { state.subjects.error = null; }),
    authority: { address: '0x' + '2'.repeat(40), enabled: true, refetch: vi.fn() } };
});
describe('Join retries discovery and shared complete authority observations', () => {
  it('refreshes the failing observation and retains an unavailable role state until it recovers', async () => {
    state.subjects.error = new Error('Mock unavailable'); render();
    expect(state.value.error).toBe(state.subjects.error);
    await state.value.refetch();
    expect(state.subjects.authority.refetch).toHaveBeenCalledOnce();
    expect(state.subjects.refetch).toHaveBeenCalledOnce();
    render(); expect(state.value.error).toBeNull();
  });
  it('retries discovery alone when no bound authority has been verified', async () => {
    state.subjects.authority = { enabled: false, address: null, refetch: vi.fn() }; render();
    await state.value.refetch();
    expect(state.subjects.authority.refetch).toHaveBeenCalledOnce();
    expect(state.subjects.refetch).not.toHaveBeenCalled();
    expect(state.value.states).toEqual({});
  });
  it('settles both failed reads without offering a claim or hiding the current failure', async () => {
    state.subjects.error = new Error('Mock unavailable');
    state.subjects.authority.refetch.mockRejectedValue(new Error('Mock unavailable'));
    state.subjects.refetch.mockRejectedValue(new Error('Mock unavailable')); render();
    await expect(state.value.refetch()).resolves.toBeUndefined();
    expect(state.subjects.refetch).toHaveBeenCalledOnce(); render();
    expect(state.value.states).toEqual({}); expect(state.value.error).toBe(state.subjects.error);
  });
});
