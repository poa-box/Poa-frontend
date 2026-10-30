import { describe, it, expect } from 'vitest';
import { utils } from 'ethers';
import { buildRoleFormBatch, defaultRoleForm, normalizeRoleForm, roleFormError, roleFormCopy,
  roleConfigToRoleForm, resolveRoleForm, effectiveMaxMembers, ROLE_FORM_KIND } from '@/lib/accessV2/roleFormBatch';
import { AUTHORITY_ADDRESS as A, ALICE, BOB, MEMBERS_ID, EXECS_ID } from '@/lib/accessV2/fixtures';
const treasurerForm = { kind: 'role', name: 'Treasurer', description: 'Looks after the money', imageURI: 'ipfs://img',
  limitSeats: true, maxMembers: 5, perms: { DD_VOTE: true, HV_CREATE: true, TM_PERMS: 2 },
  bindingVote: true, bindingClassIdx: 0, holders: [{ address: ALICE, name: 'Alice' }] };

describe('the form shape', () => {
  it('never hands out the same nested object twice', () => {
    const a = defaultRoleForm();
    const b = defaultRoleForm();
    a.vouching.quorum = 9;
    a.holders.push({ address: ALICE });
    expect(b.vouching.quorum).toBe(1);
    expect(b.holders).toHaveLength(0);
  });

  it('merges a partial form over the defaults without losing nested keys', () => {
    const f = normalizeRoleForm({ name: 'X', vouching: { enabled: true } });
    expect(f.vouching).toEqual({ enabled: true, quorum: 1, voucherSubjectId: '', selfVouch: false });
    expect(f.kind).toBe('role');
  });

  it('treats "no seat limit" and a limit of 0 as the same on-chain 0', () => {
    expect(effectiveMaxMembers({ limitSeats: false, maxMembers: 9 })).toBe(0);
    expect(effectiveMaxMembers({ limitSeats: true, maxMembers: 0 })).toBe(0);
    expect(effectiveMaxMembers({ limitSeats: true, maxMembers: 5 })).toBe(5);
    // A group has no seats at all.
    expect(effectiveMaxMembers({ kind: 'group', limitSeats: true, maxMembers: 5 })).toBe(0);
  });
});

describe('roleFormError', () => {
  it('asks for a name, in the language of the thing being made', () => {
    expect(roleFormError({})).toBe('Give the new role a name.');
    expect(roleFormError({ kind: 'group' })).toBe('Give the new group a name.');
    expect(roleFormError({ name: '   ' })).toBe('Give the new role a name.');
  });

  it('passes a filled-in role and a filled-in group', () => {
    expect(roleFormError(treasurerForm)).toBeNull();
    expect(roleFormError({ kind: 'group', name: 'Stewards', memberRoleIds: [MEMBERS_ID] })).toBeNull();
    // An empty group is legal on chain — roles can be added later.
    expect(roleFormError({ kind: 'group', name: 'Stewards' })).toBeNull();
  });

  it('refuses a seat limit that is negative, over uint32, or not a number', () => {
    for (const maxMembers of [-1, 'abc', undefined, 4294967296]) {
      expect(roleFormError({ name: 'X', limitSeats: true, maxMembers }))
        .toBe('The seat limit must be a whole number from 0 (no limit) to 4,294,967,295.');
    }
    expect(roleFormError({ name: 'X', limitSeats: true, maxMembers: 4294967295 })).toBeNull();
  });

  it('needs a voucher role unless the role vouches for itself', () => {
    const vouching = { enabled: true, quorum: 2, voucherSubjectId: '', selfVouch: false };
    expect(roleFormError({ name: 'X', vouching }))
      .toBe('Pick the role whose members can vouch, or let the new role vouch for itself.');
    expect(roleFormError({ name: 'X', vouching: { ...vouching, selfVouch: true } })).toBeNull();
    expect(roleFormError({ name: 'X', vouching: { ...vouching, voucherSubjectId: EXECS_ID } })).toBeNull();
    expect(roleFormError({ name: 'X', vouching: { ...vouching, quorum: 0 } }))
      .toBe('Vouching needs a whole number from 1 to 4,294,967,295 vouches.');
  });

  it('catches a bad or repeated address before the batch is built', () => {
    expect(roleFormError({ name: 'X', holders: [{ address: '0x123', name: 'Ann' }] }))
      .toBe('"Ann" has an invalid address.');
    // The same person from two different pickers: one lowercased row, one checksummed.
    expect(roleFormError({ name: 'X', holders: [{ address: ALICE }, { address: utils.getAddress(ALICE) }] }))
      .toMatch(/listed twice/);
  });

  it('gates the project rows and the voting-class pick', () => {
    expect(roleFormError({ name: 'X', projectPerms: [{ projectId: '', mask: 1 }] }))
      .toBe('Pick a project for each project-permission row, or remove the row.');
    expect(roleFormError({ name: 'X', projectPerms: [{ projectId: '1', mask: 1 }, { projectId: '1', mask: 2 }] }))
      .toBe('Each project can only appear once in the permissions list.');
    expect(roleFormError({ name: 'X', bindingVote: true, bindingClassIdx: null }))
      .toBe('Pick which group of voters this role joins.');
    expect(roleFormError({ name: 'X', bindingVote: true, bindingClassIdx: 0 })).toBeNull();
  });

  it('ignores the role-only rules on a group', () => {
    // A group carries no seats, no vouching and no people, so stale answers can't block it.
    expect(roleFormError({
      kind: 'group',
      name: 'Stewards',
      limitSeats: true,
      maxMembers: -5,
      vouching: { enabled: true, quorum: 0 },
      holders: [{ address: '0xnope' }],
    })).toBeNull();
  });
});

