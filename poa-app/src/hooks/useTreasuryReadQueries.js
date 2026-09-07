import { useQuery } from '@apollo/client';
import { useSubgraphClient } from '@/util/apolloClient';
import { FETCH_TREASURY_DATA } from '@/util/queries';
import { FETCH_GAS_POOL_DATA } from '@/util/passkeyQueries';

// Shared by route warming and the ledger: identical documents, variables and
// endpoint cache let Apollo reuse both in-flight and completed public reads.
export function useTreasuryReadQueries({ orgId, subgraphUrl, enabled = true }) {
  const client = useSubgraphClient(subgraphUrl);
  const options = {
    variables: { orgId },
    skip: !enabled || !orgId || !subgraphUrl,
    fetchPolicy: 'cache-first',
    client,
  };
  const treasury = useQuery(FETCH_TREASURY_DATA, options);
  const gasPool = useQuery(FETCH_GAS_POOL_DATA, options);
  return { treasury, gasPool };
}
