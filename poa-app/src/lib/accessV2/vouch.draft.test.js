import { describe, expect, it } from 'vitest';
import { predictAuthorityLints } from '@poa-box/core/authority/lifecycle';
import { predictDraftLints, predictLints } from '@/lib/accessV2/vouch';
import { defaultRoleForm, roleFormError } from '@/lib/accessV2/roleFormBatch';

const codes = config => predictDraftLints(config).map(lint => lint.code);
const coreInput = { subjectId: '1', voucherSubjectId: '2', vouchQuorum: 1, maxMembers: 0, permCount: 0, groupFanout: 0 };

describe('draft-only lint adaptation with installed core', () => {
  it.each([undefined, null, ''])('represents unanswered voucher %s without fabricating self-vouching', voucherSubjectId => {
    expect(predictDraftLints({ voucherSubjectId })).toEqual([]);
    expect(codes({ voucherSubjectId, vouchQuorum: 1 })).not.toContain('SelfVoucher');
    expect(roleFormError({ ...defaultRoleForm(), name: 'Reviewers', vouching: { enabled: true, voucherSubjectId } })).toContain('Pick the role whose members can vouch');
  });

  it('uses only the explicit self-vouch choice and the real core quorum semantics', () => {
    expect(codes({ selfVouch: true, vouchQuorum: 1 })).toEqual(['SelfVoucher']);
    expect(codes({ selfVouch: true, vouchQuorum: 0 })).toEqual([]);
    expect(codes({ selfVouch: false, vouchQuorum: 1, voucherSubjectId: '1' })).toEqual([]);
    expect(codes({ selfVouch: true, vouchQuorum: 2, maxMembers: 5, defaultAllow: true, hasStrongPerms: true })).toEqual([
      'QuorumNoOp', 'VouchWithMaxMembers', 'DefaultAllowStrongPerms', 'SelfVoucher',
    ]);
  });

  it.each(['0', '00', '0x0', '1', '01', '0x1', '2', '0x2', ((1n << 256n) - 1n).toString()])('avoids equality collisions for external voucher %s', voucherSubjectId => {
    expect(codes({ selfVouch: false, voucherSubjectId, vouchQuorum: 1 })).not.toContain('SelfVoucher');
  });

  it.each(['self', 'not-an-id', ' 1', '-1', '1.2', '1e2', '0xinvalid', `0x${'ab'.repeat(20)}-123`, (1n << 256n).toString()])('retains strict malformed external ID rejection for %s', voucherSubjectId => {
    expect(() => predictDraftLints({ voucherSubjectId, vouchQuorum: 1 })).toThrow();
    expect(() => predictLints({ voucherSubjectId, subjectId: '3', vouchQuorum: 1 })).toThrow();
    expect(() => predictAuthorityLints({ ...coreInput, voucherSubjectId })).toThrow();
  });

  it.each(['', 'self', `0x${'ab'.repeat(20)}-123`])('does not adapt submitted subject ID %s', subjectId => {
    expect(() => predictLints({ subjectId, voucherSubjectId: '2', vouchQuorum: 1 })).toThrow();
    expect(() => predictAuthorityLints({ ...coreInput, subjectId })).toThrow();
  });

  it('continues to reject composite voucher keys at the form validation boundary', () => {
    const voucherSubjectId = `0x${'ab'.repeat(20)}-123`;
    expect(roleFormError({ ...defaultRoleForm(), name: 'Reviewers', vouching: { enabled: true, voucherSubjectId } })).toBe('Pick a valid role or group whose members can vouch.');
  });

  it('keeps canonical numeric/hex equality in real, allocated subject lints', () => {
    const subjectId = ((1n << 224n) + 1n).toString();
    const voucherSubjectId = `0x${BigInt(subjectId).toString(16)}`;
    expect(predictLints({ subjectId, voucherSubjectId, vouchQuorum: 1 }).map(lint => lint.code)).toEqual(['SelfVoucher']);
  });
});
