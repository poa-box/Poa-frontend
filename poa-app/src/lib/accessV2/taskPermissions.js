import { projectCtx } from '@/lib/accessV2/proposalBuilders';
import { PERM_BITS } from '@poa-box/core/perms';
import { PERM_KEYS } from '@/lib/accessV2/permKeys';

export const TASK_PERMISSION_BITS = { canCreate: PERM_BITS.create, canClaim: PERM_BITS.claim, canReview: PERM_BITS.review, canAssign: PERM_BITS.assign, canSelfReview: PERM_BITS['self-review'], canBudget: PERM_BITS.budget, canEditMeta: PERM_BITS['edit-meta'], canEditFull: PERM_BITS['edit-full'] };
const BITS = TASK_PERMISSION_BITS;

/** Adapt CURRENT authority permissions to board row shapes. History stays in the graph untouched. */
export function authorityTaskPermissionRows(subjects, projectId = null) {
  let ctx;
  try { ctx = projectCtx(projectId); } catch { return []; }
  return (subjects || []).filter(subject => !subject.isGroup).map(subject => {
    let mask = null;
    let permissionFact;
    let hasProjectOverride = null;
    try { const facts = subject.permFacts(PERM_KEYS.TM_PERMS, ctx);
      permissionFact = facts.value;
      if (facts.contributions.every(row => row.context.state === 'known')) hasProjectOverride = facts.contributions.some(row => row.context.value.project?.exists === true);
      if (permissionFact.state === 'known') mask = Number(BigInt(permissionFact.value) & 255n); } catch {}
    return { hatId: subject.subjectId, mask, permissionFact, hasProjectOverride, resolved: true, ...Object.fromEntries(Object.entries(BITS).map(([name, bit]) => [name, mask === null ? null : (mask & bit) !== 0])) };
  });
}
