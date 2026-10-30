import { print } from 'graphql';
import { FETCH_ORG_DIRECTORY_PAGE } from '@poa-box/core/graph/documents/org';
import { requireCompleteSnapshot } from '@poa-box/core/data/facts';
import { getAllSubgraphUrls } from '@/config/networks';
import { coreDocument } from '@/lib/graphql/coreDocuments';
import { PublicDataUnavailable } from '@/lib/graphql/coreQuery';

// Keep the host's remaining card relation; current member counts need authority facts.
export const ORGANIZATION_DIRECTORY_QUERY = print(coreDocument(FETCH_ORG_DIRECTORY_PAGE, {
  fields: { organizations: { add: 'quickJoin { id }' } },
}));

export async function fetchSupportedOrganizations(endpoint, { fetcher = fetch, chainId, maxPages = 100 } = {}) {
  const selectedChain = chainId ?? getAllSubgraphUrls().find((source) => source.url === endpoint)?.chainId;
  const source = { chainId: selectedChain, endpoint, indexed: true, snapshot: 'latest', method: 'graph' };
  const signal = AbortSignal.timeout(8000);
  const { readOrganizationDirectoryFacts } = await import('@poa-box/core/reads/org');
  const snapshot = await readOrganizationDirectoryFacts({
    source, pageSize: 100, maxPages,
    query: async (query, variables) => {
      const response = await fetcher(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ORGANIZATION_DIRECTORY_QUERY, variables }), signal,
      });
      if (!response.ok) throw new PublicDataUnavailable();
      const result = await response.json();
      if (result?.errors?.length) throw new PublicDataUnavailable();
      return result?.data;
    },
  });
  try { return Object.defineProperty([...requireCompleteSnapshot(snapshot)], 'snapshot', { value: snapshot }); }
  catch { throw new PublicDataUnavailable(snapshot.coverage); }
}
