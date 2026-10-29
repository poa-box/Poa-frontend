/** Controlled role form validation and product presentation. Core owns protocol planning. */

import { MAX_SPONSORED_CALLS, checkBatchSubmittable } from '@/lib/accessV2/submission';
import {
  classByIndex,
  classVoterSummary,
  contractClassIndex,
  directClassIndex,
} from '@/lib/voting/votingClasses';
import { describePermChanges, permChangeSummaries } from '@/config/setterDefinitions';
import {
  domainError,
  emailError,
  joinMethods,
  joinConfigError,
  usesEmailEligibility,
} from '@/lib/accessV2/joinConfig';
import { DEFAULT_SPONSORSHIP, sponsorshipError } from '@/lib/accessV2/sponsorship';
import { PERM_KEYS } from '@/lib/accessV2/permKeys';
import { DEFAULT_TOKEN_LABEL } from '@/util/tokenLabel';

// Re-exported so the two doors (and their tests) keep one import for everything class-related.
export { classByIndex, contractClassIndex };

export const ROLE_FORM_KIND = Object.freeze({ ROLE: 'role', GROUP: 'group' });

/** Shared ballot copy for the visible review and actual proposal payload. */
export const roleOptionNames = ({ stage, kind }) => stage === 'existing'
  ? ['Apply settings', 'Reject'] : kind === ROLE_FORM_KIND.GROUP
    ? ['Create group', 'Reject'] : ['Create role', 'Reject'];

const MAX_SEATS = 4294967295;
const isAddress = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a) && !/^0x0{40}$/i.test(a);
const isSubject = (value) => {
  try { const n = BigInt(String(value)); return n > 0n && n < (1n << 256n); } catch { return false; }
};
const lower = (v) => String(v ?? '').toLowerCase();
const trimmed = (v) => String(v ?? '').trim();

/**
 * The class index the member PICKED, or null for "not picked yet".
 * `Number(null)` is 0 — a real class index — so an unanswered picker would otherwise read as
 * "the first class", silently giving a role votes in a class nobody chose.
 */
