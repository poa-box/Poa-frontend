/**
 * usePaymasterInfo
 * Query paymaster org configuration from the subgraph.
 */

import { useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { usePOContext } from '../context/POContext';
import { FETCH_PAYMASTER_ORG_CONFIG } from '../util/passkeyQueries';

/**
 * Hook to get paymaster configuration for the current org.
 *
 * @returns {Object} Paymaster info
 */
export function usePaymasterInfo() {
  const { orgId, subgraphUrl } = usePOContext();

  const apolloContext = useMemo(() => ({ subgraphUrl }), [subgraphUrl]);

  const { data, loading, error } = useQuery(FETCH_PAYMASTER_ORG_CONFIG, {
    variables: { orgId },
    skip: !orgId,
    fetchPolicy: 'cache-first',
    context: apolloContext,
  });

  const config = data?.paymasterOrgConfigs?.[0] || null;

  return {
    isRegistered: Boolean(config),
    isPaused: config?.isPaused || false,
    deposit: config?.depositBalance || '0',
    totalGasSpent: config?.totalSpent || '0',
    loading,
    error,
    hasPaymaster: Boolean(config && !config.isPaused),
  };
}
