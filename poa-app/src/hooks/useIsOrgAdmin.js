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
import { useAuth } from '@/context/authState';
import { resolveMetadataAdminDisplay } from '@/lib/organization/adminDisplay';

/**
 * Check if a user is an org admin
 * @param {string} orgId - The organization ID (bytes32) - kept for API compatibility
 * @param {string} userAddress - The user's wallet address
 * @returns {Object} { isAdmin: boolean, loading: boolean, error: Error|null }
 */
export function useIsOrgAdmin(orgId, userAddress) {
  const { userData, userDataLoading: userLoading, address, error } = useUserContext();
  const { orgId: currentOrgId, topHatId, metadataAdminHatId, metadataAdminHatIdKnown, poContextLoading } = usePOContext();
  const { isAuthHydrated } = useAuth();

  const result = useMemo(() => {
    const isLoading = userLoading || poContextLoading || isAuthHydrated === false;
    if (isLoading) {
      return { isAdmin: false, loading: true, error: null };
    }

    if (!userAddress) {
      return { isAdmin: false, loading: false, error: null };
    }
    if (error) return { isAdmin: false, loading: false, error };
    if (metadataAdminHatIdKnown === false) return { isAdmin: false, loading: true, error: null };
    if (userData?.hatIdsKnown === false) return { isAdmin: false, loading: true, error: null };
    if (currentOrgId !== orgId || address?.toLowerCase() !== userAddress.toLowerCase()) {
      return { isAdmin: false, loading: true, error: null };
    }
    const isAdmin = resolveMetadataAdminDisplay({ metadataAdminHatId, topHatId, userHatIds: userData?.id ? userData.hatIds : [] });
    return { isAdmin: isAdmin === true, loading: isAdmin === null, error: null };
  }, [userData, userAddress, topHatId, metadataAdminHatId, metadataAdminHatIdKnown, userLoading, poContextLoading, currentOrgId, orgId, address, error, isAuthHydrated]);

  return result;
}

export default useIsOrgAdmin;