function pickedClassIdx(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * A blank form. Returned as a fresh deep copy every time — `vouching` is nested, and one shared
 * object between the draft store, the /team modal and the vote wizard would let a keystroke in one
 * surface rewrite the other.
 */
export function defaultRoleForm() {
  return {
    kind: ROLE_FORM_KIND.ROLE,
    creationMode: 'staged',
    name: '',
    description: '',
    imageURI: '',
    // Seats: the toggle is the decision, `maxMembers` is only read when it is on. On chain 0 is
    // "no limit", so the two collapse into one number at encode time.
    limitSeats: false,
    maxMembers: 5,
    openRole: false,
    // Role kind: groups it joins. Group kind: roles inside it.
    groupIds: [],
    memberRoleIds: [],
    // PermissionPicker's shape, keyed by PERM_KEYS constant name: `{ DD_VOTE: true, TM_PERMS: 6 }`.
    perms: {},
    projectPerms: [],
    canCreateTasks: false,
    canOrganizeFolders: false,
    // Binding votes. `bindingClassIdx` is the CONTRACT class index (uint8), not an array position.
    bindingVote: false,
    bindingClassIdx: null,
    vouching: { enabled: false, quorum: 1, voucherSubjectId: '', selfVouch: false },
    // Email can be combined with vouching, but ZkEmailInvites rejects openly claimable roles.
    join: { domains: [] },
    // Specific-email invitees (ZkEmail allowlist, keyed by a one-way hash of the address).
    emailInvites: [],
    // "Edit org details" — make this role the org's single metadata editor
    // (OrgRegistry.setOrgMetadataAdminHat). NOT a permission key; a single org-wide designation.
    editOrgDetails: false,
    sponsorship: { ...DEFAULT_SPONSORSHIP },
    manager: { enabled: false, managerSubjectId: '', canGrant: true, canRemove: false, delaySecs: 0 },
    holders: [],
  };
}

/** Merge a partial form over the defaults without losing the nested vouching keys. */
export function normalizeRoleForm(form = {}) {
  const base = defaultRoleForm();
  const f = { ...base, ...(form || {}) };
  f.kind = f.kind === ROLE_FORM_KIND.GROUP ? ROLE_FORM_KIND.GROUP : ROLE_FORM_KIND.ROLE;
  f.vouching = { ...base.vouching, ...(form?.vouching || {}) };
  f.join = { ...base.join, ...(form?.join || {}) };
  f.join.domains = [...(form?.join?.domains || [])];
  f.perms = { ...(form?.perms || {}) };
  f.groupIds = [...(form?.groupIds || [])];
  f.memberRoleIds = [...(form?.memberRoleIds || [])];
  f.projectPerms = [...(form?.projectPerms || [])];
  f.emailInvites = [...(form?.emailInvites || [])];
  f.holders = [...(form?.holders || [])];
  f.editOrgDetails = Boolean(form?.editOrgDetails);
  f.sponsorship = { ...base.sponsorship, ...(form?.sponsorship || {}) };
  f.manager = { ...base.manager, ...(form?.manager || {}) };
  if (f.kind === ROLE_FORM_KIND.GROUP) {
    // A kind switch must not submit invisible role-only settings.
    f.openRole = false;
    f.limitSeats = false;
    f.maxMembers = 0;
    f.vouching = { ...base.vouching };
    f.join = { domains: [] };
    f.emailInvites = [];
    f.holders = [];
    f.groupIds = [];
    delete f.perms.QJ_AUTOJOIN;
  }
  // Optional organization-wide changes require their own visible consent. Turning
  // a parent off discards hidden choices, including when restoring an older draft.
  f.sponsorship.includeConfiguredEmailRules = f.sponsorship.enabled && f.sponsorship.supportPasskeys
    && f.sponsorship.includeConfiguredEmailRules === true;
  f.sponsorship.initializeClaimBudget = f.sponsorship.enabled && f.sponsorship.supportPasskeys
    && (f.sponsorship.includeConfiguredEmailRules || f.join.domains.length > 0 || f.emailInvites.length > 0)
    && f.sponsorship.initializeClaimBudget === true;
  return f;
}

export const isGroupForm = (form) => normalizeRoleForm(form).kind === ROLE_FORM_KIND.GROUP;

/** Seat cap as the contract takes it: 0 = no limit, which is also what the toggle-off means. */
export function effectiveMaxMembers(form) {
  const f = normalizeRoleForm(form);
  if (f.kind === ROLE_FORM_KIND.GROUP) return 0;
  if (!f.limitSeats) return 0;
  const n = Number(f.maxMembers);
  return Number.isInteger(n) && n > 0 && n <= MAX_SEATS ? n : 0;
}

/** Does this form ask for anything the DefaultAllowStrongPerms lint cares about? */
// ── Validation ────────────────────────────────────────────────────────────────────────────────

/**
 * The one gate. Returns `null` when the form can be proposed, otherwise the member-facing reason —
 * the same string the wizard's step gate shows and the submit-time validator toasts, so the two
 * can never disagree about whether a form is ready.
 */
export function roleFormError(form) {
  const f = normalizeRoleForm(form);
  const group = f.kind === ROLE_FORM_KIND.GROUP;

  if (!trimmed(f.name)) return group ? 'Give the new group a name.' : 'Give the new role a name.';

  if (!group) {
    // Only judged when the seat switch is on — that is the only time the input is on screen, and
    // an error about a hidden control cannot be fixed. (0 still reads as “no limit”.)
    if (f.limitSeats) {
      const seats = Number(f.maxMembers);
      if (!Number.isInteger(seats) || seats < 0 || seats > MAX_SEATS) {
        return 'The seat limit must be a whole number from 0 (no limit) to 4,294,967,295.';
      }
    }

    if (f.vouching?.enabled) {
      const quorum = Number(f.vouching.quorum);
      if (!Number.isInteger(quorum) || quorum < 1 || quorum > MAX_SEATS) return 'Vouching needs a whole number from 1 to 4,294,967,295 vouches.';
      if (!f.vouching.selfVouch && !trimmed(f.vouching.voucherSubjectId)) {
        return 'Pick the role whose members can vouch, or let the new role vouch for itself.';
      }
      if (!f.vouching.selfVouch && !isSubject(f.vouching.voucherSubjectId)) return 'Pick a valid role or group whose members can vouch.';
    }

    // Email domains + specific-email invites (ZkEmail allowlist). Each entry must survive the exact
    // ASCII normalisation the merkle leaf uses, or it would be a permanently-unclaimable invite.
    for (const d of f.join?.domains || []) {
      const err = domainError(d);
      if (err) return err;
    }
    for (const invite of f.emailInvites || []) {
      const err = emailError(invite?.email ?? invite);
      if (err) return err;
    }
    const joinError = joinConfigError(f);
    if (joinError) return joinError;

    const seen = new Set();
    for (const h of f.holders || []) {
      if (!h?.address || !isAddress(h.address)) {
        return `"${h?.name || 'This person'}" has an invalid address.`;
      }
      if (seen.has(lower(h.address))) {
        return `${h.address.slice(0, 6)}…${h.address.slice(-4)} is listed twice.`;
      }
      seen.add(lower(h.address));
    }
  }

  if (f.manager.enabled) {
    if (!isSubject(f.manager.managerSubjectId)) return 'Pick the role or group that manages membership.';
    if (!f.manager.canGrant && !f.manager.canRemove) return 'Choose what the membership manager can do.';
    const delay = Number(f.manager.delaySecs);
    if (!Number.isInteger(delay) || delay < 0 || delay > MAX_SEATS) return 'The management delay must be a whole number of seconds from 0 to 4,294,967,295.';
    if (group && f.memberRoleIds.some((id) => isSubject(id) && BigInt(String(id)) === BigInt(String(f.manager.managerSubjectId)))) {
      return 'A role inside this group cannot manage the group’s membership.';
    }
  }

  const seenProjects = new Set();
  for (const p of f.projectPerms || []) {
    if (p?.projectId === null || p?.projectId === undefined || p?.projectId === '') {
      return 'Pick a project for each project-permission row, or remove the row.';
    }
    const key = String(p.projectId);
    if (seenProjects.has(key)) return 'Each project can only appear once in the permissions list.';
    seenProjects.add(key);
    if (!Number.isInteger(Number(p.mask)) || Number(p.mask) < 0 || Number(p.mask) > 255) return 'Task permissions must use a valid set of actions.';
  }

  for (const [key, value] of Object.entries(f.perms)) {
    if (value && !PERM_KEYS[key]) return 'A selected permission is no longer supported. Review the permissions.';
    if (key === 'TM_PERMS' && (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 255)) return 'Task permissions must use a valid set of actions.';
  }
  const ids = group ? f.memberRoleIds : f.groupIds;
  if (ids.some((id) => !isSubject(id))) return group ? 'Pick valid roles for the group.' : 'Pick valid groups for the role.';
  if (new Set(ids.map(String)).size > (group ? 16 : 8)) return group ? 'A group can contain at most 16 roles.' : 'A role can belong to at most 8 groups.';

  if (f.bindingVote && pickedClassIdx(f.bindingClassIdx) === null) {
    return 'Pick which group of voters this role joins.';
  }
  if (f.bindingVote && pickedClassIdx(f.bindingClassIdx) > 255) return 'Pick a valid group of voters.';
  return sponsorshipError(f.sponsorship);
}

// ── Legacy bridge ─────────────────────────────────────────────────────────────────────────────

/**
 * The pre-v2 `proposal.roleConfig` lifted into a form.
 *
 * Kept because a DRAFT saved before this shipped still carries only `roleConfig`, and because the
 * mapping is the documentation of what each Hats-era field became. Deliberately does NOT sanitise
 * `maxSupply` — an out-of-range value has to survive into `roleFormError` so the member is told,
 * rather than being quietly rounded into something they did not ask for.
 */
export function roleConfigToRoleForm(roleConfig = {}) {
  const rc = roleConfig || {};
  const seats = Number(rc.maxSupply);
  const capProvided = rc.maxSupply !== undefined && rc.maxSupply !== null && rc.maxSupply !== '';
  return {
    ...defaultRoleForm(),
    kind: ROLE_FORM_KIND.ROLE,
    name: rc.name || '',
    description: rc.description || '',
    imageURI: rc.imageURI || '',
    // A cap the draft actually carries stays ON SCREEN — garbage included — so the validator's
    // complaint points at a visible input. Absent or 0 is “no limit”, which is what 0 means on v2.
    limitSeats: capProvided && seats !== 0,
    maxMembers: capProvided ? rc.maxSupply : 0,
    openRole: Boolean(rc.openRole),
    perms: {
      // `canVote` meant "can open a binding vote", which on v2 is the HV_CREATE permission —
      // NOT `setCreatorHatAllowed`, which HybridVoting stops reading once an authority is set.
      HV_CREATE: Boolean(rc.canVote),
      TM_PERMS: Number(rc.globalPerms) || 0,
    },
    projectPerms: (rc.projectPerms || []).map((p) => ({
      projectId: p?.projectId,
      projectName: p?.projectName || '',
      mask: Number(p?.mask) || 0,
    })),
    canCreateTasks: Boolean(rc.canCreateTasks),
    canOrganizeFolders: Boolean(rc.canOrganizeFolders),
    vouching: {
      enabled: Boolean(rc.vouching?.enabled),
      quorum: Number(rc.vouching?.quorum) || 1,
      voucherSubjectId: rc.vouching?.voucherHatId || '',
      selfVouch: Boolean(rc.vouching?.selfVouch),
    },
    holders: (rc.initialWearers || []).map((w) => ({
      address: w?.address || '',
      name: w?.name || '',
      sticky: false,
    })),
  };
}

/**
 * Which form a createRole proposal will actually be built from.
 *
 * ONE resolution, used by the validator, the encoder and the success copy — so a proposal can
 * never pass validation describing one thing and encode another. The new form wins whenever it
 * has a name; a pre-v2 draft (roleConfig only, merged over a blank `roleFormV2` by
 * `restoreProposal`) falls back to its legacy fields instead of looking empty.
 */
export function resolveRoleForm(proposal) {
  const form = proposal?.roleFormV2;
  if (form && trimmed(form.name)) return normalizeRoleForm(form);
  const rc = proposal?.roleConfig;
  if (rc && trimmed(rc.name)) return roleConfigToRoleForm(rc);
  return normalizeRoleForm(form || {});
}

// ── Copy ──────────────────────────────────────────────────────────────────────────────────────

export const ROLE_TITLE_PREFIX = 'Create role: ';
export const GROUP_TITLE_PREFIX = 'Create group: ';

/** The title + description the vote wizard suggests while the form is being filled in. */
export function roleFormCopy(form) {
  const f = normalizeRoleForm(form);
  const name = trimmed(f.name);
  if (!name) return { title: '', description: '' };
  if (f.continuationId) return { title: `Configure ${f.kind}: ${name}`, description: `Apply the reviewed settings for the existing ${f.kind} “${name}”. This is the second vote; the ${f.kind} has already been created.` };
  const staged = f.creationMode !== 'compound';

  if (f.kind === ROLE_FORM_KIND.GROUP) {
    const count = (f.memberRoleIds || []).length;
    return {
      title: `${GROUP_TITLE_PREFIX}${name}`,
      description:
        `Create the group “${name}”`
        + (count ? ` with ${count} role${count === 1 ? '' : 's'} in it` : '')
        + '. Every role in a group gets the group’s permissions.'
        + (staged ? ' This vote creates the group with its selected roles in it. Any additional selected settings are saved for a separate configuration vote after creation.' : ''),
    };
  }

  const bits = [];
  if (f.openRole) bits.push('anyone can claim it');
  const seats = f.limitSeats && Number(f.maxMembers) > 0 ? Math.floor(Number(f.maxMembers)) : null;
  if (f.vouching?.enabled) {
    const q = Number(f.vouching.quorum) || 1;
    bits.push(`${q} vouch${q === 1 ? '' : 'es'} to join`);
  }
  if (f.bindingVote) bits.push('a vote in binding votes');
  const holders = (f.holders || []).filter((h) => isAddress(h?.address)).length;
  if (holders) bits.push(`${holders} starting member${holders === 1 ? '' : 's'}`);

  return {
    title: `${ROLE_TITLE_PREFIX}${name}`,
    description: `Create the role “${name}”${seats ? ` with ${seats} seats` : ''}${bits.length ? ` — ${staged ? 'requested settings for a separate second vote: ' : ''}${bits.join(', ')}` : ''}.`
      + (staged ? ' This vote creates the role with its details and seat limit. Any additional selected settings are saved for a separate configuration vote after creation.' : ''),
  };
}

// ── Voting classes ────────────────────────────────────────────────────────────────────────────

/**
 * Which class a new subject should join: the member's pick, else the DIRECT (one-member-one-vote)
 * class — the one every org has and the only one where a brand-new role has any weight without
 * also holding tokens. -1 when the org has no class to join.
 */
export function resolveBindingClassIdx(form, votingClasses = []) {
  const f = normalizeRoleForm(form);
  const explicit = pickedClassIdx(f.bindingClassIdx);
  if (explicit !== null) return explicit;
  const arrayIdx = directClassIndex(votingClasses);
  if (arrayIdx < 0) return -1;
  return contractClassIndex(votingClasses, arrayIdx);
}

// ── The batch ─────────────────────────────────────────────────────────────────────────────────

/**
 * The builders count permissions (“Give it 3 permissions”); a voter needs the list. Replace that
 * one line with the same sentences the change-permissions template writes, so a role created
 * here and a role edited there read the same way on the ballot.
 */

const ownershipCopy = (line, tokenLabel) => line.replace(/participation tokens|share requests|shares/gi,
  match => /requests/i.test(match) ? `${tokenLabel} requests` : tokenLabel);

function describePerms(form, name, tokenLabel) {
  const f = normalizeRoleForm(form);
  const changes = describePermChanges({}, f.perms);
  const labelled = Object.fromEntries(Object.entries(changes).map(([key, phrases]) => [key,
    Array.isArray(phrases) ? phrases.map(phrase => ownershipCopy(phrase, tokenLabel)) : phrases]));
  const out = permChangeSummaries(name, labelled);
  const projects = (f.projectPerms || []).filter(
    (p) => (Number(p?.mask) > 0 || p?.inheritGlobal === false) && p.projectId !== null && p.projectId !== undefined && p.projectId !== ''
  );
  if (projects.length) {
    const names = projects.map((p) => p.projectName || `project ${p.projectId}`);
    out.push(`Set what “${name}” can do on ${names.join(', ')}`);
    const overrides = projects.filter((p) => p.inheritGlobal === false).map((p) => p.projectName || `project ${p.projectId}`);
    if (overrides.length) out.push(`Use only the selected task actions from “${name}” on ${overrides.join(', ')}, replacing its org-wide task permissions there`);
  }
  if (f.kind === ROLE_FORM_KIND.GROUP && out.length) out.push('Every role in the group gets these.');
  return out;
}

/** Adapt an opaque core review/preparation for the existing controlled UI and ballot.
 * A review contains no executable batch. Only core preparation supplies final calldata.
 * Form fields below describe requested settings; they never select a protocol planner. */
export function buildRoleFormBatch({ form = {}, operation, nativeSymbol = 'native currency', votingClasses = [],
  tokenLabel = DEFAULT_TOKEN_LABEL, review, preview = true } = {}) {
  if (!operation) throw new Error('Refresh the current role settings and review this proposal before continuing.');
  const f = normalizeRoleForm(form);
  if (operation.status !== 'ready') return { batch: [], summaries: [], configurationSummaries: [], warnings: [],
    createsSubject: false, kind: f.kind, stage: null, preview, plan: operation,
    submittable: { ok: false, code: 'role-unavailable', message: 'Current role settings could not be verified. Refresh and review them again.' } };
  const data = operation.data, mode = data.mode, group = f.kind === ROLE_FORM_KIND.GROUP;
  const batch = preview ? [] : (data.batch || []).map(call => ({ target: call.target, value: String(call.value), data: call.calldata }));
  const summaries = [`${mode === 'existing' ? 'Configure' : 'Create'} the ${group ? 'group' : 'role'} “${f.name}”`];
  const reviewed = review || data;
  const describe = effects => (effects || []).flatMap(({ field }) => {
    if (field === 'maxMembers') return [effectiveMaxMembers(f) > 0 ? `Limit the role to ${effectiveMaxMembers(f)} members` : 'Set no limit on the number of members in this role'];
    if (field === 'metadata') return [f.description ? `Set the ${group ? 'group' : 'role'} description to “${f.description}”` : `Clear the ${group ? 'group' : 'role'} description`];
    if (field === 'imageURI') return [f.imageURI ? `Set the ${group ? 'group' : 'role'} image` : `Clear the ${group ? 'group' : 'role'} image`];
    if (field === 'permissions') return describePerms(f, f.name, tokenLabel);
    if (field === 'defaultAllow' && f.openRole) return ['Make it open — anyone in the org can join it'];
    if ((field === 'groupIds' && f.groupIds.length) || (field === 'memberRoleIds' && f.memberRoleIds.length)) return ['Apply the selected role and group memberships'];
    if (field === 'vouch' && f.vouching.enabled) return [`Allow joining with ${f.vouching.quorum} vouches`];
    if (field === 'manager' && f.manager.enabled) return ['Let the selected membership manager manage this role or group'];
    if (field === 'holders') return f.holders.map(holder => {
      const accepted = reviewed.evidence?.context.data.accounts.find(row => lower(row.account) === lower(holder.address))?.acceptedAnywhere;
      return `${accepted?.state !== 'known' ? 'Add or invite' : accepted.value ? 'Add' : 'Invite'} ${holder.name || holder.address}`;
    });
    if (field === 'taskGrants') return [f.canCreateTasks && 'Let it create projects and tasks', f.canOrganizeFolders && 'Let it organise the project folders'].filter(Boolean);
    if (field === 'bindingClassIndex') {
      return [classVoterSummary({ roleName: f.name, classIdx: resolveBindingClassIdx(f, votingClasses), tokenLabel,
        votingClasses: reviewed.evidence?.context.data.hybrid?.classes || votingClasses })];
    }
    if (field === 'editOrgDetails' && f.editOrgDetails) return [`Let members of “${f.name}” edit the org’s name and details`];
    if (field === 'sponsorship') return [
      `Set a shared sponsorship limit of ${f.sponsorship.capNative} ${nativeSymbol} per ${f.sponsorship.epochDays} days`,
      f.sponsorship.supportPasskeys && 'Sponsor membership actions with passkeys across the organization',
      f.sponsorship.includeConfiguredEmailRules && 'Sponsor the organization’s configured verified email joining actions',
      f.sponsorship.initializeClaimBudget && `If missing, start an email joining budget of ${f.sponsorship.capNative} ${nativeSymbol} per ${f.sponsorship.epochDays} days, shared across the organization`,
    ].filter(Boolean);
    if (field === 'emailAdditions') return [`Allow the selected verified email addresses and domains to claim “${f.name}”`];
    return [];
  });
  const settings = describe(reviewed.currentEffects), deferred = describe(reviewed.deferredEffects);
  const warnings = [];
  for (const consequence of data.consequences || operation.consequences || []) {
    const copy = {
      SUBJECT_CREATION_RACE: 'Another role or group creation executing first can change the role id. Coordinate these votes before execution.',
      REPLACE_ORG_METADATA_ADMIN: 'This replaces the organization’s current role for editing its name and details.',
      SHARED_SPONSORSHIP_BUDGET: 'The sponsorship limit is shared by everyone in this role or group.',
      INITIALIZE_EMAIL_CLAIM_BUDGET: 'This starts a shared email joining budget for new members across the organization.',
      ALLOWLIST_EXECUTION_RACE: 'Other email joining changes may require this vote to be reviewed again before it runs.',
    }[consequence.code];
    if (copy) warnings.push(copy);
  }
  if (data.requiresConfiguration && mode === 'create') warnings.push('Step 1 of 2: this vote creates the role or group. After it passes and runs, use Finish configuration on the voting page to review and submit a separate vote for your saved settings. Nobody is added and permissions are not granted by this first vote.');
  return { batch, summaries: [...summaries, ...settings],
    configurationSummaries: deferred, warnings, plan: operation,
    fingerprint: data.fingerprint, predictedSubjectId: data.predictedSubjectId || null, subjectId: mode === 'existing' ? data.subjectId : null,
    stage: mode, requiresConfiguration: data.requiresConfiguration, kind: f.kind,
    createsSubject: preview ? data.preview.createsSubject : mode !== 'existing',
    gasLimit: 400_000 + 250_000 * (preview ? data.preview.callCount : batch.length),
    joinSummary: group ? [] : joinMethods(f), preview,
    submittable: preview ? { ok: Number.isSafeInteger(data.preview.callCount) && data.preview.callCount > 0 && data.preview.callCount <= MAX_SPONSORED_CALLS,
      message: `A vote can include at most ${MAX_SPONSORED_CALLS} steps. Split these settings into separate votes.` } : checkBatchSubmittable(batch) };
}

export default buildRoleFormBatch;
