import { knownFact, unknownFact, requireCompleteSnapshot } from '@poa-box/core/data/facts';
import { authorityAccountMembershipFacts } from '@poa-box/core/reads/authority';
import { projectUserPermissions } from '@poa-box/core/authority/permissions';
import { projectTaskPermissionMask } from '@poa-box/core/tasks/policy';
import { projectContext } from '@poa-box/core/tx/authority';
import { PERM_KEYS } from '@/lib/accessV2/permKeys';

/** User facts at an exact project context, never potential permissions of a selected role. */
export function taskPolicyFromAuthority({ snapshot, scope, account, projectId, taskManager }) {
  const unknown = () => unknownFact('AUTHORITY_TASK_FACT_UNAVAILABLE');
  const taskScope = { ...scope, contract: taskManager, account,
    contracts: snapshot?.data.taskModule?.source.contracts || { membershipAuthority: scope.contract } };
  const result = { scope: taskScope, projectId, permissionMask: unknown(), executor: unknown(), creator: unknown() };
  if (!snapshot || !/^0x[\da-f]{40}$/i.test(account || '')) return result;
  try {
    requireCompleteSnapshot(snapshot, { scope });
    const memberships = authorityAccountMembershipFacts(snapshot, account);
    const permission = projectUserPermissions({ snapshot: { ...snapshot, source: { ...snapshot.source, account } }, memberships, scope: { ...scope, account },
      permKey: PERM_KEYS.TM_PERMS, ctx: projectContext(projectId) });
    result.permissionMask = projectTaskPermissionMask(permission, projectId);
    const taskModule = snapshot.data.taskModule;
    if (!taskModule || taskModule.source.contract.toLowerCase() !== taskManager.toLowerCase()) return result;
    const source = { ...taskModule.source, account };
    result.executor = knownFact(taskModule.executor.toLowerCase() === account.toLowerCase(), source);
  } catch { /* Incomplete, malformed and mismatched evidence never becomes a zero grant. */ }
  return result;
}
