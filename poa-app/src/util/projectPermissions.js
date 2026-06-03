/**
 * projectPermissions.js
 *
 * Pure helpers for the Project Info modal. Two jobs, both operating ONLY on data already
 * present on `selectedProject` (see the ProjectContext transform) so the modal needs no
 * extra subgraph query:
 *
 *   1. Build a project-scoped role-permission matrix that mirrors the contract's
 *      `_permMask` fallback (project mask shadows the org-wide global mask per hat).
 *   2. Derive activity stats from the loaded task columns.
 *
 * No React, no network — keeps the modal thin and these functions unit-testable.
 */

/**
 * The 8 TaskPerm bits as [subgraph flag, short role name] pairs, in TaskPerm.sol bit order
 * (low -> high). The short role name builds column keys `TaskManager_<Role>` that line up
 * with the PERMISSION_ICONS / SHORT_LABELS / FULL_DESCRIPTIONS maps already defined in
 * PermissionsMatrix.jsx, so those light up for free without exporting them.
 */
export const TASK_PERM_BITS = [
  ['canCreate', 'Create'],
  ['canClaim', 'Claim'],
  ['canReview', 'Review'],
  ['canAssign', 'Assign'],
  ['canSelfReview', 'SelfReview'],
  ['canBudget', 'Budget'],
  ['canEditMeta', 'EditMeta'],
  ['canEditFull', 'EditFull'],
];

/**
 * Normalize a hat ID to a string for comparison. Mirrors permissions.js (String + trim)
 * so project/global/role hat IDs from the subgraph compare consistently.
 */
function normalizeHatId(hatId) {
  if (hatId === null || hatId === undefined) return '';
  return String(hatId).trim();
}

/**
 * Format a numeric count/amount for display (thousands separators, up to 2 decimals,
 * trailing zeros dropped). Display only — never fed back into Number().
 */
