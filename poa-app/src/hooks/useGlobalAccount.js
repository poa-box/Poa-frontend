import { useAccount } from '@/context/WalletContext';
/**
 * useGlobalAccount Hook
 * Provides global account state (username, account existence) independent of organization context.
 * Queries ALL chain subgraphs to find the account — accounts may be registered on any chain
 * (e.g., Gnosis via solidarity onboarding, Arbitrum via org onboarding).
 * Merges metadata across chains, preferring the most complete/recent version.
 * Supports both wallet (EOA) and passkey authentication.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createScopedRequestGate } from '@/lib/services/scopedRequestGate';
import { ACCOUNT_QUERY } from '@/util/accountQueries';
import { useRefresh } from '@/context/RefreshContext';
import { useAuth } from '@/context/authState';
import { getAllSubgraphUrls } from '@/config/networks';
import { getClient } from '@/util/apolloClient';



/**
 * Count non-null fields in a metadata object.
 * Used to pick the most complete metadata across chains.
 */
function metadataRichness(meta) {
  if (!meta) return 0;
  let count = 0;
  if (meta.bio) count++;
  if (meta.avatar) count++;
  if (meta.github) count++;
  if (meta.twitter) count++;
  if (meta.website) count++;
  return count;
}

/**
 * Hook to check if the authenticated user has a registered account.
 * Works for both wallet and passkey users via AuthContext's unified accountAddress.
 * Searches across ALL mainnet subgraphs (Arbitrum, Gnosis, etc.) to find the account.
 * When the account exists on multiple chains, picks the metadata with the most fields populated.
 */
export function useGlobalAccount() {
  const { address: wagmiAddress } = useAccount();
  const { accountAddress, isAuthHydrated } = useAuth();
  const { subscribe } = useRefresh();

  const lookupAddress = (accountAddress || wagmiAddress || '').toLowerCase();
  const requestGate = useRef(null);
  if (!requestGate.current) requestGate.current = createScopedRequestGate();
  requestGate.current.setScope(lookupAddress);

  const [result, setResult] = useState({ scope: null, username: null, profileMetadata: null, loading: true });

  const fetchAccount = useCallback(async () => {
    const isCurrent = requestGate.current.start(lookupAddress);
    if (!isCurrent) return; // Captured refresh callback from a previous identity.
    if (!lookupAddress) {
      setResult({ scope: lookupAddress, username: null, profileMetadata: null, loading: false });
      return;
    }

    setResult((previous) => ({
      scope: lookupAddress,
      username: previous.scope === lookupAddress ? previous.username : null,
      profileMetadata: previous.scope === lookupAddress ? previous.profileMetadata : null,
      loading: true,
    }));
    const sources = getAllSubgraphUrls();
    const id = lookupAddress.toLowerCase();

    try {
      const results = await Promise.allSettled(
        sources.map(async (source) => {
          const { data } = await getClient(source.url).query({
            query: ACCOUNT_QUERY,
            variables: { id },
            fetchPolicy: 'cache-first',
          });
          return data?.account || null;
        })
      );

      // Collect all valid accounts across chains
      let bestUsername = null;
      let bestMetadata = null;
      let bestRichness = -1;

      for (const result of results) {
        if (result.status !== 'fulfilled' || !result.value) continue;
        const account = result.value;
        if (!account.username) continue;

        // Always take the username (should be consistent across chains)
        if (!bestUsername) bestUsername = account.username;

        // Pick the metadata with the most populated fields
        const richness = metadataRichness(account.metadata);
        if (richness > bestRichness) {
          bestRichness = richness;
          bestMetadata = account.metadata || null;
        }
      }

      if (isCurrent()) setResult({ scope: lookupAddress, username: bestUsername, profileMetadata: bestMetadata, loading: false });
    } catch (err) {
      console.error('[useGlobalAccount] Cross-chain lookup failed:', err);
    } finally {
      if (isCurrent()) setResult((previous) => ({ ...previous, loading: false }));
    }
  }, [lookupAddress]);

  // Initial fetch
  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  // Refetch on relevant events
  useEffect(() => {
    if (!subscribe) return;

    const unsub1 = subscribe('user:created', () => fetchAccount());
    const unsub2 = subscribe('user:username_changed', () => fetchAccount());
    const unsub3 = subscribe('user:profile_updated', () => fetchAccount());

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [subscribe, fetchAccount]);

  // Mask previous identity synchronously, before the new fetch effect runs.
  const current = result.scope === lookupAddress ? result : null;
  return {
    globalUsername: current?.username || null,
    hasAccount: !!current?.username,
    isLoading: isAuthHydrated === false || !current || current.loading,
    refetchAccount: fetchAccount,
    profileMetadata: current?.profileMetadata || null,
  };
}

export default useGlobalAccount;
