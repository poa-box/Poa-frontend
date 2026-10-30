import { requireRawUint } from '@poa-box/core/amounts';

/** Complete, checkpoint-aligned Shares request history using canonical core fields. */
export async function readTreasuryShareRequests({ client, source, tokenAddress }) {
  const [{ readIndexedPageFacts }, { FETCH_ALL_TOKEN_REQUESTS }, treasuryDocs, { coreFields }, { gql }] = await Promise.all([
    import('@poa-box/core/reads/protocol'), import('@poa-box/core/graph/documents/token'),
    import('@poa-box/core/graph/documents/treasury'), import('@/lib/graphql/coreDocuments'), import('@apollo/client'),
  ]);
  const document = `query TreasurySharesRequests($tokenAddress: String!, $orgId: ID!, $cursor: String!, $first: Int!, $block: Block_height) {
    organization(id: $orgId, block: $block) { ${coreFields(treasuryDocs.FETCH_TREASURY_DATA, 'organization', { only: ['id', 'participationToken'] })} }
    tokenRequests(block: $block, where: { participationToken: $tokenAddress, id_gt: $cursor }, first: $first, orderBy: id, orderDirection: asc) {
      ${coreFields(FETCH_ALL_TOKEN_REQUESTS, 'tokenRequests')}
    }
    _meta(block: $block) { ${coreFields(treasuryDocs.FETCH_PAYMENTS_PAGE, '_meta')} }
  }`;
  return readIndexedPageFacts({ source: { ...source, contract: tokenAddress }, document, collection: 'tokenRequests',
    variables: { tokenAddress: tokenAddress.toLowerCase(), orgId: source.orgId }, initialCursor: '', pageSize: 500, maxPages: 10,
    query: async (query, variables) => {
      const result = await client.query({ query: gql(query), variables, fetchPolicy: 'network-only' });
      const org = result.data?.organization;
      if (result.errors?.length || org?.id?.toLowerCase() !== source.orgId.toLowerCase()
          || org?.participationToken?.id?.toLowerCase() !== tokenAddress.toLowerCase()) throw new Error('Shares history binding unavailable');
      return result.data;
    }, validateRow: row => {
      requireRawUint(row.amount);
      if (!['Pending', 'Approved', 'Cancelled'].includes(row.status)) throw new Error('Shares request status unknown');
      if (row.status === 'Approved') requireRawUint(row.approvedAt);
    } });
}
