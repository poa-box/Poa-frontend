/**
 * accessV2/legacyBridge — feed the LEGACY org-structure surfaces from the v2 fold mirror.
 *
 * A migrated org's team page keeps the layouts people know (the permissions matrix, the
 * members-grouped-by-role section, the dashboard structure card) but their data must come from
 * the MembershipAuthority subjects, not the retired hat entities — those go stale at cutover
 * and produce exactly the bugs this module exists to end: raw bytes32 ids rendered as role
 * names, ghost roles with zero wearers, and an all-empty permissions matrix.
 *
 * PURE, like the rest of lib/accessV2 — hooks stay thin and everything here is testable.
 */

import { PERM_KEYS, TASK_PERM_BITS } from './permKeys';

/**
 * The legacy matrix's column vocabulary, expressed over v2 perm keys.
 * `key` copies the legacy `${contractType}_${permissionRole}` convention so PermissionsMatrix
 * renders these columns exactly as it always has. TaskManager columns read one bit each of the
 * folded TM_PERMS mask.
 */
export const V2_MATRIX_COLUMNS = [
  { key: 'QuickJoin_Member', contractType: 'QuickJoin', permissionRole: 'Member', label: 'Membership - Join', permKey: PERM_KEYS.QJ_AUTOJOIN },
  { key: 'ParticipationToken_Member', contractType: 'ParticipationToken', permissionRole: 'Member', label: 'Tokens - Hold', permKey: PERM_KEYS.PT_MEMBER },
  { key: 'ParticipationToken_Approver', contractType: 'ParticipationToken', permissionRole: 'Approver', label: 'Tokens - Approve', permKey: PERM_KEYS.PT_APPROVE },
  { key: 'HybridVoting_Creator', contractType: 'HybridVoting', permissionRole: 'Creator', label: 'Binding Votes - Create', permKey: PERM_KEYS.HV_CREATE },
  { key: 'DirectDemocracyVoting_Voter', contractType: 'DirectDemocracyVoting', permissionRole: 'Voter', label: 'Community Votes - Vote', permKey: PERM_KEYS.DD_VOTE },
  { key: 'DirectDemocracyVoting_Creator', contractType: 'DirectDemocracyVoting', permissionRole: 'Creator', label: 'Community Votes - Create', permKey: PERM_KEYS.DD_CREATE },
  { key: 'EducationHub_Creator', contractType: 'EducationHub', permissionRole: 'Creator', label: 'Learning - Create', permKey: PERM_KEYS.EDU_CREATE },
  { key: 'EducationHub_Member', contractType: 'EducationHub', permissionRole: 'Member', label: 'Learning - Take', permKey: PERM_KEYS.EDU_MEMBER },
  { key: 'PaymentManager_Payments', contractType: 'PaymentManager', permissionRole: 'Payments', label: 'Treasury - Payments', permKey: PERM_KEYS.PAY_CREATE },
  // TaskManager — one column per TaskPerm bit of the org-wide (ctx 0) folded mask, under the
  // exact legacy column keys so PermissionsMatrix's SHORT_LABELS / FULL_DESCRIPTIONS resolve.
  // Per-project overrides stay in the role drawer, where their ctx is actually explained.
  ...[
    { bit: 1, role: 'Create' },
    { bit: 2, role: 'Claim' },
    { bit: 4, role: 'Review' },
    { bit: 8, role: 'Assign' },
    { bit: 16, role: 'SelfReview' },
    { bit: 32, role: 'Budget' },
    { bit: 64, role: 'EditMeta' },
    { bit: 128, role: 'EditFull' },
  ].map(({ bit, role }) => {
    const label = TASK_PERM_BITS.find((b) => b.value === bit)?.label || role;
    return {
      key: `TaskManager_${role}`,
      contractType: 'TaskManager',
      permissionRole: role,
      label: `Tasks - ${label}`,
      permKey: PERM_KEYS.TM_PERMS,
      maskBit: bit,
    };
  }),
];

