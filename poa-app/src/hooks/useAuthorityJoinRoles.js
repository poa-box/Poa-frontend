import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/authState';
import { RefreshEvent, useRefreshSubscription } from '@/context/RefreshContext';
import { useAuthoritySubjects } from '@/hooks/accessV2';
import { useWeb3Services } from '@/hooks/useWeb3Services';

/** Preflight every public role: newcomers have no indexed membership row until their first event. */
export function useAuthorityJoinRoles() {
  const { accountAddress, isAuthHydrated } = useAuth();
  const { roles, authority, loading, error, refetch: refetchSubjects } = useAuthoritySubjects();
  const { refetch: refetchAuthority } = authority;
  const { membershipAuthority } = useWeb3Services();
  const [result, setResult] = useState({ key: null, states: {} });
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const key = `${authority.address || ''}:${isAuthHydrated ? accountAddress || '' : ''}:${roles.map(role => role.subjectId).join(',')}`;
  const refetch = useCallback(async () => {
    // Retry the reads that can put Join into its unavailable state, not just canClaim.
    // A missing authority keeps the subjects query skipped; discovery will start it
    // automatically once the authority read recovers.
    generation.current += 1;
    setResult({ key: null, states: {} });
    await Promise.allSettled([
      Promise.resolve().then(() => refetchAuthority?.()),
      ...(authority.enabled && authority.address
        ? [Promise.resolve().then(() => refetchSubjects?.())]
        : []),
    ]);
    setRevision(value => value + 1);
  }, [refetchAuthority, authority.enabled, authority.address, refetchSubjects]);
  useRefreshSubscription(
    [RefreshEvent.ROLE_CLAIMED, RefreshEvent.VOUCH_CHANGED, RefreshEvent.MEMBERSHIP_CHANGED, RefreshEvent.PROPOSAL_COMPLETED],
    refetch,
    [refetch],
  );
  useEffect(() => {
    const request = ++generation.current;
    if (!authority.enabled || !isAuthHydrated || !accountAddress || !membershipAuthority) return;
    let cancelled = false;
    Promise.all(roles.map(async role => {
      try {
        return [role.subjectId, await membershipAuthority.canClaim(authority.address, role.subjectId, accountAddress)];
      } catch {
        return [role.subjectId, { error: true }];
      }
    })).then(entries => {
      if (!cancelled && request === generation.current) setResult({ key, states: Object.fromEntries(entries) });
    });
    return () => { cancelled = true; };
  }, [key, roles, authority.enabled, authority.address, accountAddress, isAuthHydrated, membershipAuthority, revision]);
  return { roles, authority, loading, error, states: result.key === key ? result.states : {}, refetch };
}
