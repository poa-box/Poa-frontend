import { gql } from '@apollo/client';
import { FETCH_CASHOUT_DISCOVERY_STATE, FETCH_CASHOUT_DISCOVERY_PAGE } from '@poa-box/core/graph/documents/indexed-completeness';

export const PEER_CASHOUTRELAY_BASE_URL =
  process.env.NEXT_PUBLIC_PEER_CASHOUTRELAY_BASE_SUBGRAPH_URL ||
  'https://api.studio.thegraph.com/query/73367/peer-cashoutrelay-base/version/latest';

// Exact serving-schema documents; independent Bytes-ID cursors belong to core.
export const CASHOUT_DISCOVERY_STATE_QUERY = gql(FETCH_CASHOUT_DISCOVERY_STATE);
export const CASHOUT_DISCOVERY_PAGE_QUERY = gql(FETCH_CASHOUT_DISCOVERY_PAGE);
