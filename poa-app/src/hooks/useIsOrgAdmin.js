/**
 * useIsOrgAdmin - Hook to check if a user is an org metadata admin
 * A metadata admin is someone who wears the topHat OR a configured metadata admin hat
 *
 * Reads metadataAdminHatId from the subgraph (via POContext) instead of
 * making an RPC call to the smart contract.
 *
 * Logic mirrors the smart contract:
 * 1. If metadataAdminHatId != 0, check if user wears that hat
 * 2. Otherwise, fall back to checking if user wears the topHat
 */

import { useMemo } from 'react';
import { useUserContext } from '@/context/UserContext';
import { usePOContext } from '@/context/POContext';

/**
 * Check if a user is an org admin
 * @param {string} orgId - The organization ID (bytes32) - kept for API compatibility
 * @param {string} userAddress - The user's wallet address
 * @returns {Object} { isAdmin: boolean, loading: boolean, error: Error|null }
 */
export function useIsOrgAdmin(orgId, userAddress) {
  const { userData, loading: userLoading } = useUserContext();
  const { topHatId, metadataAdminHatId, poContextLoading } = usePOContext();

  const result = useMemo(() => {
    const isLoading = userLoading || poContextLoading;
    if (isLoading) {
      return { isAdmin: false, loading: true, error: null };
    }

    if (!userAddress) {
      return { isAdmin: false, loading: false, error: null };
    }

    const userHatIds = userData?.hatIds || [];
    if (userHatIds.length === 0) {
      return { isAdmin: false, loading: false, error: null };
    }

    // Convert hat IDs to strings for comparison (hat IDs can be BigInt)
    const userHatIdStrings = userHatIds.map(id => id.toString());

    // Use metadataAdminHatId from subgraph if set, otherwise fall back to topHat
    const effectiveAdminHat = metadataAdminHatId || (topHatId ? topHatId.toString() : null);

    if (!effectiveAdminHat) {
      return { isAdmin: false, loading: false, error: null };
    }

    const isAdmin = userHatIdStrings.includes(effectiveAdminHat.toString());

    return { isAdmin, loading: false, error: null };
  }, [userData, userAddress, topHatId, metadataAdminHatId, userLoading, poContextLoading]);

  return result;
}

export default useIsOrgAdmin;
