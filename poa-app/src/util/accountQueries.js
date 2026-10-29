import { coreDocument } from '@/lib/graphql/coreDocuments';
import { FETCH_USERNAME } from '@poa-box/core/graph/documents/user';

// Shared with speculative account reads so restored sessions reuse the same cache.
export const ACCOUNT_QUERY = coreDocument(FETCH_USERNAME, { name: 'FetchAccount', variables: '$id: ID!' });
