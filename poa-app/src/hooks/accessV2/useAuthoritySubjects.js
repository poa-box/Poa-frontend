import { useCallback, useMemo } from 'react';
import { useAuth } from '@/context/authState';
import { usePOContext } from '@/context/POContext';
import { normalizeAuthoritySubjects } from '@/lib/accessV2/normalize';
import { authoritySubjectRows } from '@/lib/accessV2/authorityEvidence';
import { useAuthorityEvidence } from '@/hooks/accessV2/useAuthorityEvidence';
import { taskPolicyFromAuthority } from '@/lib/accessV2/taskPolicyProjection';

export function useAuthoritySubjects(options) {
  const evidence = useAuthorityEvidence(options);
  const { snapshot, scope } = evidence;
  const { taskManagerContractAddress } = usePOContext();
  const { accountAddress, isAuthHydrated, isAuthenticated } = useAuth();
  const value = useMemo(() => normalizeAuthoritySubjects(authoritySubjectRows(snapshot),
    snapshot ? { snapshot, scope } : null), [snapshot, scope]);
  const taskPolicyForProject = useCallback((projectId, account) => taskPolicyFromAuthority({
    snapshot: isAuthHydrated && isAuthenticated && accountAddress?.toLowerCase() === account?.toLowerCase() ? snapshot : null,
    scope, account, projectId, taskManager: taskManagerContractAddress,
  }), [snapshot, scope, accountAddress, isAuthHydrated, isAuthenticated, taskManagerContractAddress]);
  return { ...value, ...evidence, taskPolicyForProject };
}

export default useAuthoritySubjects;
