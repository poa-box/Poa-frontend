/**
 * useGlobalAccount Hook
 * Provides global account state (username, account existence) independent of organization context.
 * Queries ALL chain subgraphs to find the account — accounts may be registered on any chain
 * (e.g., Gnosis via solidarity onboarding, Arbitrum via org onboarding).
 * Merges metadata across chains, preferring the most complete/recent version.
 * Supports both wallet (EOA) and passkey authentication.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useRefresh } from '@/context/RefreshContext';
import { useAuth } from '@/context/AuthContext';
import { getAllSubgraphUrls } from '@/config/networks';

const ACCOUNT_QUERY = `
  query FetchAccount($id: Bytes!) {
    account(id: $id) {
      id
      username
      profileMetadataHash
      metadata {
        id
        bio
        avatar
        github
        twitter
        website
      }
    }
  }
`;

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
  const { accountAddress } = useAuth();
  const { subscribe } = useRefresh();

  const lookupAddress = accountAddress || wagmiAddress;

  const [username, setUsername] = useState(null);
  const [profileMetadata, setProfileMetadata] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAccount = useCallback(async () => {
    if (!lookupAddress) {
      setUsername(null);
      setProfileMetadata(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const sources = getAllSubgraphUrls();
    const id = lookupAddress.toLowerCase();

    try {
      const results = await Promise.allSettled(
        sources.map(async (source) => {
          const res = await fetch(source.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: ACCOUNT_QUERY, variables: { id } }),
          });
          const json = await res.json();
          return json?.data?.account || null;
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

      setUsername(bestUsername);
      setProfileMetadata(bestMetadata);
    } catch (err) {
      console.error('[useGlobalAccount] Cross-chain lookup failed:', err);
    } finally {
      setLoading(false);
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

  return {
    globalUsername: username,
    hasAccount: !!username,
    isLoading: loading,
    refetchAccount: fetchAccount,
    profileMetadata,
  };
}

export default useGlobalAccount;
