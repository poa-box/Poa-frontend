/**
 * useTaskManagerV4State
 *
 * Pulls the v4 TaskManager state that the subgraph doesn't index yet
 * (`foldersRoot`, `organizerHatIds`) via a lens call against the on-chain
 * contract. Once subgraph-pop PR #177 deploys (closes #174/#175/#176),
 * callers SHOULD prefer `POContext.foldersRoot` / `POContext.organizerHatIds`
 * and this hook can be deprecated.
 *
 * Uses a chain-specific public client so unauthenticated visitors still
 * see folders — `useWeb3Services` needs a signer and would no-op here.
 *
 * Returns `{ foldersRoot, organizerHatIds, loading, error, refetch }`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ZERO_FOLDER_ROOT as ZERO_ROOT } from '@/lib/folders/constants';
import { usePOContext } from '@/context/POContext';
import { useRefreshSubscription, RefreshEvent } from '@/context/RefreshContext';

export function useTaskManagerV4State() {
  const {
    taskManagerContractAddress,
    orgChainId,
    foldersRoot: ctxRoot,
    organizerHatIds: ctxIds,
  } = usePOContext() || {};

  const [foldersRoot, setFoldersRoot] = useState(ctxRoot || ZERO_ROOT);
  const [organizerHatIds, setOrganizerHatIds] = useState(ctxIds || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const addressRef = useRef(taskManagerContractAddress);
  addressRef.current = taskManagerContractAddress;
  const chainIdRef = useRef(orgChainId);
  chainIdRef.current = orgChainId;
  // Sequence id makes stale responses (org-switch mid-load) discardable.
  const seqRef = useRef(0);
  const activeRef = useRef(true);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    const address = addressRef.current;
    const chainId = chainIdRef.current;
    if (!activeRef.current || !address || !chainId) return;
    const isCurrent = () => activeRef.current && seq === seqRef.current
      && addressRef.current === address && chainIdRef.current === chainId;
    setLoading(true);
    setError(null);
    try {
      const { readTaskManagerV4State } = await import('@/services/web3/read/taskManagerV4State');
      if (!isCurrent()) return; // Never start RPCs for an obsolete import intent.
      const result = await readTaskManagerV4State(chainId, address);
      if (!isCurrent() || !result) return;
      setFoldersRoot(result.foldersRoot);
      setOrganizerHatIds(result.organizerHatIds);
    } catch (e) {
      if (!isCurrent()) return;
      setError(e);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  const invalidateLoads = useCallback(() => {
    activeRef.current = false;
    ++seqRef.current; // Invalidate the latest request, not an effect's captured counter.
  }, []);

  // Reset state when the org changes so the UI never shows the previous
  // org's folders while a new load is in flight.
  useEffect(() => {
    activeRef.current = true;
    setLoading(false);
    setFoldersRoot(ZERO_ROOT);
    setOrganizerHatIds([]);
    setError(null);
    if (taskManagerContractAddress && orgChainId) load();
    return invalidateLoads; // Includes a switch to no org and unmount.
  }, [taskManagerContractAddress, orgChainId, load, invalidateLoads]);

  useRefreshSubscription(
    [RefreshEvent.FOLDERS_UPDATED, RefreshEvent.ORGANIZER_HAT_UPDATED],
    load,
    [load]
  );

  return { foldersRoot, organizerHatIds, loading, error, refetch: load };
}
