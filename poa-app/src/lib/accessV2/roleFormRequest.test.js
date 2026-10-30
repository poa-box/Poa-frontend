import { describe, expect, it } from 'vitest';
import { roleFormRequest, roleCreationReference, roleConfigurationReference } from '@/lib/accessV2/roleFormRequest';
import { buildRoleFormBatch, defaultRoleForm, normalizeRoleForm } from '@/lib/accessV2/roleFormBatch';
import { PERM_KEYS } from '@/lib/accessV2/permKeys';
import { resolveTokenLabel } from '@/util/tokenLabel';
import { readRoleContinuations, saveRoleContinuation } from '@/lib/accessV2/roleContinuationDraft';

const alice = `0x${'1'.repeat(40)}`, group = '900719925474099312346';
const base = { name: 'Builders', sponsorship: { enabled: false } };
describe('canonical role operation form mapping', () => {
  it('maps full desired staged intent without predicting a subject or dropping deferred settings', () => {
    const request = roleFormRequest({ ...base, perms: { DD_VOTE: true, TM_PERMS: 6 }, groupIds: [group, group],
      holders: [{ address: alice, name: 'Alice', sticky: true }], limitSeats: true, maxMembers: 5,
      canCreateTasks: true, canOrganizeFolders: true, bindingVote: true, bindingClassIdx: 3,
      vouching: { enabled: true, quorum: 2, voucherSubjectId: group },
      manager: { enabled: true, managerSubjectId: group, canGrant: true, canRemove: true, delaySecs: 86400 },
      projectPerms: [{ projectId: `${alice}-900719925474099312345`, mask: 0, inheritGlobal: false }], editOrgDetails: true });
    expect(request).toMatchObject({ mode: 'create', role: { name: 'Builders', kind: 'Role', maxMembers: '5', defaultAllow: false,
      groupIds: [group], holders: [{ account: alice, sticky: true }], taskGrants: { creator: true, organizer: true },
      bindingClassIndex: 3, editOrgDetails: true, vouch: { quorum: '2', voucherSubjectId: group, selfVouch: false },
      manager: { managerSubjectId: group, caps: 3, delaySeconds: '86400' } } });
    expect(request.role.permissions).toEqual([{ key: PERM_KEYS.DD_VOTE, value: '1' }, { key: PERM_KEYS.TM_PERMS, value: '6' },
      { key: PERM_KEYS.TM_PERMS, value: '0', projectId: '900719925474099312345', inheritGlobal: false }]);
    expect(request).not.toHaveProperty('subjectId'); expect(request).not.toHaveProperty('predictedSubjectId');
  });
  it('keeps metadata/image omission distinct from explicit clearing', () => {
    expect(roleFormRequest(base, { subjectId: group })).not.toHaveProperty('metadata');
    expect(roleFormRequest(base, { subjectId: group }).role).not.toHaveProperty('imageURI');
    const cleared = roleFormRequest({ ...base, description: '', imageURI: '' }, { subjectId: group });
    expect(cleared.metadata).toEqual({ name: 'Builders', description: '' }); expect(cleared.role.imageURI).toBe('');
  });
  it('strips invisible role-only group fields and keeps composition in the full request', () => {
    const result = roleFormRequest({ ...base, kind: 'group', memberRoleIds: [group, group], openRole: true,
      holders: [{ address: alice }], groupIds: [group], emailInvites: ['a@example.org'], join: { domains: ['example.org'] },
      perms: { QJ_AUTOJOIN: true, DD_VOTE: true }, vouching: { enabled: true } });
    expect(result.role).toMatchObject({ kind: 'Group', memberRoleIds: [group], permissions: [{ key: PERM_KEYS.DD_VOTE, value: '1' }] });
    for (const field of ['holders', 'groupIds', 'maxMembers', 'vouch', 'emailAdditions', 'defaultAllow']) expect(result.role).not.toHaveProperty(field);
  });
  it('maps units and email additions without synthesizing a tree, a missing-budget decision or consent', () => {
    const result = roleFormRequest({ ...base, sponsorship: { enabled: true, capNative: '0.25', epochDays: 30, supportPasskeys: true },
      join: { domains: ['EXAMPLE.org', 'example.org'] }, emailInvites: [{ email: 'A@EXAMPLE.ORG' }, 'a@example.org'] });
    expect(result.role.sponsorship).toEqual({ capRaw: '250000000000000000', epochSeconds: '2592000',
      supportPasskeys: true, includeConfiguredEmailRules: false, initializeClaimBudget: false });
    expect(result.role.emailAdditions).toEqual([{ type: 'domain', identifier: 'example.org' }, { type: 'email', identifier: 'a@example.org' }]);
    expect(result.role).not.toHaveProperty('email');
    expect(roleFormRequest({ ...base, sponsorship: { enabled: true, initializeClaimBudget: true } }).role.sponsorship.initializeClaimBudget).toBe(false);
  });
  it('keeps passkey membership actions independent of configured email rules and missing-budget consent', () => {
    expect(defaultRoleForm().sponsorship).toMatchObject({ supportPasskeys: true, includeConfiguredEmailRules: false, initializeClaimBudget: false });
    expect(roleFormRequest({ name: 'Builders' }).role.sponsorship).toMatchObject({ supportPasskeys: true,
      includeConfiguredEmailRules: false, initializeClaimBudget: false });
    const explicit = { ...base, sponsorship: { enabled: true, includeConfiguredEmailRules: true, initializeClaimBudget: true } };
    expect(roleFormRequest(explicit).role.sponsorship).toMatchObject({ supportPasskeys: true,
      includeConfiguredEmailRules: true, initializeClaimBudget: true });
    const additions = { ...base, join: { domains: ['example.org'] }, sponsorship: { enabled: true, initializeClaimBudget: true } };
    expect(roleFormRequest(additions).role.sponsorship).toMatchObject({ includeConfiguredEmailRules: false, initializeClaimBudget: true });
    expect(roleFormRequest(additions).role.emailAdditions).toEqual([{ type: 'domain', identifier: 'example.org' }]);
  });
  it.each(['sponsorship off', 'passkeys off', 'no email selected', 'group switch'])('discards hidden optional consent for %s', mode => {
    const input = { ...base, join: { domains: ['example.org'] }, sponsorship: { enabled: true, includeConfiguredEmailRules: true, initializeClaimBudget: true } };
    if (mode === 'sponsorship off') input.sponsorship.enabled = false;
    if (mode === 'passkeys off') input.sponsorship.supportPasskeys = false;
    if (mode === 'no email selected' || mode === 'group switch') input.sponsorship.includeConfiguredEmailRules = false;
    if (mode === 'no email selected') input.join.domains = [];
    if (mode === 'group switch') input.kind = 'group';
    const normalized = normalizeRoleForm(input);
    expect(normalized.sponsorship).toMatchObject({ includeConfiguredEmailRules: false, initializeClaimBudget: false });
    const restored = normalizeRoleForm({ ...normalized, sponsorship: { ...normalized.sponsorship, enabled: true, supportPasskeys: true } });
    expect(restored.sponsorship.initializeClaimBudget).toBe(false);
  });
  it('retains explicit choices, originalForm and independent stages through a saved draft round trip', () => {
    const stored = new Map(), storage = { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) };
    const scope = { chainId: 100, orgId: 'organization', authority: alice, hybridVoting: alice, executor: alice, account: alice, endpoint: 'mock://index' };
    const desired = normalizeRoleForm({ ...base, sponsorship: { enabled: true, includeConfiguredEmailRules: true, initializeClaimBudget: true } });
    const creation = { status: 'created', attemptId: 'create', call: { target: alice, value: '0', calldata: '0xabcd' } };
    const configuration = { status: 'pending', attemptId: 'configure', batch: [] };
    saveRoleContinuation(storage, scope, { id: 'saved-role', form: desired, originalForm: structuredClone(desired), creation, configuration });
    const saved = readRoleContinuations(storage, scope)[0];
    expect(saved.form.sponsorship).toEqual(desired.sponsorship);
    expect(saved.originalForm).toEqual(desired);
    expect(saved.creation.attemptId).toBe('create'); expect(saved.configuration.attemptId).toBe('configure');
    saveRoleContinuation(storage, scope, { ...saved, form: { ...saved.form, sponsorship: { ...saved.form.sponsorship, supportPasskeys: false } } });
    const changed = readRoleContinuations(storage, scope)[0];
    expect(changed.form.sponsorship).toMatchObject({ includeConfiguredEmailRules: false, initializeClaimBudget: false });
    expect(changed.originalForm).toEqual(desired);
  });
  it('keeps explicit compound selection and permits incomplete forms for bounded options reads', () => {
    expect(roleFormRequest({ ...base, creationMode: 'compound' }).mode).toBe('compound');
    expect(roleFormRequest({ sponsorship: { enabled: false }, editOrgDetails: true }).role).toMatchObject({ name: '', editOrgDetails: true });
    expect(() => roleFormRequest({ ...base, perms: { UNKNOWN: true } })).toThrow('available role permission');
  });
});

