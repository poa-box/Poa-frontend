import { projectEffectiveSubjectPermissions, projectSubjectMembership } from '@poa-box/core/authority/permissions';
import { normalizeSubjectId } from '@poa-box/core/authority/ids';
import { assertPlanScope, assertSourceBlock, knownFact, requireCompleteSnapshot } from '@poa-box/core/data/facts';
import { V2_MATRIX_COLUMNS } from '@/lib/accessV2/legacyBridge';
import { GLOBAL_CTX } from '@/lib/accessV2/permKeys';
import { DEFAULT_TOKEN_LABEL } from '@/util/tokenLabel';

const PROJECT_CREATOR = { key: 'TaskManager_CreateProject', contractType: 'TaskManager',
  permissionRole: 'CreateProject', label: 'Tasks - Create projects' };

const hasValue = (value, column) => column.maskBit === undefined
  ? BigInt(value) !== 0n : (BigInt(value) & BigInt(column.maskBit)) !== 0n;

/** Potential role grants at the global context, never authorization for a person.
 * Only complete, scope-qualified authority facts can prove an absent grant. */
export function orgStructurePermissions({ snapshot, scope, roles = [], tokenLabel = DEFAULT_TOKEN_LABEL }) {
  const permissionColumns = [...V2_MATRIX_COLUMNS.map(column => ({ ...column,
    label: column.key === 'ParticipationToken_Member' ? `${tokenLabel} - Hold`
      : column.key === 'ParticipationToken_Approver' ? `${tokenLabel} - Approve` : column.label,
  })), PROJECT_CREATOR];
  const permissionsMatrix = Object.fromEntries(roles.map(role => [role.hatId,
    Object.fromEntries(permissionColumns.map(column => [column.key, null]))]));
  let data;
  try { data = requireCompleteSnapshot(snapshot, { scope }); } catch { return { permissionColumns, permissionsMatrix }; }

  for (const role of roles) {
    for (const column of V2_MATRIX_COLUMNS) {
      const permission = projectEffectiveSubjectPermissions({ snapshot, scope,
        subjectId: role.hatId, permKey: column.permKey, ctx: GLOBAL_CTX });
      const fact = column.maskBit === undefined ? permission.enabled : permission.value;
      if (fact.state !== 'known') continue;
      const allowed = column.maskBit === undefined ? fact.value : hasValue(fact.value, column);
      const own = permission.contributions.some(contribution =>
        normalizeSubjectId(contribution.subjectId) === normalizeSubjectId(role.hatId)
        && contribution.context.state === 'known' && hasValue(contribution.context.value.value, column));
      permissionsMatrix[role.hatId][column.key] = allowed ? own ? true : 'inherited' : false;
    }
    // The shared observer qualifies this auxiliary binding at the same indexed block.
    // Missing bindings leave only project creation unknown, without page-level RPC reads.
    try {
      const binding = data.taskModule;
      assertPlanScope(binding.source, { chainId: scope.chainId, orgId: scope.orgId,
        endpoint: scope.endpoint, contracts: { membershipAuthority: scope.contract } });
      assertSourceBlock(binding.source.block, snapshot.source.block);
      const memberships = data.subjects.filter(subject => subject.kind === 'Role').map(subject => ({
        subjectId: subject.subjectId,
        isMember: knownFact(normalizeSubjectId(subject.subjectId) === normalizeSubjectId(role.hatId)),
      }));
      const creators = binding.creatorSubjectIds.map(id => ({ id,
        fact: projectSubjectMembership(data, id, memberships) }));
      if (creators.some(({ fact }) => fact.state !== 'known')) continue;
      const allowed = creators.filter(({ fact }) => fact.value);
      permissionsMatrix[role.hatId][PROJECT_CREATOR.key] = allowed.length
        ? allowed.some(({ id }) => normalizeSubjectId(id) === normalizeSubjectId(role.hatId)) ? true : 'inherited' : false;
    } catch { /* Unavailable current bindings never become a negative grant. */ }
  }
  return { permissionColumns, permissionsMatrix };
}
