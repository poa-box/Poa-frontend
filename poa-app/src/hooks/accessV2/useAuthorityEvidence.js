import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { usePOContext } from '@/context/POContext';
import { useSubgraphClient } from '@/util/apolloClient';
import { RefreshEvent, useRefreshSubscription } from '@/context/RefreshContext';
import { createAuthorityObservationStore, observeAuthority } from '@/lib/accessV2/authorityEvidence';
import { useOrgAuthority } from '@/hooks/accessV2/useOrgAuthority';

import { createObservationCache } from '@/lib/accessV2/observationCache';

const clients = new WeakMap();
const empty = Object.freeze({ snapshot: null, loading: false, error: null });
const disabled = { getSnapshot: () => empty, subscribe: () => () => {}, refresh: async () => null };

/** One indexed, pinned enumeration per endpoint/org/authority, shared by all authority panels. */
export function useAuthorityEvidence({ block } = {}) {
  const blockNumber = block?.number;
  const blockHash = block?.hash;
  const requestedBlock = useMemo(() => blockNumber == null ? undefined : { number: String(blockNumber), ...(blockHash ? { hash: blockHash } : {}) }, [blockNumber, blockHash]);
  const { orgId, orgChainId, subgraphUrl } = usePOContext();
  const authority = useOrgAuthority();
  const client = useSubgraphClient(subgraphUrl);
  const scope = useMemo(() => ({ chainId: orgChainId, orgId, endpoint: subgraphUrl,
    contract: authority.address }), [orgChainId, orgId, subgraphUrl, authority.address]);
  const store = useMemo(() => {
    if (!authority.enabled || !orgId || !orgChainId || !subgraphUrl || !client) return disabled;
    let entries = clients.get(client);
    if (!entries) { entries = createObservationCache(); clients.set(client, entries); }
    const key = JSON.stringify([scope, requestedBlock]);
    return entries.get(key, () => createAuthorityObservationStore(() => observeAuthority({ client, scope, block: requestedBlock })));
  }, [authority.enabled, orgId, orgChainId, subgraphUrl, client, scope, requestedBlock]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, disabled.getSnapshot);
  useEffect(() => {
    const current = store.getSnapshot();
    // New consumers share the current scoped observation, including a failed
    // read. Only explicit refresh retries it; mounting a child must not restart
    // loading-gated parents after either success or failure.
    if (store !== disabled && !current.loading && !current.snapshot && !current.error) store.refresh().catch(() => {});
  }, [store]);
  useRefreshSubscription([
    RefreshEvent.PROPOSAL_COMPLETED, RefreshEvent.MEMBER_JOINED, RefreshEvent.ROLE_CLAIMED, RefreshEvent.ROLE_RENOUNCED,
    RefreshEvent.VOUCH_CHANGED, RefreshEvent.MEMBERSHIP_PENDING, RefreshEvent.MEMBERSHIP_CHANGED,
  ], () => { store.refresh().catch(() => {}); }, [store]);
  return { ...state, scope, authority, enabled: authority.enabled,
    loading: authority.loading || (authority.enabled && !state.snapshot && !state.error) || state.loading,
    complete: state.snapshot?.coverage.status === 'complete', refetch: store.refresh };
}
