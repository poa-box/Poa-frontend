import { describe, expect, it } from 'vitest';
import { withFreshAcceptance, resolveV2SubjectName } from './proposalRuntimeHelpers';

describe('proposal preparation inputs', () => {
  it('lets fresh acceptance override mirrored membership without mutating the roster', () => {
    const roster = new Set(['0xAB', '0xCD']);
    expect([...withFreshAcceptance(roster, { '0xab': false, '0xEF': true })]).toEqual(['0xcd', '0xef']);
    expect([...roster]).toEqual(['0xAB', '0xCD']);
  });
  it('keeps mirrored acceptance when a fresh read has no answer', () => {
    expect([...withFreshAcceptance(['0xAB'], null)]).toEqual(['0xab']);
    expect([...withFreshAcceptance(null, { '0xAB': true })]).toEqual(['0xab']);
  });
  it('resolves role names from either current authority collection', () => {
    expect(resolveV2SubjectName({ roles: [{ subjectId: 7, name: ' Workers ' }] }, '7')).toBe('Workers');
    expect(resolveV2SubjectName({ subjects: [{ id: '8', name: 'Members' }] }, 8)).toBe('Members');
  });
  it('preserves honest identifiers when metadata is absent', () => {
    expect(resolveV2SubjectName(null, null)).toBe('this role');
    expect(resolveV2SubjectName({}, '1234567890123456')).toBe('role 123456…3456');
    expect(resolveV2SubjectName({}, '7')).toBe('role 7');
  });
});
