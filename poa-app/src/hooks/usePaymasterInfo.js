/**
 * usePaymasterInfo
 * Query paymaster org configuration from the subgraph.
 */

import { useQuery } from '@apollo/client';
import { usePOContext } from '../context/POContext';
import { FETCH_PAYMASTER_ORG_CONFIG } from '../util/passkeyQueries';

/**
 * Hook to get paymaster configuration for the current org.
 *
 * @returns {Object} Paymaster info
 */
export function usePaymasterInfo() {
  const { orgId } = usePOContext();

  const { data, loading, error } = useQuery(FETCH_PAYMASTER_ORG_CONFIG, {
    variables: { orgId },
    skip: !orgId,
    fetchPolicy: 'cache-first',
  });

  const config = data?.paymasterOrgConfigs?.[0] || null;

  return {
    isRegistered: config?.isRegistered || false,
    isPaused: config?.isPaused || false,
    deposit: config?.deposit || '0',
    totalGasSpent: config?.totalGasSpent || '0',
    transactionCount: config?.transactionCount || 0,
    loading,
    error,
    hasPaymaster: Boolean(config?.isRegistered && !config?.isPaused),
  };
}
