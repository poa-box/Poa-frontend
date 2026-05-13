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
import { ethers } from 'ethers';
import { decodeAbiParameters } from 'viem';
import { usePOContext } from '@/context/POContext';
import { createChainClients } from '@/services/web3/utils/chainClients';
import { useRefreshSubscription, RefreshEvent } from '@/context/RefreshContext';
import TaskManagerABI from '../../abi/TaskManagerNew.json';

const ZERO_ROOT = ethers.constants.HashZero;
const FOLDERS_ROOT_KEY = 10;
const ORGANIZER_HAT_IDS_KEY = 11;

async function readLens(publicClient, address, key) {
  return publicClient.readContract({
    address,
    abi: TaskManagerABI,
    functionName: 'getLensData',
    args: [key, '0x'],
  });
}

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

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    const address = addressRef.current;
    const chainId = chainIdRef.current;
    if (!address || !chainId) return;
    const clients = createChainClients(chainId);
    if (!clients?.publicClient) return;
    setLoading(true);
    setError(null);
    try {
      const [rawRoot, rawIds] = await Promise.all([
        readLens(clients.publicClient, address, FOLDERS_ROOT_KEY),
        readLens(clients.publicClient, address, ORGANIZER_HAT_IDS_KEY),
      ]);
      if (seq !== seqRef.current) return; // stale, a newer load() has started
      const [root] = decodeAbiParameters([{ type: 'bytes32' }], rawRoot);
      const [ids] = decodeAbiParameters([{ type: 'uint256[]' }], rawIds);
      setFoldersRoot(root);
      setOrganizerHatIds(ids.map((id) => id.toString()));
    } catch (e) {
      if (seq !== seqRef.current) return;
      setError(e);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  // Reset state when the org changes so the UI never shows the previous
  // org's folders while a new load is in flight.
  useEffect(() => {
    setFoldersRoot(ZERO_ROOT);
    setOrganizerHatIds([]);
    setError(null);
    if (!taskManagerContractAddress || !orgChainId) return;
    load();
  }, [taskManagerContractAddress, orgChainId, load]);

  useRefreshSubscription(
    [RefreshEvent.FOLDERS_UPDATED, RefreshEvent.ORGANIZER_HAT_UPDATED],
    load,
    [load]
  );

  return { foldersRoot, organizerHatIds, loading, error, refetch: load };
}
