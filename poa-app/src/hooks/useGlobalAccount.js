/**
 * useGlobalAccount Hook
 * Provides global account state (username, account existence) independent of organization context.
 * Uses the UniversalAccountRegistry subgraph data.
 * Supports both wallet (EOA) and passkey authentication.
 */

import { useEffect } from 'react';
import { useQuery } from '@apollo/client';
import { useAccount } from 'wagmi';
import { FETCH_USERNAME_NEW } from '@/util/queries';
import { useRefresh } from '@/context/RefreshContext';
import { useAuth } from '@/context/AuthContext';

/**
 * Hook to check if the authenticated user has a registered account.
 * Works for both wallet and passkey users via AuthContext's unified accountAddress.
 * @returns {Object} Account state
 * @returns {string|null} globalUsername - The registered username or null
 * @returns {boolean} hasAccount - Whether the user has a registered account
 * @returns {boolean} isLoading - Whether the query is loading
 * @returns {Function} refetchAccount - Function to manually refetch account data
 */
export function useGlobalAccount() {
  const { address: wagmiAddress } = useAccount();
  const { accountAddress } = useAuth();
  const { subscribe } = useRefresh();

  // Use unified accountAddress (works for both passkey and wallet users),
  // falling back to wagmi address for compatibility
  const lookupAddress = accountAddress || wagmiAddress;

  const { data, loading, refetch } = useQuery(FETCH_USERNAME_NEW, {
    variables: { id: lookupAddress?.toLowerCase() },
    skip: !lookupAddress,
    fetchPolicy: 'cache-and-network',
  });

  // Subscribe to refresh events to update when account is created/changed
  useEffect(() => {
    if (!subscribe) return;

    const unsub1 = subscribe('user:created', () => {
      setTimeout(() => refetch(), 1500);
    });
    const unsub2 = subscribe('user:username_changed', () => {
      setTimeout(() => refetch(), 1500);
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [subscribe, refetch]);

  const username = data?.account?.username || null;

  return {
    globalUsername: username,
    hasAccount: !!username,
    isLoading: loading,
    refetchAccount: refetch,
  };
}

export default useGlobalAccount;
