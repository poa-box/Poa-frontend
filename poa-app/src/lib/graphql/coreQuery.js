import { gql } from '@apollo/client';
import { createDocumentQueryAdapter } from '@poa-box/core/graph/sources';
import { getClient } from '@/util/apolloClient';

export class PublicDataUnavailable extends Error {
  constructor(coverage) {
    super('Some public data is unavailable. Please try again.');
    this.name = 'PublicDataUnavailable';
    this.coverage = coverage;
  }
}

/** Canonical core readers use the host's existing endpoint clients and caches. */
export function createApolloProtocolQuery({ clientForEndpoint = getClient, fetchPolicy = 'cache-first' } = {}) {
  const adapter = createDocumentQueryAdapter({
    parse: gql,
    createClient: clientForEndpoint,
    execute: async (client, { document, variables, source }) => {
      let response;
      const result = await client.query({
        query: document, variables,
        fetchPolicy: source.snapshot === 'pinned' ? 'network-only' : fetchPolicy,
        context: {
          queryDeduplication: false,
          onCoreResponse: (value) => {
            // Apollo may replace result.data in place while normalizing it.
            response = { data: value.data == null ? value.data : structuredClone(value.data), errors: value.errors };
          },
        },
      });
      // Keep the ordinary Apollo cache. Validate network evidence before its
      // normalization can make a missing current field look like known data.
      return response || result;
    },
  });
  return async (document, variables, source) => {
    const result = await adapter.query(source, document, variables);
    if (result.issues.length) throw new PublicDataUnavailable({ issues: result.issues });
    return result.data;
  };
}

export const apolloProtocolQuery = createApolloProtocolQuery();
