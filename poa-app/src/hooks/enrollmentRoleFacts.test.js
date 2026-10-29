import { describe, expect, it } from 'vitest';
import { enrollmentRoleFacts } from '@/hooks/enrollmentRoleFacts';
describe('native enrollment display facts', () => {
  it('reads native open and vouch inputs with an explicit known state', () => {
    expect(enrollmentRoleFacts({ defaultAllow: false, vouchConfig: { quorum: '3', voucherSubjectId: '9007199254740993' } }, true))
      .toMatchObject({ isOpen: false, openKnown: true, vouchingKnown: true, vouchingEnabled: true, vouchingQuorum: '3', vouchingMembershipHatId: '9007199254740993' });
    expect(enrollmentRoleFacts({ defaultAllow: true, vouchConfig: null }, true)).toMatchObject({ isOpen: true, vouchingEnabled: false });
  });
  it.each([{}, { defaultEligible: false, hat: { vouchConfig: { enabled: false } } }, { defaultAllow: false }])('keeps incomplete or historical inputs unknown: %j', raw => {
    const result = enrollmentRoleFacts(raw, true);
    expect(result.vouchingKnown).toBe(false); expect(result.vouchingEnabled).toBeNull();
    if (raw.defaultAllow === undefined) { expect(result.openKnown).toBe(false); expect(result.isOpen).toBeNull(); }
    expect(enrollmentRoleFacts(raw, false)).toMatchObject({ openKnown: false, isOpen: null, vouchingKnown: false });
  });
});
