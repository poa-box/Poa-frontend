/**
 * IdentityContext
 *
 * App-wide identity cache for resolving address -> { username, avatar, bio, ... }
 * across all chains. Profile metadata may live on any chain because the
 * UniversalAccountRegistry is deployed everywhere; this context federates
 * reads so callers don't need to know which chain holds a user's data.
 *
 * Features:
 *  - In-memory Map keyed by lowercase address.
 *  - Promise deduplication: parallel resolutions for the same address share one fetch.
 *  - TTL with stale-while-revalidate: stale entries are returned immediately while
 *    a background refresh runs.
 *  - Bulk warm: callers can seed records (e.g. POContext leaderboard data) without
 *    triggering a fetch.
 *  - Invalidation: subscribes to RefreshEvent.PROFILE_UPDATED and evicts that address.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  findUserProfileByAddress,
  findUserProfilesByAddresses,
} from '@/util/crossChainUsername';
import { useRefreshSubscription, RefreshEvent } from '@/context/RefreshContext';

const TTL_MS = 5 * 60 * 1000; // 5 minutes

const IdentityContext = createContext(null);

const normalize = (addr) => (addr ? String(addr).toLowerCase() : null);

function buildRecord({ address, username, metadata, sourceChain, sourceChainId }) {
  return {
    address,
    username: username || null,
    avatarCid: metadata?.avatar || null,
    bio: metadata?.bio || null,
    github: metadata?.github || null,
    twitter: metadata?.twitter || null,
    website: metadata?.website || null,
    sourceChain: sourceChain || null,
    sourceChainId: sourceChainId || null,
    resolvedAt: Date.now(),
  };
}

function emptyRecord(address) {
  return {
    address,
    username: null,
    avatarCid: null,
    bio: null,
    github: null,
    twitter: null,
    website: null,
    sourceChain: null,
    sourceChainId: null,
    resolvedAt: Date.now(),
    isEmpty: true,
  };
}

export function IdentityProvider({ children }) {
  const cacheRef = useRef(new Map()); // address(lc) -> record
  const inFlightRef = useRef(new Map()); // address(lc) -> Promise<record>
  // version counter forces re-render of consumers when the cache mutates
  const [version, setVersion] = useState(0);
  const bumpVersion = useCallback(() => setVersion((v) => v + 1), []);

  const getCached = useCallback((address) => {
    const key = normalize(address);
    if (!key) return null;
    return cacheRef.current.get(key) || null;
  }, []);

  const isStale = useCallback((record) => {
    if (!record) return true;
    return Date.now() - record.resolvedAt > TTL_MS;
  }, []);

  /**
   * Seed the cache with a record without triggering a fetch.
   * Used by POContext to warm from leaderboard data.
   */
  const seedIdentity = useCallback((address, partial) => {
    const key = normalize(address);
    if (!key) return;
    const existing = cacheRef.current.get(key);
    // Don't overwrite a fresh, network-resolved record with a partial seed.
    if (existing && !existing.isEmpty && !isStale(existing)) return;
    const record = {
      address: key,
      username: partial.username || null,
      avatarCid: partial.avatarCid || partial.avatar || null,
      bio: partial.bio || null,
      github: partial.github || null,
      twitter: partial.twitter || null,
      website: partial.website || null,
      sourceChain: partial.sourceChain || null,
      sourceChainId: partial.sourceChainId || null,
      resolvedAt: Date.now(),
      isSeed: true,
    };
    cacheRef.current.set(key, record);
    bumpVersion();
  }, [bumpVersion, isStale]);

  const seedIdentities = useCallback((entries) => {
    if (!Array.isArray(entries) || entries.length === 0) return;
    let mutated = false;
    for (const entry of entries) {
      if (!entry?.address) continue;
      const key = normalize(entry.address);
      const existing = cacheRef.current.get(key);
      if (existing && !existing.isEmpty && !isStale(existing)) continue;
      cacheRef.current.set(key, {
        address: key,
        username: entry.username || null,
        avatarCid: entry.avatarCid || entry.avatar || null,
        bio: entry.bio || null,
        github: entry.github || null,
        twitter: entry.twitter || null,
        website: entry.website || null,
        sourceChain: entry.sourceChain || null,
        sourceChainId: entry.sourceChainId || null,
        resolvedAt: Date.now(),
        isSeed: true,
      });
      mutated = true;
    }
    if (mutated) bumpVersion();
  }, [bumpVersion, isStale]);

  const invalidate = useCallback((address) => {
    const key = normalize(address);
    if (!key) return;
    cacheRef.current.delete(key);
    inFlightRef.current.delete(key);
    bumpVersion();
  }, [bumpVersion]);

  /**
   * Resolve a single address. Returns a record (possibly empty).
   * Dedupes in-flight fetches for the same address.
   */
  const resolveIdentity = useCallback(async (address) => {
    const key = normalize(address);
    if (!key) return null;

    // Return fresh cached record immediately
    const cached = cacheRef.current.get(key);
    if (cached && !cached.isSeed && !isStale(cached)) {
      return cached;
    }

    // Dedupe parallel resolutions
    const existing = inFlightRef.current.get(key);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const result = await findUserProfileByAddress(key);
        const record = result?.address ? buildRecord(result) : emptyRecord(key);
        cacheRef.current.set(key, record);
        bumpVersion();
        return record;
      } catch (err) {
        console.warn('[IdentityContext] resolveIdentity failed for', key, err);
        const record = emptyRecord(key);
        cacheRef.current.set(key, record);
        bumpVersion();
        return record;
      } finally {
        inFlightRef.current.delete(key);
      }
    })();

    inFlightRef.current.set(key, promise);
    return promise;
  }, [bumpVersion, isStale]);

  /**
   * Resolve many addresses at once via a single batched cross-chain query.
   * Skips addresses with fresh cached data. Returns nothing; consumers should
   * read via useIdentity / getCached after the promise settles.
   */
  const resolveIdentities = useCallback(async (addresses) => {
    if (!Array.isArray(addresses) || addresses.length === 0) return;
    const toFetch = [];
    for (const addr of addresses) {
      const key = normalize(addr);
      if (!key) continue;
      const cached = cacheRef.current.get(key);
      if (cached && !cached.isSeed && !isStale(cached)) continue;
      if (inFlightRef.current.has(key)) continue;
      toFetch.push(key);
    }
    if (toFetch.length === 0) return;

    // Mark all as in-flight via a shared promise so single-address calls dedupe.
    const sharedPromise = (async () => {
      try {
        const map = await findUserProfilesByAddresses(toFetch);
        for (const key of toFetch) {
          const entry = map.get(key);
          const record = entry ? buildRecord({ address: key, ...entry }) : emptyRecord(key);
          cacheRef.current.set(key, record);
        }
        bumpVersion();
      } catch (err) {
        console.warn('[IdentityContext] resolveIdentities failed', err);
        for (const key of toFetch) {
          if (!cacheRef.current.has(key)) {
            cacheRef.current.set(key, emptyRecord(key));
          }
        }
        bumpVersion();
      } finally {
        for (const key of toFetch) inFlightRef.current.delete(key);
      }
    })();

    for (const key of toFetch) inFlightRef.current.set(key, sharedPromise);
    return sharedPromise;
  }, [bumpVersion, isStale]);

  // Subscribe to PROFILE_UPDATED to invalidate stale records
  useRefreshSubscription(
    RefreshEvent.PROFILE_UPDATED,
    ({ data }) => {
      if (data?.address) invalidate(data.address);
    },
    [invalidate]
  );

  // Including `version` in the deps means the value identity changes on every
  // cache mutation, which re-renders all useContext consumers — that's how
  // useIdentity / useIdentities pick up new data.
  const value = useMemo(() => ({
    getCached,
    resolveIdentity,
    resolveIdentities,
    seedIdentity,
    seedIdentities,
    invalidate,
  }), [getCached, resolveIdentity, resolveIdentities, seedIdentity, seedIdentities, invalidate, version]);

  return (
    <IdentityContext.Provider value={value}>
      {children}
    </IdentityContext.Provider>
  );
}

