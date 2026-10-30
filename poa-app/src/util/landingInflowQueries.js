// Core owns the pot histories and each recorded native stream, including paging.
export {
  FETCH_HISTORICAL_POTS_PAGE, FETCH_NATIVE_DEPOSITS_PAGE,
  FETCH_PAYMASTER_HUB_POTS_PAGE, FETCH_INDEXED_NATIVE_PAYMENTS_PAGE,
  FETCH_INDEXED_ORG_DEPOSITS_PAGE, FETCH_INDEXED_DONATIONS_PAGE,
} from '@poa-box/core/graph/documents/inflows';

// Select one observed indexed block before requesting the canonical histories.
export const LANDING_INFLOWS_QUERY = `
  query LandingInflows {
    _meta { block { number hash timestamp } hasIndexingErrors }
  }
`;
