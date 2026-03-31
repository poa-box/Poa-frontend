// apolloClient.js
import { ApolloClient, InMemoryCache } from '@apollo/client';
import { HttpLink } from '@apollo/client/link/http';
import { DEFAULT_SUBGRAPH_URL } from '../config/networks';

// Increment this when subgraph schema changes significantly to clear stale cache
const CACHE_VERSION = 'v10';

/**
 * Chain-routed Apollo HttpLink.
 * Each query passes `context: { subgraphUrl }` to target the correct chain's subgraph.
 * Queries without an explicit subgraphUrl hit the default network (Sepolia).
 */
const link = new HttpLink({
  uri: (operation) => operation.getContext().subgraphUrl || DEFAULT_SUBGRAPH_URL,
});

const client = new ApolloClient({
  link,
  cache: new InMemoryCache(),
});

// Clear stale cache when version changes (client-side only)
if (typeof window !== 'undefined') {
  const storedVersion = localStorage.getItem('poa-cache-version');
  if (storedVersion !== CACHE_VERSION) {
    client.clearStore().then(() => {
      localStorage.setItem('poa-cache-version', CACHE_VERSION);
      console.log('[Apollo] Cache cleared due to version change');
    });
  }
}

export default client;
