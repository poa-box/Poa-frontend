import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMountedProposalDetail } from '@/hooks/useMountedProposalDetail';

// Deterministic effect scheduler: run the actual hook through scope changes without a browser.
const harness = vi.hoisted(() => ({ slots: [], cursor: 0, effects: [], po: {}, read: null }));
vi.mock('react', () => {
  const equal = (a, b) => a?.length === b?.length && a.every((value, i) => Object.is(value, b[i]));
  const computeMemo = (compute, deps) => {
    const index = harness.cursor++;
    if (!equal(harness.slots[index]?.deps, deps)) harness.slots[index] = { value: compute(), deps };
    return harness.slots[index].value;
  };
  return {
    useMemo: computeMemo, useCallback: (fn, deps) => computeMemo(() => fn, deps),
    useState: initial => {
      const index = harness.cursor++;
      if (!harness.slots[index]) harness.slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [harness.slots[index].value, next => { const slot = harness.slots[index]; slot.value = typeof next === 'function' ? next(slot.value) : next; }];
    },
    useEffect: (effect, deps) => {
      const index = harness.cursor++;
      const old = harness.slots[index];
      if (!equal(old?.deps, deps)) {
        old?.cleanup?.();
        harness.slots[index] = { deps };
        harness.effects.push(() => { harness.slots[index].cleanup = effect(); });
      }
    },
  };
});
vi.mock('@/context/POContext', () => ({ usePOContext: () => harness.po }));
vi.mock('@/context/RefreshContext', () => ({ RefreshEvent: {}, useRefreshSubscription() {} }));
vi.mock('@/lib/graphql/coreQuery', () => ({ apolloProtocolQuery: vi.fn() }));
vi.mock('@/lib/voting/mountedProposalDetail', () => ({ readMountedProposalDetail: (...args) => harness.read(...args) }));

function DetailProbe(props) {
  harness.cursor = 0;
  const result = useMountedProposalDetail(props);
  const effects = harness.effects.splice(0);
  effects.forEach(run => run());
  return result;
}
const props = { poll: { type: 'Hybrid', proposalId: '9', totalVotes: 1 }, contractAddress: `0x${'1'.repeat(40)}`, isOpen: true };
const settle = () => new Promise(resolve => setImmediate(resolve));
beforeEach(() => {
  harness.slots = []; harness.effects = [];
  harness.po = { orgChainId: 100, orgId: 'organization-a', subgraphUrl: 'https://index-a.example' };
  harness.read = vi.fn();
  vi.stubGlobal('fetch', () => { throw new Error('Unexpected network'); });
});
afterEach(() => {
  harness.slots.forEach(slot => slot.cleanup?.());
  vi.unstubAllGlobals();
});

describe('mounted public detail lifecycle', () => {
  it('loads anonymously, hides the old scope synchronously and ignores its late response', async () => {
    let finishA, finishB;
    harness.read.mockImplementationOnce(() => new Promise(resolve => { finishA = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { finishB = resolve; }));
    expect(DetailProbe(props)).toBeNull();
    await vi.waitFor(() => expect(harness.read).toHaveBeenCalledTimes(1));
    expect(harness.read.mock.calls[0][0].scope).not.toHaveProperty('account');
    harness.po = { ...harness.po, orgId: 'organization-b', subgraphUrl: 'https://index-b.example' };
    expect(DetailProbe(props)).toBeNull();
    await vi.waitFor(() => expect(harness.read).toHaveBeenCalledTimes(2));
    finishA({ id: 'old' }); await settle();
    expect(DetailProbe(props)).toBeNull();
    finishB({ id: 'current' }); await settle();
    expect(DetailProbe(props)).toEqual({ id: 'current' });
    expect(DetailProbe({ ...props, isOpen: false })).toBeNull();
  });
  it('does not revive earlier data after leaving and returning to the same scope', async () => {
    let finishOld;
    harness.read.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce({ id: 'second-org' }).mockResolvedValueOnce({ id: 'fresh-first-org' });
    const first = { ...harness.po };
    DetailProbe(props);
    await vi.waitFor(() => expect(harness.read).toHaveBeenCalledTimes(1));
    harness.po = { ...first, orgId: 'organization-b' };
    DetailProbe(props);
    await vi.waitFor(() => expect(harness.read).toHaveBeenCalledTimes(2)); await settle();
    harness.po = first;
    expect(DetailProbe(props)).toBeNull();
    await vi.waitFor(() => expect(harness.read).toHaveBeenCalledTimes(3)); await settle();
    finishOld({ id: 'stale-first-org' }); await settle();
    expect(DetailProbe(props)).toEqual({ id: 'fresh-first-org' });
  });
  it('withdraws a failed refreshed observation and performs no closed-detail reads', async () => {
    harness.read.mockResolvedValueOnce({ id: 'verified' }).mockRejectedValueOnce(new Error('Mock outage'));
    expect(DetailProbe({ ...props, isOpen: false })).toBeNull();
    expect(harness.read).not.toHaveBeenCalled();
    DetailProbe(props);
    await vi.waitFor(() => expect(harness.read).toHaveBeenCalledTimes(1)); await settle();
    expect(DetailProbe(props)).toEqual({ id: 'verified' });
    const refreshed = { ...props, poll: { ...props.poll, totalVotes: 2 } };
    DetailProbe(refreshed); await settle();
    expect(DetailProbe(refreshed)).toBeNull();
  });
});