/**
 * Returns the raw context (advanced consumers).
 */
export function useIdentityContext() {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    throw new Error('useIdentityContext must be used within IdentityProvider');
  }
  return ctx;
}

/**
 * Resolve one address to its identity record. Triggers a fetch if needed.
 * Returns a record object (always non-null); fields may be null while loading.
 *
 * Re-renders automatically when the cache changes — the provider's value
 * identity changes on each cache mutation, so useContext re-runs the consumer.
 * The effect only depends on stable callbacks + the address, so it does not
 * re-fire on unrelated cache mutations.
 */
export function useIdentity(address) {
  const { getCached, resolveIdentity } = useContext(IdentityContext) || {};
  const key = normalize(address);

  useEffect(() => {
    if (!getCached || !resolveIdentity || !key) return;
    const cached = getCached(key);
    if (!cached || cached.isSeed || (Date.now() - cached.resolvedAt) > TTL_MS) {
      resolveIdentity(key);
    }
  }, [getCached, resolveIdentity, key]);

  if (!key) return null;
  return getCached?.(key) || emptyRecord(key);
}

/**
 * Resolve many addresses at once. Returns a Map<lowerAddress, record>.
 * Callers don't need to memoize the addresses array — the effect dedupes via
 * the joined fingerprint string.
 */
export function useIdentities(addresses) {
  const { getCached, resolveIdentities } = useContext(IdentityContext) || {};

  const keys = useMemo(() => {
    if (!Array.isArray(addresses)) return [];
    return addresses.map(normalize).filter(Boolean);
  }, [addresses]);

  // Stable fingerprint: avoids re-firing the effect on equal-but-new arrays.
  const keysFingerprint = keys.join(',');

  useEffect(() => {
    if (!resolveIdentities || !keysFingerprint) return;
    resolveIdentities(keysFingerprint.split(','));
    // The effect reconstructs the list from the fingerprint, so depending
    // on the string alone (rather than the array) is sufficient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolveIdentities, keysFingerprint]);

  const out = new Map();
  if (!getCached) return out;
  for (const key of keys) {
    out.set(key, getCached(key) || emptyRecord(key));
  }
  return out;
}

export default IdentityContext;
