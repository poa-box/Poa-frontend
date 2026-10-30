import React, { act, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createParityHost } from '@/test/parityHost';
import { useUserSearch } from '@/hooks/useUserSearch';
import { usePollNavigation } from '@/hooks/usePollNavigation';
import { NotificationProvider, useNotificationContext } from '@/context/NotificationContext';

const state = vi.hoisted(() => ({ router: null, search: vi.fn(), lookup: vi.fn() }));
vi.mock('next/router', () => ({ useRouter: () => state.router }));
vi.mock('@/hooks/useOrgName', () => ({ useOrgName: () => 'Test6' }));
vi.mock('@chakra-ui/react', async () => (await import('@/test/parityHost')).parityChakra());
vi.mock('@/util/crossChainUsername', () => ({
  searchUsersByUsernameAcrossChains: (...args) => state.search(...args),
  findUsernameAcrossChains: (...args) => state.lookup(...args),
}));

let host, observed;
const ongoing = [], completed = [];
function Search() {
  const value = useUserSearch({ debounceMs: 10 });
  useEffect(() => { observed = value; }, [value]);
  return null;
}
function Notifications() {
  const value = useNotificationContext();
  useEffect(() => { observed = value; }, [value]);
  return null;
}
function Navigation() {
  const value = usePollNavigation({ hybridVotingOngoing: ongoing, hybridVotingCompleted: completed,
    democracyVotingOngoing: ongoing, democracyVotingCompleted: completed });
  useEffect(() => { observed = value; }, [value]);
  return null;
}
beforeEach(() => {
  host = createParityHost();
  state.router = { pathname: '/votes', query: { org: 'Test6', q: 'budget', chainId: '100' },
    push: vi.fn(), replace: vi.fn() };
  state.search.mockReset();
  state.lookup.mockReset();
});
afterEach(async () => { await host.unmount(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('frontend cleanup regressions', () => {
  it('updates and removes notifications independently when created in the same millisecond', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(12345);
    await host.render(<NotificationProvider><Notifications /></NotificationProvider>);
    let first, second;
    await act(async () => {
      first = observed.addNotification('First', 'loading');
      second = observed.addNotification('Second', 'loading');
    });
    expect(first).not.toBe(second);
    await act(async () => observed.updateNotification(first, 'First failed', 'error'));
    expect(observed.notifications.map(({ message }) => message)).toEqual(['First failed', 'Second']);
    await act(async () => observed.removeNotification(first));
    expect(observed.notifications).toEqual([{ id: second, message: 'Second', status: 'loading' }]);
  });
  it('preserves archive and organization parameters when opening and closing a vote', async () => {
    await host.render(<NotificationProvider><Navigation /></NotificationProvider>);
    await act(async () => observed.handlePollClick({ id: 'poll-1' }));
    expect(state.router.push).toHaveBeenCalledWith({ pathname: '/votes', query: {
      org: 'Test6', userDAO: 'Test6', q: 'budget', chainId: '100', poll: 'poll-1',
    } }, undefined, { shallow: true });
    state.router.query = { ...state.router.query, poll: 'poll-1' };
    await act(async () => observed.onDetailClose());
    expect(state.router.replace).toHaveBeenCalledWith({ pathname: '/votes', query: {
      org: 'Test6', q: 'budget', chainId: '100',
    } }, undefined, { shallow: true });
    expect(observed.isDetailOpen).toBe(false);
  });
  it('removes selectable old matches during the next debounce and ignores a late response', async () => {
    vi.useFakeTimers();
    state.search.mockResolvedValueOnce([{ address: 'alice', username: 'alice' }]);
    await host.render(<Search />);
    await act(async () => observed.setSearchQuery('alice'));
    await act(async () => vi.advanceTimersByTimeAsync(10));
    expect(observed.searchResults[0].username).toBe('alice');
    let finishBob;
    state.search.mockImplementationOnce(() => new Promise(resolve => { finishBob = resolve; }));
    await act(async () => observed.setSearchQuery('bob'));
    expect(observed.searchResults).toEqual([]);
    expect(observed.isSearching).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(10));
    await act(async () => observed.clear());
    await act(async () => finishBob([{ address: 'bob', username: 'bob' }]));
    expect(observed.searchResults).toEqual([]);
    expect(observed.isSearching).toBe(false);
  });
});
