/** Shape adapters only: the host supplies actual source, scope and enumeration coverage. */
import { projectEffectiveSubjectPermissions, projectUserPermissions } from '@poa-box/core/authority/permissions';
import { projectMembershipLifecycle, projectPendingAction, projectVouchEligibility } from '@poa-box/core/authority/lifecycle';
import { electorateActivationFacts } from '@poa-box/core/authority/activation';
import { GLOBAL_CTX, PERM_KEYS } from '@/lib/accessV2/permKeys';

export { projectUserPermissions, projectMembershipLifecycle, projectPendingAction, projectVouchEligibility, electorateActivationFacts };

export function permissionSnapshotFromSubjects(subjects, snapshot) {
  const groupEdges = new Map();
  for (const subject of subjects) {
    for (const roleId of subject.memberRoleIds || []) {
      const id = `${subject.subjectId}:${roleId}`;
      groupEdges.set(id, { id, groupSubjectId: subject.subjectId, roleSubjectId: roleId, isActive: true });
    }
  }
  return { ...snapshot, data: {
    subjects: subjects.map(s => ({ subjectId: s.subjectId, kind: s.kind, name: s.name ?? null })),
    groupEdges: [...groupEdges.values()],
    permissions: subjects.flatMap(s => (s.permRows || []).map(row => ({
      id: row.id, subjectId: s.subjectId, permKey: row.permKey, ctx: row.ctx, word: Object.prototype.hasOwnProperty.call(row, 'protocolWord') ? row.protocolWord : row.raw,
    }))),
  } };
}

/** Attach canonical subject projections only to evidence qualified by the caller. */
export function attachCoreSubjectPermissions(subjects, { snapshot, scope }) {
  const projected = permissionSnapshotFromSubjects(subjects, snapshot);
  const result = subjects.map(subject => {
    const facts = (key, ctx = GLOBAL_CTX) => projectEffectiveSubjectPermissions({
      snapshot: projected, scope, subjectId: subject.subjectId, permKey: key, ctx,
    });
    const value = (key, ctx) => {
      const fact = facts(key, ctx).value;
      return fact.state === 'known' ? fact.value : '0';
    };
    const enabled = key => { const fact = facts(key).enabled; return fact.state === 'known' && fact.value; };
    return { ...subject, permFacts: facts, permEffective: value,
      canVote: enabled(PERM_KEYS.DD_VOTE),
      canCreateVote: enabled(PERM_KEYS.DD_CREATE) || enabled(PERM_KEYS.HV_CREATE),
      taskMask: value(PERM_KEYS.TM_PERMS),
      permSources: (key, ctx) => facts(key, ctx).contributions.filter(c =>
        c.context.state === 'known' && c.context.value.value !== '0').map(c => c.subjectId),
      permViaGroup: key => facts(key).contributions.some(c => c.subjectId !== subject.subjectId
        && c.context.state === 'known' && c.context.value.value !== '0'),
    };
  });
  const byId = new Map(result.map(subject => [subject.subjectId, subject]));
  for (const subject of result) {
    subject.groups = (subject.groupIds || []).map(id => byId.get(id)).filter(Boolean);
    subject.memberRoles = (subject.memberRoleIds || []).map(id => byId.get(id)).filter(Boolean);
  }
  return result;
}
