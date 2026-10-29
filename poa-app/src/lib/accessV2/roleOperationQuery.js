import { createApolloProtocolQuery } from '@/lib/graphql/coreQuery';

// Review and final handoff need a fresh indexed head after asynchronous uploads.
// The role host separately reuses exact hash-pinned responses; a cached latest
// _meta response cannot establish that the current observation is still fresh.
export const roleOperationQuery = createApolloProtocolQuery({ fetchPolicy: 'network-only' });
