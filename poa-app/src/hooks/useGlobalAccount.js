import { useAccount } from '@/context/WalletContext';
/**
 * useGlobalAccount Hook
 * Provides global account state (username, account existence) independent of organization context.
 * Queries ALL chain subgraphs to find the account — accounts may be registered on any chain
 * (e.g., Gnosis via solidarity onboarding, Arbitrum via org onboarding).
 * Merges metadata across chains, preferring the most populated fields.
 * Supports both wallet (EOA) and passkey authentication.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createScopedRequestGate } from '@/lib/services/scopedRequestGate';
import { findGlobalAccountAcrossChains } from '@/util/crossChainUsername';
import { useRefresh } from '@/context/RefreshContext';
import { useAuth } from '@/context/authState';



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
  const scope = `${isAuthHydrated === false ? 'pending' : 'resolved'}:${lookupAddress}`;
  requestGate.current.setScope(scope);

  const [result, setResult] = useState({ scope: null, username: null, profileMetadata: null, loading: true });

  const fetchAccount = useCallback(async (fresh = false) => {
    const isCurrent = requestGate.current.start(scope);
    if (!isCurrent) return; // Captured refresh callback from a previous identity.
    if (isAuthHydrated === false) return;
    if (!lookupAddress) {
      setResult({ scope, username: null, profileMetadata: null, loading: false, availability: 'known' });
      return;
    }

    setResult((previous) => ({
      scope,
      username: previous.scope === scope ? previous.username : null,
      profileMetadata: previous.scope === scope ? previous.profileMetadata : null,
      loading: true,
    }));
    try {
      const account = await findGlobalAccountAcrossChains(lookupAddress, { fresh });
      if (isCurrent()) setResult({ scope, username: account.username, profileMetadata: account.profileMetadata,
        loading: false, availability: account.isComplete ? 'known' : 'partial' });
    } catch {
      if (isCurrent()) setResult((previous) => ({ ...previous, scope, loading: false, availability: 'unavailable' }));
    }
  }, [lookupAddress, scope, isAuthHydrated]);

  const refetchAccount = useCallback(() => fetchAccount(true), [fetchAccount]);

  // Initial fetch
  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  // Refetch on relevant events
  useEffect(() => {
    if (!subscribe) return;

    const unsub1 = subscribe('user:created', () => fetchAccount(true));
    const unsub2 = subscribe('user:username_changed', () => fetchAccount(true));
    const unsub3 = subscribe('user:profile_updated', () => fetchAccount(true));

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [subscribe, fetchAccount]);

  // Mask previous identity synchronously, before the new fetch effect runs.
  const current = result.scope === scope ? result : null;
  return {
    globalUsername: current?.username || null,
    hasAccount: current?.username ? true : current?.availability === 'known' ? false : null,
    isUnavailable: current?.availability === 'unavailable' || current?.availability === 'partial',
    isLoading: isAuthHydrated === false || !current || current.loading,
    refetchAccount,
    profileMetadata: current?.profileMetadata || null,
  };
}

export default useGlobalAccount;
