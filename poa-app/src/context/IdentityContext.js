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

import { createIdentityCache, emptyIdentity, IDENTITY_TTL_MS } from '@/lib/graphql/identityCache';

const TTL_MS = IDENTITY_TTL_MS;
const IdentityContext = createContext(null);
const normalize = (address) => address ? String(address).toLowerCase() : null;
const emptyRecord = (address) => ({ ...emptyIdentity(address), isEmpty: false, isPending: true });

export function IdentityProvider({ children }) {
  const [version, setVersion] = useState(0);
  const cacheRef = useRef(null);
  if (!cacheRef.current) cacheRef.current = createIdentityCache({
    fetchOne: findUserProfileByAddress, fetchMany: findUserProfilesByAddresses,
    onChange: () => setVersion((value) => value + 1),
  });
  const cache = cacheRef.current;
  useRefreshSubscription(RefreshEvent.PROFILE_UPDATED, ({ data }) => {
    if (data?.address) cache.invalidate(data.address);
  }, [cache]);
  useRefreshSubscription(RefreshEvent.USERNAME_CHANGED, ({ data }) => {
    if (data?.address) cache.invalidate(data.address);
  }, [cache]);
  const value = useMemo(() => ({ ...cache, version }), [cache, version]);
  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
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
  }, [resolveIdentities, keysFingerprint]);

  const out = new Map();
  if (!getCached) return out;
  for (const key of keys) {
    out.set(key, getCached(key) || emptyRecord(key));
  }
  return out;
}

export default IdentityContext;