function formatCount(n) {
  if (!n) return '0';
  const rounded = Math.round(n * 100) / 100;
  return rounded.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Static column set for the project permissions matrix — the 8 TaskPerm actions.
 * @returns {Array<{key:string, permissionRole:string, label:string}>} shaped for PermissionsMatrix
 */
export function buildProjectPermissionColumns() {
  return TASK_PERM_BITS.map(([, role]) => ({
    key: `TaskManager_${role}`,
    permissionRole: role,
    label: `Tasks - ${role}`,
  }));
}

/**
 * Build a project-scoped permission matrix from the project's per-project `rolePermissions`
 * and the org-wide `globalRolePermissions`, applying the contract's `_permMask` fallback
 * PER ROLE: if a role's project entry has `mask !== 0`, its can* flags REPLACE the global
 * (no fall-back even for bits left unset); otherwise the global entry's flags are used.
 *
 * @param {Object} args
 * @param {Array}  args.roles - org roles [{ id, hatId, name, memberCount }]
 * @param {Array}  args.rolePermissions - project rolePermissions [{ hatId, mask, can* }]
 * @param {Array}  args.globalRolePermissions - org globalRolePermissions [{ hatId, mask, can* }]
 * @returns {{ permissionsMatrix: Object, rolesWithGrants: Array, hasAnyGrant: boolean, overrideHatIds: Set<string> }}
 */
export function buildProjectPermissionsMatrix({
  roles = [],
  rolePermissions = [],
  globalRolePermissions = [],
} = {}) {
  // Index project entries by hat. mask=0 is treated as absent because the contract's
  // _permMask falls back to global when the per-project mask is zero.
  const projectByHat = new Map();
  (rolePermissions || []).forEach((p) => {
    if (p && Number(p.mask || 0) > 0) projectByHat.set(normalizeHatId(p.hatId), p);
  });

  const globalByHat = new Map();
  (globalRolePermissions || []).forEach((p) => {
    if (p) globalByHat.set(normalizeHatId(p.hatId), p);
  });

  const permissionsMatrix = {};
  const rolesWithGrants = [];
  const overrideHatIds = new Set();
  let hasAnyGrant = false;

  (roles || []).forEach((role) => {
    const hat = normalizeHatId(role.hatId);
    const projectEntry = projectByHat.get(hat);
    // Project entry (non-zero mask) shadows global entirely; else fall back to global.
    const effectiveEntry = projectEntry || globalByHat.get(hat) || null;

    const cells = {};
    let roleHasGrant = false;
    TASK_PERM_BITS.forEach(([flag, shortRole]) => {
      const allowed = Boolean(effectiveEntry && effectiveEntry[flag]);
      cells[`TaskManager_${shortRole}`] = allowed;
      if (allowed) roleHasGrant = true;
    });

    permissionsMatrix[role.hatId] = cells;
    if (projectEntry) overrideHatIds.add(hat);
    if (roleHasGrant) {
      rolesWithGrants.push(role);
      hasAnyGrant = true;
    }
  });

  return { permissionsMatrix, rolesWithGrants, hasAnyGrant, overrideHatIds };
}

/**
 * Derive activity stats for a project from its already-loaded task columns.
 *
 * NOTE: each task's `payout` / `bountyPayout` is already a formatted numeric string (no
 * thousands separators — see formatTokenAmount), so summing via Number() is safe. We use
 * these task payouts for "shares paid out" rather than `project.spent`, which the subgraph
 * does not index (it is always '0').
 *
 * @param {Object} project - selectedProject (may be falsy / partially loaded)
 * @param {Object} [opts]
 * @param {string} [opts.tokenLabel='Shares']
 * @returns {Object} stats { totalTasks, open, inProgress, inReview, completed, completionPct,
 *   contributors, ptPaidOut, ptPaidOutNum, bountyPaidByToken, createdAt, tokenLabel }
 */
export function deriveProjectStats(project, { tokenLabel = 'Shares' } = {}) {
  const byId = {};
  (project?.columns || []).forEach((c) => {
    byId[c.id] = c.tasks || [];
  });

  const open = (byId.open || []).length;
  const inProgress = (byId.inProgress || []).length;
  const inReview = (byId.inReview || []).length;
  const completedTasks = byId.completed || [];
  const completed = completedTasks.length;
  const totalTasks = open + inProgress + inReview + completed;
  const completionPct = totalTasks ? Math.round((completed / totalTasks) * 100) : 0;

  // Shares (PT) paid out = sum of completed-task payouts.
  let ptPaidOutNum = 0;
  completedTasks.forEach((t) => {
    const n = Number(t.payout);
    if (Number.isFinite(n)) ptPaidOutNum += n;
  });

  // Bounty paid out grouped by token address (only completed tasks, non-zero amounts).
  const bountyPaidByToken = {};
  completedTasks.forEach((t) => {
    const n = Number(t.bountyPayout);
    if (t.bountyToken && Number.isFinite(n) && n > 0) {
      bountyPaidByToken[t.bountyToken] = (bountyPaidByToken[t.bountyToken] || 0) + n;
    }
  });

  // Unique contributors: anyone holding or who completed work (open tasks have no assignee).
  // Prefer the assignee address; fall back to a username when the address is missing.
  const contributorSet = new Set();
  [...(byId.inProgress || []), ...(byId.inReview || []), ...completedTasks].forEach((t) => {
    const key =
      (t.claimedBy && String(t.claimedBy).toLowerCase()) ||
      t.completerUsername ||
      t.claimerUsername;
    if (key) contributorSet.add(key);
  });

  return {
    totalTasks,
    open,
    inProgress,
    inReview,
    completed,
    completionPct,
    contributors: contributorSet.size,
    ptPaidOut: formatCount(ptPaidOutNum),
    ptPaidOutNum,
    bountyPaidByToken,
    createdAt: project?.createdAt,
    tokenLabel,
  };
}
