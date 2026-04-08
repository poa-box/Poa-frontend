/**
 * useGlobalAccount Hook
 * Provides global account state (username, account existence) independent of organization context.
 * Queries ALL chain subgraphs to find the account — accounts may be registered on any chain
 * (e.g., Gnosis via solidarity onboarding, Arbitrum via org onboarding).
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
 * Hook to check if the authenticated user has a registered account.
 * Works for both wallet and passkey users via AuthContext's unified accountAddress.
 * Searches across ALL mainnet subgraphs (Arbitrum, Gnosis, etc.) to find the account.
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

      // Use the first chain that has the account
      for (const result of results) {
        if (result.status !== 'fulfilled' || !result.value) continue;
        const account = result.value;
        if (account.username) {
          setUsername(account.username);
          setProfileMetadata(account.metadata || null);
          setLoading(false);
          return;
        }
      }

      // Not found on any chain
      setUsername(null);
      setProfileMetadata(null);
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