describe('unsigned continuation references', () => {
  const submission = { computedHash: `0x${'a'.repeat(64)}`, userOpHash: `0x${'f'.repeat(64)}`, sender: alice,
    accountAddress: alice, nonce: '20', entryPoint: `0x${'2'.repeat(40)}` };
  it('binds actual IDs to exact creation references and uses computed independent operation identities', () => {
    const creation = { transactionHash: `0x${'3'.repeat(64)}`, proposalId: '7', call: { target: alice, calldata: '0x1234', value: '0' }, submission };
    const result = roleFormRequest(base, { subjectId: group, continuation: creation });
    expect(result).toMatchObject({ mode: 'existing', subjectId: group,
      continuation: { transactionHash: creation.transactionHash, call: creation.call, operation: { userOpHash: submission.computedHash, nonce: '20' } } });
    const configuration = roleConfigurationReference({ ...creation, batch: [creation.call], submission: { ...submission, nonce: '21' } });
    expect(configuration.operation.nonce).toBe('21'); expect(configuration).not.toHaveProperty('call');
    expect(configuration.batch).toEqual([creation.call]);
    expect(roleCreationReference({ ...creation, submission: { ...submission, kind: 'transaction' } })).not.toHaveProperty('operation');
  });
});

describe('opaque role result presentation', () => {
  it.each([{ symbol: 'pOa' }, { useTokenSymbol: false, symbol: 'pOa' }, { useTokenSymbol: true, symbol: 'pOa' },
    { useTokenSymbol: true, symbol: '' }, { useTokenSymbol: true }])('keeps the configured ownership label case for %j', options => {
    const tokenLabel = resolveTokenLabel(options), expected = options.useTokenSymbol === true && options.symbol ? 'pOa' : 'Shares';
    const built = buildRoleFormBatch({ form: { ...base, perms: { PT_APPROVE: true } }, tokenLabel,
      operation: { status: 'ready', data: { mode: 'create', requiresConfiguration: true, preview: { callCount: 1, createsSubject: true }, currentEffects: [{ field: 'name' }], deferredEffects: [{ field: 'permissions' }], consequences: [] } } });
    expect(built.configurationSummaries.join(' ')).toContain(expected);
    expect(built.configurationSummaries.join(' ')).not.toMatch(/tokens|participation tokens/i);
    expect(built.batch).toEqual([]);
  });
  it('preserves role and project names that contain the default label while formatting configured ownership copy', () => {
    const built = buildRoleFormBatch({ tokenLabel: 'pOa', form: { ...base, name: 'Shares council', perms: { PT_APPROVE: true },
      projectPerms: [{ projectId: '1', projectName: 'Shares garden', mask: 1 }], bindingVote: true, bindingClassIdx: 1 },
      votingClasses: [{ classIndex: 1, strategy: 1 }], operation: { status: 'ready', data: { mode: 'existing', subjectId: '19',
        requiresConfiguration: false, preview: { callCount: 3, createsSubject: false },
        currentEffects: [{ field: 'permissions' }, { field: 'bindingClassIndex' }], deferredEffects: [] } } });
    const text = built.summaries.join(' ');
    expect(text).toContain('Shares council'); expect(text).toContain('Shares garden'); expect(text).toContain('weighted by pOa');
    expect(text).not.toContain('pOa council'); expect(text).not.toContain('pOa garden');
  });
  it('never exposes a batch or a successful proposal for unknown protocol facts', () => {
    const built = buildRoleFormBatch({ form: base, operation: { status: 'unknown', codes: ['READ_UNAVAILABLE'], observations: {} } });
    expect(built.submittable.ok).toBe(false); expect(built.batch).toEqual([]); expect(built.createsSubject).toBe(false);
    expect(built.submittable.message).toContain('could not be verified');
  });
});
