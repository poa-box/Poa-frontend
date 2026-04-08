// apolloClient.js
import { ApolloClient, InMemoryCache } from '@apollo/client';
import { HttpLink } from '@apollo/client/link/http';
import { RetryLink } from '@apollo/client/link/retry';
import { from } from '@apollo/client';
import { DEFAULT_SUBGRAPH_URL } from '../config/networks';

// Increment this when subgraph schema changes significantly to clear stale cache
const CACHE_VERSION = 'v11';

/**
 * Retry link -- handles transient network failures with exponential backoff.
 * Only retries on network errors (not GraphQL errors, which indicate bad queries).
 */
const retryLink = new RetryLink({
  delay: {
    initial: 500,
    max: 5000,
    jitter: true,
  },
  attempts: {
    max: 3,
    // retryIf only receives network errors (not GraphQL errors).
    // Retry any network failure: fetch timeout, CORS, HTTP 5xx/429, etc.
    retryIf: (error) => !!error,
  },
});

/**
 * Create an Apollo link chain for a given endpoint.
 */
function createLink(endpoint) {
  return from([
    retryLink,
    new HttpLink({ uri: endpoint }),
  ]);
}

/**
 * Default client for the home chain (Arbitrum).
 * Used by ApolloProvider and queries that don't specify a client override.
 * Also used for org-scoped queries via context: { subgraphUrl }.
 */
const defaultClient = new ApolloClient({
  link: from([
    retryLink,
    new HttpLink({
      uri: (operation) => operation.getContext().subgraphUrl || DEFAULT_SUBGRAPH_URL,
    }),
  ]),
  cache: new InMemoryCache(),
});

/**
 * Per-endpoint client cache.
 * Each subgraph endpoint gets its own ApolloClient with a separate InMemoryCache.
 * This prevents cache poisoning: the same query against Arbitrum and Gnosis
 * won't share cache entries because they use different client instances.
 *
 * Use getClient(subgraphUrl) for cross-chain queries instead of
 * context: { subgraphUrl } + fetchPolicy: 'no-cache'.
 */
const clientCache = new Map();

/**
 * Get (or create) an ApolloClient for a specific subgraph endpoint.
 * Returns the default client if no URL is provided.
 *
 * Usage:
 *   const client = getClient(deploySubgraphUrl);
 *   useQuery(QUERY, { client });
 */
export function getClient(subgraphUrl) {
  if (!subgraphUrl || subgraphUrl === DEFAULT_SUBGRAPH_URL) {
    return defaultClient;
  }
  if (!clientCache.has(subgraphUrl)) {
    clientCache.set(subgraphUrl, new ApolloClient({
      link: createLink(subgraphUrl),
      cache: new InMemoryCache(),
    }));
  }
  return clientCache.get(subgraphUrl);
}

// Clear stale cache when version changes (client-side only)
if (typeof window !== 'undefined') {
  const storedVersion = localStorage.getItem('poa-cache-version');
  if (storedVersion !== CACHE_VERSION) {
    defaultClient.clearStore().then(() => {
      localStorage.setItem('poa-cache-version', CACHE_VERSION);
      console.log('[Apollo] Cache cleared due to version change');
    }).catch((err) => {
      console.error('[Apollo] Failed to clear cache:', err);
    });
  }
}

export default defaultClient;