describe('the legacy roleConfig bridge', () => {
  const roleConfig = {
    parentHatId: MEMBERS_ID, // legacy field — must be ignored on v2
    name: 'Treasurer',
    description: 'Looks after the money',
    imageURI: 'ipfs://img',
    maxSupply: 3,
    mutable: true,
    canVote: true,
    globalPerms: 6,
    canCreateTasks: true,
    canOrganizeFolders: true,
    vouching: { enabled: true, quorum: 2, voucherHatId: EXECS_ID, selfVouch: false },
    initialWearers: [{ address: ALICE, name: 'Alice' }, { address: BOB, name: 'Bob' }],
    projectPerms: [{ projectId: '1', projectName: 'Ops', mask: 3 }],
  };

  it('maps every field a pre-v2 draft carried onto the form', () => {
    const f = roleConfigToRoleForm(roleConfig);
    expect(f.kind).toBe(ROLE_FORM_KIND.ROLE);
    expect(f.limitSeats).toBe(true);
    expect(effectiveMaxMembers(f)).toBe(3);
    expect(f.perms).toEqual({ HV_CREATE: true, TM_PERMS: 6 });
    expect(f.vouching).toEqual({ enabled: true, quorum: 2, voucherSubjectId: EXECS_ID, selfVouch: false });
    expect(f.holders).toEqual([
      { address: ALICE, name: 'Alice', sticky: false },
      { address: BOB, name: 'Bob', sticky: false },
    ]);
  });

  it('keeps an out-of-range seat cap so the validator can say so', () => {
    expect(roleFormError(roleConfigToRoleForm({ name: 'X', maxSupply: -1 })))
      .toBe('The seat limit must be a whole number from 0 (no limit) to 4,294,967,295.');
    expect(roleFormError(roleConfigToRoleForm({ name: 'X', maxSupply: 0 }))).toBeNull();
  });

  it('resolves the form a proposal will actually be built from', () => {
    // The new form wins whenever it has a name…
    expect(resolveRoleForm({ roleFormV2: { name: 'New' }, roleConfig }).name).toBe('New');
    // …and an old draft falls back to its legacy fields instead of looking empty.
    expect(resolveRoleForm({ roleFormV2: defaultRoleForm(), roleConfig }).name).toBe('Treasurer');
    expect(resolveRoleForm({}).name).toBe('');
    // A group form is never mistaken for a legacy role config.
    expect(resolveRoleForm({ roleFormV2: { kind: 'group', name: 'G' }, roleConfig }).kind).toBe('group');
  });
});

describe('roleFormCopy', () => {
  it('writes the title the wizard suggests, per kind', () => {
    expect(roleFormCopy(treasurerForm).title).toBe('Create role: Treasurer');
    expect(roleFormCopy({ kind: 'group', name: 'Stewards' }).title).toBe('Create group: Stewards');
    expect(roleFormCopy({ name: '  ' })).toEqual({ title: '', description: '' });
  });

  it('describes the decisions that were actually made', () => {
    const copy = roleFormCopy({ ...treasurerForm, openRole: true, vouching: { enabled: true, quorum: 2 } });
    expect(copy.description).toMatch(/anyone can claim it/);
    expect(copy.description).toMatch(/5 seats/);
    expect(copy.description).toMatch(/2 vouches to join/);
    expect(copy.description).toMatch(/a vote in binding votes/);
    expect(copy.description).toMatch(/1 starting member/);
  });
});


describe('review evidence boundary', () => {
  it('refuses unqualified role arrays even when they look complete', () => {
    expect(() => buildRoleFormBatch({ authority: A, indexedSubjects: [{ subjectId: MEMBERS_ID }],
      inOrgUsers: new Set([ALICE]), form: { name: 'Builders', sponsorship: { enabled: false } } })).toThrow('review this proposal');
  });
});
