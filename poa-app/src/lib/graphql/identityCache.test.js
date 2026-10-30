import { describe, expect, it, vi } from 'vitest';
import { createIdentityCache, IDENTITY_TTL_MS } from '@/lib/graphql/identityCache';
const pending = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const profile = (address, username) => ({ address, username, metadata: { bio: username }, isComplete: true });

describe('identity host cache lifecycle', () => {
  it('dedupes, retains the five-minute TTL and allows stale refresh without losing the saved profile', async () => {
    let time = 100;
    const fetchOne = vi.fn().mockResolvedValueOnce(profile('a', 'first')).mockRejectedValueOnce(new Error('mock outage'));
    const cache = createIdentityCache({ fetchOne, now: () => time });
    const [one, two] = await Promise.all([cache.resolveIdentity('A'), cache.resolveIdentity('a')]);
    expect(one).toEqual(two); expect(fetchOne).toHaveBeenCalledTimes(1);
    time += IDENTITY_TTL_MS; await cache.resolveIdentity('a'); expect(fetchOne).toHaveBeenCalledTimes(1);
    time++; await cache.resolveIdentity('a');
    expect(cache.getCached('a')).toMatchObject({ username: 'first', isUnavailable: true, isEmpty: false });
    expect(fetchOne).toHaveBeenLastCalledWith('a', { fresh: true });
  });
  it('prevents an invalidated older response from overwriting a newer identity request', async () => {
    const old = pending(), fresh = pending();
    const fetchOne = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const cache = createIdentityCache({ fetchOne });
    const first = cache.resolveIdentity('a'); await Promise.resolve();
    cache.invalidate('a'); const second = cache.resolveIdentity('a'); await Promise.resolve();
    fresh.resolve(profile('a', 'fresh')); await second;
    old.resolve(profile('a', 'old')); await first;
    expect(cache.getCached('a').username).toBe('fresh');
  });
  it('shares a batch with a single lookup, returns its record, and never caches incomplete absence', async () => {
    const batch = pending();
    const fetchOne = vi.fn(); const fetchMany = vi.fn().mockReturnValue(batch.promise);
    const cache = createIdentityCache({ fetchOne, fetchMany });
    const all = cache.resolveIdentities(['a', 'a', 'b']);
    const single = cache.resolveIdentity('a');
    const map = Object.assign(new Map([['a', profile('a', 'known')]]), { coverage: { status: 'incomplete' } });
    batch.resolve(map); await all;
    expect((await single).username).toBe('known');
    expect(fetchMany).toHaveBeenCalledWith(['a', 'b'], { fresh: false }); expect(fetchOne).not.toHaveBeenCalled();
    expect(cache.getCached('b')).toMatchObject({ isEmpty: false, isUnavailable: true });
  });
  it('seeds data, upgrades the seed through network resolution and caches confirmed absence', async () => {
    const fetchOne = vi.fn().mockResolvedValueOnce(profile('a', 'full')).mockResolvedValueOnce({ address: null, isComplete: true });
    const cache = createIdentityCache({ fetchOne });
    cache.seedIdentity('A', { username: 'seed' });
    expect(cache.getCached('a').username).toBe('seed');
    await cache.resolveIdentity('a'); cache.seedIdentity('a', { username: 'old seed' });
    expect(cache.getCached('a').username).toBe('full');
    await cache.resolveIdentity('b'); expect(cache.getCached('b')).toMatchObject({ isEmpty: true });
  });
});
