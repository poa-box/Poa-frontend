import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Execute the actual component's clock, memo and effect lifecycle with retained hook slots.
// The repo's node-only test environment has no browser or React DOM renderer.
const fixture = vi.hoisted(() => ({ slots: [], cursor: 0, effects: [], dirty: false, buttons: [],
  receiptProps: [], poMembers: 2, leaderboardData: [],
  refresh: vi.fn(), register: vi.fn(), requestRuntime: vi.fn(), readDetail: vi.fn() }));
vi.mock('react', async original => {
  const actual = await original();
  const memo = (compute, deps) => {
    const index = fixture.cursor++, previous = fixture.slots[index];
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
      fixture.slots[index] = { deps, value: compute() };
    }
    return fixture.slots[index].value;
  };
  const hooks = {
    useMemo: memo,
    useCallback: (callback, deps) => memo(() => callback, deps),
    useRef: initial => { const index = fixture.cursor++; return fixture.slots[index] ||= { current: initial }; },
    useState: initial => {
      const index = fixture.cursor++;
      const slot = fixture.slots[index] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [slot.value, next => {
        const value = typeof next === 'function' ? next(slot.value) : next;
        if (!Object.is(value, slot.value)) { slot.value = value; fixture.dirty = true; }
      }];
    },
    useEffect: (effect, deps) => {
      const index = fixture.cursor++, previous = fixture.slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        fixture.effects.push(() => {
          previous?.cleanup?.();
          fixture.slots[index] = { deps, cleanup: effect() };
        });
      }
    },
  };
  return { ...actual, ...hooks, default: { ...actual.default, ...hooks } };
});
vi.mock('@chakra-ui/react', async () => {
  const { createElement, useState } = await import('react');
  const chakra = (await import('@/test/mockChakra')).mockChakra(fixture.buttons);
  chakra.useBreakpointValue = () => false;
  chakra.useClipboard = () => ({ onCopy() {}, hasCopied: false });
  chakra.useDisclosure = function useDisclosure() {
    const [isOpen, setOpen] = useState(false);
    return { isOpen, onOpen: () => setOpen(true), onClose: () => setOpen(false) };
  };
  for (const name of ['Modal', 'AlertDialog']) {
    chakra[name] = ({ isOpen, children }) => isOpen ? createElement('div', null, children) : null;
  }
  return chakra;
});
vi.mock('@chakra-ui/icons', () => ({ LinkIcon: () => null, ChevronDownIcon: () => null,
  ChevronUpIcon: () => null, CheckIcon: () => null }));
vi.mock('@/context/authState', () => ({ useAuth: () => ({ accountAddress: '0x1111111111111111111111111111111111111111', isAuthHydrated: true, isAuthenticated: true }) }));
vi.mock('@/context/UserContext', () => ({ useUserContext: () => ({ userData: { hatIds: [] }, hasMemberRole: true, userDataLoading: false }) }));
vi.mock('@/context/VotingContext', () => ({ useVotingContext: () => ({ addOptimisticVote() {}, removeOptimisticVote() {},
  registerProposalPowerEvidence: fixture.register }) }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => ({ orgChainId: 100, orgId: 'org', poMembers: fixture.poMembers, leaderboardData: fixture.leaderboardData }) }));
vi.mock('@/context/Web3ServicesContext', () => ({ useWeb3ServicesContext: () => ({ requestRuntime: fixture.requestRuntime }) }));
vi.mock('@/hooks/useMountedProposalDetail', () => ({ useMountedProposalDetail: (...args) => fixture.readDetail(...args) }));
vi.mock('@/hooks/accessV2/useAuthorityEvidence', () => ({ useAuthorityEvidence: () => ({ scope: {}, snapshot: null, refetch: fixture.refresh }) }));
vi.mock('@/hooks/accessV2/useActivationGate', () => ({ useActivationGate: () => ({ blocked: false }) }));
vi.mock('@/hooks/useVotingPower', () => ({ useVotingPower: () => ({ classBreakdown: [] }) }));
vi.mock('@/hooks/useRoleNames', () => ({ useRoleNames: () => ({ getRoleNamesString: () => 'Members' }) }));
vi.mock('@/hooks/useOrgName', () => ({ useOrgName: () => 'Test6' }));
vi.mock('@/hooks/useShareLink', () => ({ useShareLink: () => '/voting/' }));
vi.mock('@/lib/graphql/coreQuery', () => ({ apolloProtocolQuery: () => { throw new Error('Unexpected query'); } }));
vi.mock('@/components/voting/GlassBack', () => ({ default: () => null }));
vi.mock('@/components/voting/VotePowerReceipt', () => ({ VotePowerReceipt: props => { fixture.receiptProps.push(props); return null; } }));
vi.mock('@/components/voting/meters/TurnoutMeter', () => ({ TurnoutMeter: () => null }));
vi.mock('@/components/voting/meters/SupportMeter', () => ({ SupportMeter: () => null }));
vi.mock('@/components/voting/ResultBars', () => ({ ResultBars: () => null }));
vi.mock('@/components/voting/WeightedBallot', () => ({ WeightedBallot: () => null, weightedPairs: () => { throw new Error('Unexpected cast'); } }));
vi.mock('@/components/voting/VoteCelebration', () => ({ VoteCelebration: () => null }));
vi.mock('@/components/voting/VoterRoster', () => ({ VoterRoster: () => null }));