const cellValue = (fact, col) => {
  if (fact?.state !== 'known') return null;
  try { return col.maskBit === undefined ? BigInt(fact.value) !== 0n : (BigInt(fact.value) & BigInt(col.maskBit)) !== 0n; }
  catch { return null; }
};
function values(subject, col) {
  try {
    const facts = subject.permFacts(col.permKey);
    const effective = cellValue(facts.value, col);
    const own = facts.contributions.find(c => c.subjectId === subject.subjectId);
    const contribution = c => c.context?.state === 'known'
      ? cellValue({ state: 'known', value: c.context.value.value }, col) : null;
    const ownValue = own ? contribution(own) : null;
    const groups = facts.contributions.filter(c => c.subjectId !== subject.subjectId).map(contribution);
    const groupValue = groups.includes(true) ? true : groups.includes(null) ? null : false;
    return { effective, own: ownValue, groups: groupValue };
  } catch { return { effective: null, own: null, groups: null }; }
}

/**
 * The matrix, distinct-permissions edition.
 *
 * A row earns its place only by carrying something of its OWN: groups always represent their own
 * rows, and a role appears only when it adds at least one permission BEYOND what its groups give
 * it. Everything else is one honest sentence, not a wall of dash-rows — a board of ten title
 * roles that only inherit from their group would otherwise render ten near-duplicate rows of
 * the group (or, before the group is granted anything, ten empty ones).
 *
 * Cells are tri-state: `true` = the row's own grant, `'inherited'` = held via a group (rendered
 * muted so the additions stand out).
 *
 * @returns {{
 *   columns: Array, matrix: Object, rows: Array,
 *   hidden: { inheritOnly: Array<{name: string, groupNames: string[]}>, silent: string[] }
 * }}
 */
export function buildV2MatrixView(subjects = []) {
  const rows = [];
  const matrix = {};
  const hidden = { inheritOnly: [], silent: [] };

  for (const s of subjects || []) {
    const cells = {};
    let hasOwnBeyond = false;
    let hasAnything = false;
    let hasUnknown = false;
    for (const col of V2_MATRIX_COLUMNS) {
      const { effective, own, groups } = values(s, col);
      if (effective === false) { cells[col.key] = false; continue; }
      if (effective === null || own === null || (!s.isGroup && own && groups === null)) {
        cells[col.key] = null; hasUnknown = true; continue;
      }
      hasAnything = true;
      const beyond = s.isGroup ? own : own && !groups;
      if (beyond) hasOwnBeyond = true;
      cells[col.key] = beyond ? true : 'inherited';
    }

    if (hasOwnBeyond || hasUnknown) {
      rows.push(s);
      matrix[s.hatId ?? s.subjectId] = cells;
    } else if (hasAnything) {
      hidden.inheritOnly.push({
        name: s.name || 'Untitled',
        groupNames: (s.groups || []).map((g) => g.name).filter(Boolean),
      });
    } else {
      hidden.silent.push(s.name || 'Untitled');
    }
  }

  const columns = V2_MATRIX_COLUMNS.filter((col) =>
    rows.some((s) => matrix[s.hatId ?? s.subjectId][col.key] !== false)
  );
  return { columns, matrix, rows, hidden };
}

/**
 * Roles (then groups) in the legacy `roles` prop shape. Counts come from the live membership
 * roster — the ACTIVE roster, same rule as the v2 panel — with groups deriving theirs through
 * their member roles.
 */
export function buildV2LegacyRoles({ roles = [], groups = [], membersOf, groupMembers, complete = false } = {}) {
  const roleRows = (roles || []).map((r) => ({
    id: r.subjectId,
    hatId: r.hatId ?? r.subjectId,
    name: r.name || 'Untitled',
    isGroup: false,
    memberCount: !complete ? null : membersOf ? membersOf(r.subjectId).length : (r.activeMemberCount ?? 0),
    vouchingEnabled: Boolean(r.vouchConfig?.enabled),
  }));
  const groupRows = (groups || []).map((g) => ({
    id: g.subjectId,
    hatId: g.hatId ?? g.subjectId,
    name: g.name || 'Untitled',
    isGroup: true,
    memberCount: !complete ? null : groupMembers ? (groupMembers.get(g.subjectId) || []).length : 0,
    vouchingEnabled: false,
  }));
  return [...roleRows, ...groupRows];
}
