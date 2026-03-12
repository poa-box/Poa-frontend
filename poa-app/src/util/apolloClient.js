// apolloClient.js
import { ApolloClient, InMemoryCache, ApolloLink, Observable } from '@apollo/client';

// Increment this when subgraph schema changes significantly to clear stale cache
const CACHE_VERSION = 'v8';

/**
 * Custom Apollo Link that delegates to graph-client's stitched mesh runtime.
 * Uses lazy dynamic import to avoid ESM/CJS issues with @graphql-mesh/apollo-link.
 * The mesh is initialized once and cached for subsequent queries.
 *
 * Supports @live queries: the pollingLive plugin causes execute() to return an
 * AsyncIterable for @live-annotated queries. We detect this and iterate over
 * results, pushing each to the Apollo observable. When Apollo unsubscribes
 * (component unmount, navigation), the cleanup function breaks the loop.
 */
let meshPromise = null;

function getMesh() {
  if (!meshPromise) {
    meshPromise = import('../../.graphclient').then(mod => mod.getBuiltGraphClient());
  }
  return meshPromise;
}

function isAsyncIterable(value) {
  return value != null && typeof value[Symbol.asyncIterator] === 'function';
}

const meshLink = new ApolloLink((operation) => {
  return new Observable((observer) => {
    let cancelled = false;

    getMesh()
      .then(async ({ execute }) => {
        const { query, variables, operationName } = operation;
        const result = await execute(query, variables, {}, { operationName });

        if (isAsyncIterable(result)) {
          // @live query — iterate over polling results from the Repeater
          try {
            for await (const value of result) {
              if (cancelled) break;
              observer.next(value);
            }
            if (!cancelled) observer.complete();
          } catch (iterError) {
            if (!cancelled) observer.error(iterError);
          }
        } else {
          // Normal one-shot query
          if (!cancelled) {
            observer.next(result);
            observer.complete();
          }
        }
      })
      .catch((err) => {
        if (!cancelled) observer.error(err);
      });

    // Cleanup: stop @live polling when Apollo unsubscribes
    return () => { cancelled = true; };
  });
});

const client = new ApolloClient({
  link: meshLink,
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