import { PollDetail } from '@/components/voting/PollDetail';

const START = 2100000000000;
const END = String(START / 1000 + 2);
let props;
function render(next = {}) {
  props = { ...props, ...next };
  let html;
  for (let attempts = 0; attempts < 10; attempts++) {
    fixture.cursor = 0; fixture.dirty = false; fixture.buttons.length = 0;
    html = renderToStaticMarkup(PollDetail(props));
    for (const effect of fixture.effects.splice(0)) effect();
    if (!fixture.dirty) return html;
  }
  throw new Error('Component did not settle');
}
const button = label => fixture.buttons.find(item => item.children === label);
const cleanup = () => { for (const slot of fixture.slots) slot?.cleanup?.(); };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(START); vi.clearAllMocks();
  fixture.slots = []; fixture.effects = []; fixture.cursor = 0; fixture.buttons.length = 0;
  fixture.receiptProps = []; fixture.poMembers = 2; fixture.leaderboardData = [];
  fixture.refresh.mockResolvedValue(); fixture.readDetail.mockReturnValue(null);
  props = { isOpen: true, onClose: vi.fn(), onVote: vi.fn(), onFinalize: vi.fn().mockResolvedValue({ success: false }),
    contractAddress: '0x2222222222222222222222222222222222222222',
    poll: { id: 'dd-11', proposalId: '11', title: 'Already open poll', type: 'Direct Democracy',
      startTimestamp: String(START / 1000 - 10), endTimestamp: END,
      status: 'Active', isOngoing: true, isExpired: false, options: [{ name: 'Yes' }, { name: 'No' }], votes: [], quorum: 1 } };
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('already-open poll deadline lifecycle', () => {
  it('binds the voice receipt to the displayed DD poll type and electorate', () => {
    fixture.poMembers = 11;
    render();
    expect(fixture.receiptProps.at(-1)).toMatchObject({ votingType: 'Direct Democracy', eligibleCount: 11 });
    expect(props.onVote).not.toHaveBeenCalled(); expect(props.onFinalize).not.toHaveBeenCalled();
  });

  it('withholds a restricted DD denominator until its eligible roster loads instead of using all 11 members', () => {
    fixture.poMembers = 11;
    render({ poll: { ...props.poll, isHatRestricted: true, restrictedHatIds: ['7'] } });
    expect(fixture.receiptProps.at(-1)).toMatchObject({ votingType: 'Direct Democracy', eligibleCount: null, approximate: true });
    fixture.leaderboardData = [{ address: '0x1111111111111111111111111111111111111111', hatIds: ['7'] },
      { address: '0x3333333333333333333333333333333333333333', hatIds: ['7'] },
      { address: '0x4444444444444444444444444444444444444444', hatIds: ['8'] }];
    render();
    expect(fixture.receiptProps.at(-1)).toMatchObject({ votingType: 'Direct Democracy', eligibleCount: 2, approximate: false });
    expect(props.onVote).not.toHaveBeenCalled(); expect(props.onFinalize).not.toHaveBeenCalled();
  });

  it('replaces the ballot with count at the deadline despite unchanged indexed Active/expiry flags', async () => {
    render(); expect(button('Cast vote')).toBeDefined(); expect(button('Count the votes')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1999);
    render(); expect(button('Cast vote')).toBeDefined(); expect(button('Count the votes')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.dirty).toBe(true); // The mounted detail itself requested a render.
    expect(render()).toContain('Provisional results');
    expect(button('Cast vote')).toBeUndefined(); expect(button('Count the votes')).toBeDefined();
    await vi.advanceTimersByTimeAsync(1000);
    render(); expect(button('Count the votes')).toBeDefined();
    expect(props.poll).toMatchObject({ status: 'Active', isExpired: false });
    expect(fixture.requestRuntime).toHaveBeenCalledTimes(1);
    expect(fixture.refresh).toHaveBeenCalledTimes(1);
    expect(props.onFinalize).not.toHaveBeenCalled(); expect(props.onVote).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();

    // Presentation only opens confirmation; the existing guarded onFinalize path
    // still decides whether a count succeeded and retains a rejected confirmation.
    button('Count the votes').onClick(); render();
    expect(props.onFinalize).not.toHaveBeenCalled();
    await fixture.buttons.filter(item => item.children === 'Count the votes').at(-1).onClick();
    expect(props.onFinalize).toHaveBeenCalledExactlyOnceWith(props.contractAddress, '11', false, props.poll);
    expect(render()).toContain('Cancel');
    props.onFinalize.mockResolvedValueOnce({ success: true });
    await fixture.buttons.filter(item => item.children === 'Count the votes').at(-1).onClick();
    expect(render()).not.toContain('Cancel');

    // A later indexed completion wins over the local deadline clock.
    render({ poll: { ...props.poll, status: 'Finalized', isOngoing: false, isExpired: true, isValid: true, winningOption: 0 } });
    expect(button('Cast vote')).toBeUndefined(); expect(button('Count the votes')).toBeUndefined();
  });

  it('uses the newly selected deadline and cancels replaced, closed and unmounted timers', async () => {
    render(); await vi.advanceTimersByTimeAsync(1000);
    render({ poll: { ...props.poll, id: 'dd-12', proposalId: '12', endTimestamp: String(START / 1000 + 10) } });
    await vi.advanceTimersByTimeAsync(1000);
    render(); expect(button('Count the votes')).toBeUndefined(); expect(button('Cast vote')).toBeDefined();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(8000);
    render(); expect(button('Count the votes')).toBeDefined();
    expect(vi.getTimerCount()).toBe(0);
    render({ poll: { ...props.poll, id: 'dd-13', proposalId: '13', endTimestamp: String(START / 1000 + 30) } });
    expect(vi.getTimerCount()).toBe(1);
    render({ isOpen: false }); expect(vi.getTimerCount()).toBe(0);
    render({ isOpen: true });
    expect(vi.getTimerCount()).toBe(1);
    cleanup(); expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10000);
    expect(props.onFinalize).not.toHaveBeenCalled();
  });

  it('uses the actual deadline rather than an inconsistent feed expiry hint', async () => {
    render({ poll: { ...props.poll, isExpired: true } });
    expect(button('Count the votes')).toBeUndefined(); expect(button('Cast vote')).toBeDefined();
    await vi.advanceTimersByTimeAsync(2000); render();
    expect(button('Count the votes')).toBeDefined(); expect(button('Cast vote')).toBeUndefined();
  });

  it.each([null, undefined, '', '0', '-1', 'invalid', `${START / 1000 - 1}broken`, '2099999999.5', '1e12', true, '9007199254740993'])('keeps unknown/invalid deadline %s read-only even with a stale expired flag', async endTimestamp => {
    const html = render({ poll: { ...props.poll, endTimestamp, isExpired: true } });
    expect(html).toContain('The voting deadline is still being verified.');
    expect(button('Cast vote')).toBeUndefined(); expect(button('Count the votes')).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(5000); render();
    expect(button('Count the votes')).toBeUndefined(); expect(props.onFinalize).not.toHaveBeenCalled();
  });

  it('keeps completed proposals complete before and after their deadline', async () => {
    render({ poll: { ...props.poll, isOngoing: false, status: 'Finalized', winningOption: 0, isValid: true } });
    expect(button('Cast vote')).toBeUndefined(); expect(button('Count the votes')).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(3000); render();
    expect(button('Cast vote')).toBeUndefined(); expect(button('Count the votes')).toBeUndefined();
  });

  it('keeps long windows live while safely rearming a bounded timer', async () => {
    const delay = 3000000000;
    render({ poll: { ...props.poll, endTimestamp: String((START + delay) / 1000) } });
    await vi.advanceTimersByTimeAsync(2147483647);
    expect(fixture.dirty).toBe(true); render();
    expect(button('Cast vote')).toBeDefined(); expect(button('Count the votes')).toBeUndefined();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(delay - 2147483647);
    expect(fixture.dirty).toBe(true); render();
    expect(button('Cast vote')).toBeUndefined(); expect(button('Count the votes')).toBeDefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});
