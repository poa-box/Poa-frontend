/** Form/display units and unsigned saved references -> the public role operation request.
 * No observation demand, history discovery, planner dispatch or proof belongs here. */
import { requireRawUint } from '@poa-box/core/amounts';
import { encodeCaps } from '@/lib/accessV2/pendingActions';
import { parseProjectId } from '@/services/web3/utils/encoding';
import { normalizeRoleForm, effectiveMaxMembers, resolveBindingClassIdx, ROLE_FORM_KIND } from '@/lib/accessV2/roleFormBatch';
import { dedupeDomains, dedupeEmails } from '@/lib/accessV2/joinConfig';
import { sponsorshipAmounts } from '@/lib/accessV2/sponsorship';
import { PERM_KEYS } from '@/lib/accessV2/permKeys';

import { roleCreationReference } from '@/services/web3/domain/RoleCreationWorkflow';
export { roleCreationReference };
export const roleConfigurationReference = roleCreationReference;

export function roleFormRequest(input, { subjectId, continuation, votingClasses = [] } = {}) {
  const f = normalizeRoleForm(input), group = f.kind === ROLE_FORM_KIND.GROUP;
  const permissions = Object.entries(f.perms).filter(([, value]) => Boolean(value)).map(([name, value]) => {
    if (!PERM_KEYS[name]) throw new Error('Choose an available role permission.');
    return { key: PERM_KEYS[name], value: typeof value === 'boolean' ? '1' : requireRawUint(value) };
  });
  for (const row of f.projectPerms) {
    if (row?.projectId == null || row.projectId === '' || !row.mask && row.inheritGlobal !== false) continue;
    const composite = /^0x[0-9a-fA-F]{40}-(.+)$/.exec(String(row.projectId));
    const id = composite ? /^\d+$/.test(composite[1]) ? composite[1]
      : BigInt(parseProjectId(String(row.projectId))).toString() : row.projectId;
    permissions.push({ key: PERM_KEYS.TM_PERMS, value: requireRawUint(row.mask ?? 0),
      projectId: requireRawUint(id), inheritGlobal: row.inheritGlobal !== false });
  }
  const emailAdditions = group ? [] : [
    ...dedupeDomains(f.join.domains).map(identifier => ({ type: 'domain', identifier })),
    ...dedupeEmails(f.emailInvites.map(row => row?.email ?? row)).map(identifier => ({ type: 'email', identifier })),
  ];
  const budget = f.sponsorship.enabled ? sponsorshipAmounts(f.sponsorship) : null;
  return { ...(subjectId ? { mode: 'existing', subjectId: String(subjectId),
    ...(continuation ? { continuation: roleCreationReference(continuation) } : {}) }
    : { mode: f.creationMode === 'compound' ? 'compound' : 'create' }),
  role: { kind: group ? 'Group' : 'Role', name: String(f.name).trim(),
    ...(Object.hasOwn(input || {}, 'imageURI') ? { imageURI: f.imageURI } : {}),
    ...(group ? { memberRoleIds: [...new Set(f.memberRoleIds.map(String))] } : {
      maxMembers: String(effectiveMaxMembers(f)), defaultAllow: Boolean(f.openRole),
      groupIds: [...new Set(f.groupIds.map(String))],
      holders: f.holders.map(holder => ({ account: holder.address, sticky: Boolean(holder.sticky) })),
      ...(f.vouching.enabled ? { vouch: { quorum: String(f.vouching.quorum),
        voucherSubjectId: f.vouching.voucherSubjectId || '0', selfVouch: Boolean(f.vouching.selfVouch) } } : {}),
    }), permissions,
    ...(f.manager.enabled ? { manager: { managerSubjectId: f.manager.managerSubjectId || '0',
      caps: encodeCaps(f.manager), delaySeconds: String(f.manager.delaySecs) } } : {}),
    taskGrants: { creator: Boolean(f.canCreateTasks), organizer: Boolean(f.canOrganizeFolders) },
    ...(f.bindingVote ? { bindingClassIndex: resolveBindingClassIdx(f, votingClasses) } : {}),
    editOrgDetails: Boolean(f.editOrgDetails),
    ...(budget ? { sponsorship: { capRaw: budget.capWei, epochSeconds: String(budget.epochSecs),
      supportPasskeys: Boolean(f.sponsorship.supportPasskeys),
      includeConfiguredEmailRules: f.sponsorship.includeConfiguredEmailRules === true,
      initializeClaimBudget: f.sponsorship.initializeClaimBudget === true } } : {}),
    ...(emailAdditions.length ? { emailAdditions } : {}),
  }, ...(Object.hasOwn(input || {}, 'description') ? { metadata: { name: String(f.name || '').trim(), description: f.description || '' } } : {}) };
}
