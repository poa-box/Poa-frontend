/** Host draft compatibility policy, never an existing organization migration. */
export function legacyDraftIssues(state) {
  const issues = [];
  for (const role of state.roles || []) {
    if (Object.hasOwn(role, 'hierarchy')) issues.push(`${role.name}: retired parent-role hierarchy`);
    if (Object.hasOwn(role.vouching || {}, 'combineWithHierarchy')) issues.push(`${role.name}: hierarchy admins vouch setting`);
    if (Object.hasOwn(role, 'defaults')) issues.push(`${role.name}: retired standing default and eligibility settings`);
    if (Object.hasOwn(role, 'hatConfig')) issues.push(`${role.name}: retired immutable-role settings`);
  }
  if ((state.ddInitialTargets || []).length) issues.push('Poll execution targets');
  return issues;
}
export const LEGACY_DRAFT_MESSAGE = 'This saved draft uses retired settings. Choose a current template or reset the draft, then review who can join and who can vouch. Roles are flat; membership changes are decided through governance. Polls only gather opinions.';

/** A launch-time staffing hint; never changes the selected admission rule. */
export function nativeMembershipWarnings(roles, founderAddress) {
  return (roles || []).flatMap(role => {
    if (!role.vouching?.enabled) return [];
    const vouchers = roles[role.vouching.voucherRoleIndex];
    if (!vouchers) return [];
    const distribution = vouchers.distribution || {};
    const initial = new Set([
      ...(distribution.mintToDeployer ? [founderAddress?.toLowerCase() || 'founder'] : []),
      ...(distribution.additionalWearers || []).map(address => String(address).toLowerCase()),
      ...(distribution.additionalMembers || []).map(member => String(member.address || member.username || member).toLowerCase()),
    ]);
    const required = Number(role.vouching.quorum);
    return initial.size < required ? [
      `${role.name} needs ${required} vouches from ${vouchers.name}, with ${initial.size} member${initial.size === 1 ? '' : 's'} assigned there at launch. Add founding members or review how membership will be granted through governance.`,
    ] : [];
  });
}
