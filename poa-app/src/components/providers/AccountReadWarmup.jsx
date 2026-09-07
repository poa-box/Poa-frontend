import { useEffect } from 'react';
import { useAuth } from '@/context/authState';
import { usePOContext } from '@/context/POContext';
import { getAllSubgraphUrls } from '@/config/networks';
import { getClient } from '@/util/apolloClient';
import { ACCOUNT_QUERY } from '@/util/accountQueries';
import { FETCH_USER_DATA_NEW } from '@/util/queries';
import { buildUserScope } from '@/lib/user/userScope';

/**
 * An untrusted address hint can warm public, address-keyed query results. It
 * cannot populate Auth/User state or grant permissions. Real readers stay
 * scoped to the restored address and consume this cache only if it matches.
 */
export default function AccountReadWarmup({ enabled }) {
  const { accountHint, isAuthHydrated } = useAuth();
  const { orgId, subgraphUrl } = usePOContext();
  const address = !isAuthHydrated ? accountHint?.address : null;

  useEffect(() => {
    if (!address) return;
    // Failures are speculative; normal readers retain their retry/error path.
    Promise.allSettled(getAllSubgraphUrls().map(({ url }) => getClient(url).query({
      query: ACCOUNT_QUERY,
      variables: { id: address.toLowerCase() },
      fetchPolicy: 'cache-first',
    })));
  }, [address]);

  useEffect(() => {
    if (!enabled || !address || !orgId || !subgraphUrl) return;
    getClient(subgraphUrl).query({
      query: FETCH_USER_DATA_NEW,
      variables: {
        orgUserID: buildUserScope(orgId, address),
        userAddress: address.toLowerCase(),
      },
      fetchPolicy: 'cache-first',
    }).catch(() => {});
  }, [enabled, address, orgId, subgraphUrl]);

  return null;
}
