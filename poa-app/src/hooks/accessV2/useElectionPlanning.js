import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/authState';
import { useWeb3ServicesContext } from '@/context/Web3ServicesContext';
import { usePOContext } from '@/context/POContext';
import { getNetworkByChainId } from '@/config/networks';
import { useAuthorityEvidence } from '@/hooks/accessV2/useAuthorityEvidence';

/** Transient observations only: neither provenance nor ban consent is saved into a draft. */
export function useElectionPlanning({ enabled, subjectId, fallbackSubjectId, candidates = [] }) {
  const observation = useAuthorityEvidence();
  const refetchAuthority = observation.refetch;
  const { accountAddress, isAuthHydrated, isAuthenticated } = useAuth();
  const { services, requestRuntime } = useWeb3ServicesContext();
  const roleCreation = services?.roleCreation;
  useEffect(() => enabled ? requestRuntime() : undefined, [enabled, requestRuntime]);
  const { executorContractAddress, orgChainId } = usePOContext();
  const candidateKey = [...new Set(candidates.map(value => String(value).toLowerCase()))].sort().join(',');
  const identity = useMemo(() => ({ scope: observation.scope, subjectId, fallbackSubjectId, candidateKey, accountAddress, isAuthHydrated, isAuthenticated }),
    [observation.scope, subjectId, fallbackSubjectId, candidateKey, accountAddress, isAuthHydrated, isAuthenticated]);
  const current = useRef(identity);
  current.current = identity;
  const [state, setState] = useState({ identity: null, evidence: null, loading: false, error: null });
  const read = useCallback(async snapshot => {
    if (!enabled || !subjectId || !roleCreation || !snapshot) throw new Error('Current role information is still loading.');
    const result = await roleCreation.getElectionPlanningEvidence({ snapshot, scope: observation.scope,
      executor: executorContractAddress, subjectId, fallbackSubjectId,
      candidates: candidateKey ? candidateKey.split(',') : [], rpcEndpoint: getNetworkByChainId(orgChainId)?.rpcUrl });
    if (current.current !== identity) throw new Error('The selected role changed. Review it again.');
    return result;
  }, [enabled, subjectId, roleCreation, observation.scope, executorContractAddress, fallbackSubjectId, candidateKey, orgChainId, identity]);
  useEffect(() => {
    if (!enabled || !subjectId || !observation.snapshot) return undefined;
    let active = true;
    setState({ identity, evidence: null, loading: true, error: null });
    read(observation.snapshot).then(evidence => { if (active) setState({ identity, evidence, loading: false, error: null }); },
      error => { if (active) setState({ identity, evidence: null, loading: false, error: error?.code === 'PLANNING_READ_LIMIT' ? error : new Error('Current role choices could not be verified. Please retry.') }); });
    return () => { active = false; };
  }, [enabled, subjectId, observation.snapshot, read, identity]);
  const refresh = useCallback(async () => {
    try { return await read(await refetchAuthority()); } catch (error) {
      if (error?.code === 'PLANNING_READ_LIMIT') throw error;
      throw new Error('Current role choices changed or could not be verified. Review them again before creating this vote.');
    }
  }, [read, refetchAuthority]);
  return { evidence: enabled && state.identity === identity ? state.evidence : null,
    loading: enabled && (state.identity !== identity || state.loading || observation.loading),
    error: state.identity === identity ? state.error : null, refresh };
}
