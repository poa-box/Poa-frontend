import { useMemo } from 'react';
import { authorityAccountMembershipFacts, authorityAccountActivationMemberships } from '@poa-box/core/reads/authority';
import { useAuth } from '@/context/authState';
import { normalizeAuthoritySubjects, normalizeAuthorityMemberships, normalizeMyMemberships } from '@/lib/accessV2/normalize';
import { authoritySubjectRows } from '@/lib/accessV2/authorityEvidence';
import { useAuthorityEvidence } from '@/hooks/accessV2/useAuthorityEvidence';

/** Complete, endpoint-scoped indexed membership enumeration; no per-member RPC reads. */
export function useAuthorityMemberships() {
  const evidence = useAuthorityEvidence();
  const { snapshot, scope } = evidence;
  const value = useMemo(() => {
    const { compositions, groups } = normalizeAuthoritySubjects(authoritySubjectRows(snapshot),
      snapshot ? { snapshot, scope } : null);
    return normalizeAuthorityMemberships(snapshot?.data.memberships || [], compositions, groups,
      snapshot ? { snapshot, scope } : null);
  }, [snapshot, scope]);
  return { ...value, ...evidence };
}

/** Saved account hints never select permission or activation evidence. */
export function useMyMemberships(addressOverride) {
  const evidence = useAuthorityEvidence();
  const { accountAddress, isAuthenticated, isAuthHydrated } = useAuth();
  const user = String(addressOverride || accountAddress || '').toLowerCase();
  const identityReady = Boolean(addressOverride || (isAuthHydrated && isAuthenticated && accountAddress));
  const { snapshot, scope, authority } = evidence;
  const enabled = Boolean(evidence.enabled && !authority.loading && !authority.error && identityReady
    && /^0x[\da-f]{40}$/i.test(user) && !/^0x0{40}$/i.test(user));
  const accountScope = useMemo(() => ({ ...scope, account: user }), [scope, user]);
  const value = useMemo(() => {
    const current = enabled && snapshot && snapshot.source.chainId === scope.chainId
      && snapshot.source.orgId === scope.orgId && snapshot.source.endpoint === scope.endpoint
      && snapshot.source.contract?.toLowerCase() === scope.contract?.toLowerCase()
      && (!snapshot.source.account || snapshot.source.account.toLowerCase() === user);
    const rows = current && !evidence.error ? snapshot.data.memberships.filter(row => row.user.toLowerCase() === user
      && (!row.authority || row.authority.id?.toLowerCase() === scope.contract?.toLowerCase())) : [];
    const scoped = current ? { ...snapshot, source: { ...snapshot.source, account: user } } : null;
    return { ...normalizeMyMemberships(rows, scoped ? { snapshot: scoped, scope: accountScope } : null),
      membershipFacts: scoped ? authorityAccountMembershipFacts(scoped, user) : null,
      activationEvidence: scoped ? { scope: accountScope, authority: scoped,
        memberships: authorityAccountActivationMemberships(scoped, user) } : null };
  }, [enabled, snapshot, scope, evidence.error, user, accountScope]);
  return { ...value, ...evidence, enabled, user, scope: accountScope,
    loading: Boolean((!addressOverride && !isAuthHydrated) || evidence.loading), paused: authority.paused };
}

export default useAuthorityMemberships;
