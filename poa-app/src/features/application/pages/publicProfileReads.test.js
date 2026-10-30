import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ slots: [], cursor: 0, effects: [], profile: vi.fn(), organizations: vi.fn() }));
vi.mock('react', async original => {
  const actual = await original();
  const memo = (fn, deps) => {
    const index = fixture.cursor++, previous = fixture.slots[index];
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) fixture.slots[index] = { deps, value: fn() };
    return fixture.slots[index].value;
  };
  return { ...actual, useRef: value => { const index = fixture.cursor++; return fixture.slots[index] ||= { current: value }; },
    useState: initial => { const index = fixture.cursor++; fixture.slots[index] ||= { value: initial };
      return [fixture.slots[index].value, value => { fixture.slots[index].value = typeof value === 'function' ? value(fixture.slots[index].value) : value; }]; },
    useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect: (fn, deps) => {
      const index = fixture.cursor++, previous = fixture.slots[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) fixture.effects.push(() => {
        previous?.cleanup?.(); fixture.slots[index] = { deps, cleanup: fn() };
      });
    },
  };
});
vi.mock('@/util/crossChainUsername', () => ({ findUserProfileByUsername: (...args) => fixture.profile(...args), findUserOrgsAcrossChains: (...args) => fixture.organizations(...args) }));
import { usePublicProfile, useProfileMemberships, usePreservedProfileMetadata, knownNativeBalance } from '@/features/application/pages/publicProfileReads';
const pending = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const profile = (name = 'alice', complete = true) => ({ address: name, username: name, metadata: { bio: 'Known biography' }, isComplete: complete });
const cards = (ids, complete = true) => Object.assign(ids.map(id => ({ id, sourceChainId: 100 })), { isComplete: complete });
const render = (hook, ...args) => { fixture.cursor = 0; const result = hook(...args); for (const effect of fixture.effects.splice(0)) effect(); return result; };
const flush = () => new Promise(resolve => setImmediate(resolve));
beforeEach(() => { vi.clearAllMocks(); fixture.slots = []; fixture.effects = []; fixture.cursor = 0; vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); })); });
afterEach(() => vi.unstubAllGlobals());
describe('public profile availability and async identity scope', () => {
  it('keeps outage unknown, proves absence only with complete evidence and retries successfully', async () => {
    fixture.profile.mockRejectedValueOnce(new Error('all sources unavailable')).mockResolvedValueOnce({ address: null, isComplete: false }).mockResolvedValueOnce({ address: null, isComplete: true });
    render(usePublicProfile, 'alice', true); await flush();
    let result = render(usePublicProfile, 'alice', true);
    expect(result).toMatchObject({ isLoading: false, isUnavailable: true, notFound: false, profile: null });
    await result.refetch(); result = render(usePublicProfile, 'alice', true);
    expect(result).toMatchObject({ isUnavailable: true, notFound: false });
    await result.refetch(); expect(render(usePublicProfile, 'alice', true)).toMatchObject({ notFound: true, isUnavailable: false });
  });
  it('preserves known profile data through partial and total source failures', async () => {
    fixture.profile.mockResolvedValueOnce(profile()).mockResolvedValueOnce({ ...profile('alice', false), metadata: { bio: null, website: 'https://community.invalid' } }).mockRejectedValueOnce(new Error('offline'));
    render(usePublicProfile, 'alice', true); await flush();
    await render(usePublicProfile, 'alice', true).refetch();
    let result = render(usePublicProfile, 'alice', true);
    expect(result.profile.metadata).toEqual({ bio: 'Known biography', website: 'https://community.invalid' });
    expect(result.isUnavailable).toBe(true);
    await result.refetch(); result = render(usePublicProfile, 'alice', true);
    expect(result.profile.metadata.bio).toBe('Known biography'); expect(result.notFound).toBe(false);
  });
  it('masks the previous username immediately and rejects A → B → A stale results and saved retries', async () => {
    const old = pending(), next = pending(), restored = pending();
    fixture.profile.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise).mockReturnValueOnce(restored.promise);
    const saved = render(usePublicProfile, 'alice', true).refetch;
    expect(render(usePublicProfile, 'bob', true).profile).toBeNull();
    await saved(); expect(fixture.profile).toHaveBeenCalledTimes(2);
    render(usePublicProfile, 'alice', true);
    restored.resolve(profile('restored')); await flush();
    old.resolve(profile('old')); next.resolve(profile('bob')); await flush();
    expect(render(usePublicProfile, 'alice', true).profile.username).toBe('restored');
  });
  it('does not read before routing is ready and invalidates callbacks after unmount', async () => {
    render(usePublicProfile, 'alice', false); expect(fixture.profile).not.toHaveBeenCalled();
    const request = pending(); fixture.profile.mockReturnValue(request.promise);
    render(usePublicProfile, 'alice', true);
    const state = fixture.slots.find(slot => Object.prototype.hasOwnProperty.call(slot, 'value') && slot.value?.scope === 'alice');
    for (const slot of fixture.slots) slot.cleanup?.();
    request.resolve(profile()); await flush();
    expect(state.value.loading).toBe(true);
  });
});
describe('organization membership coverage', () => {
  it('keeps known cards during partial/all-source outage and replaces them only on a complete refresh', async () => {
    fixture.organizations.mockResolvedValueOnce(cards(['a'])).mockResolvedValueOnce(cards(['b'], false)).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(cards([]));
    render(useProfileMemberships, 'ALICE'); await flush();
    await render(useProfileMemberships, 'ALICE').refetch();
    let result = render(useProfileMemberships, 'ALICE');
    expect(result.organizations.map(card => card.id)).toEqual(['a', 'b']); expect(result.isComplete).toBe(false);
    await result.refetch(); result = render(useProfileMemberships, 'ALICE');
    expect(result.organizations).toHaveLength(2); expect(result.isUnavailable).toBe(true);
    await result.refetch(); result = render(useProfileMemberships, 'ALICE');
    expect(result.organizations).toHaveLength(0); expect(result).toMatchObject({ isComplete: true, isUnavailable: false });
  });
  it('never leaks the old account cards to a restored different account or accepts its late callback', async () => {
    const old = pending(), fresh = pending();
    fixture.organizations.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const saved = render(useProfileMemberships, 'alice').refetch;
    expect(render(useProfileMemberships, 'bob').organizations).toEqual([]);
    await saved(); expect(fixture.organizations).toHaveBeenCalledTimes(2);
    fresh.resolve(cards(['bob'])); old.resolve(cards(['alice'])); await flush();
    expect(render(useProfileMemberships, 'bob').organizations.map(card => card.id)).toEqual(['bob']);
  });
  it('does not fetch memberships for an unresolved identity', () => {
    expect(render(useProfileMemberships, 'alice', false)).toMatchObject({ organizations: [], isComplete: false });
    expect(fixture.organizations).not.toHaveBeenCalled();
  });
});
describe('account native balance gate', () => {
  it('preserves known account metadata on partial failure, accepts explicit clears when complete and masks account switches', () => {
    expect(render(usePreservedProfileMetadata, undefined, null, true)).toEqual({});
    const known = render(usePreservedProfileMetadata, 'alice', { bio: 'Known', website: 'https://community.invalid' }, false);
    expect(render(usePreservedProfileMetadata, 'alice', { bio: null }, true)).toBe(known);
    expect(render(usePreservedProfileMetadata, 'alice', { bio: null }, true)).toBe(known);
    expect(render(usePreservedProfileMetadata, 'bob', null, true)).toEqual({});
    expect(render(usePreservedProfileMetadata, 'alice', { bio: '' }, false)).toEqual({ bio: '' });
  });
  it('keeps unknown separate from exact zero and large known balances', () => {
    expect(knownNativeBalance({ 100: null }, 100)).toBeNull(); expect(knownNativeBalance({}, 100)).toBeNull();
    expect(knownNativeBalance({ 100: '0' }, 100)).toBe('0');
    expect(knownNativeBalance({ 100: '9007199254740993123456789' }, 100)).toBe('9007199254740993123456789');
  });
});
