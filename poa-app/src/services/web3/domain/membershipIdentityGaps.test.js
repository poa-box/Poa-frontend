import { describe, expect, it } from 'vitest';
import { requireRawUint } from '@poa-box/core/amounts';
import { normalizeMaxMembers } from '@/lib/accessV2/subjects';
describe('serving-index signed seat limit adapter', () => {
  it('retains serving-index signed unlimited-seat normalization, which an unsigned reader input rejects', () => {
    expect(() => requireRawUint('-1', 32)).toThrow();
    expect(normalizeMaxMembers('-1')).toEqual({ maxMembers: 0, unlimitedSeats: true });
    expect(normalizeMaxMembers('0')).toEqual({ maxMembers: 0, unlimitedSeats: true });
    expect(normalizeMaxMembers('10')).toEqual({ maxMembers: 10, unlimitedSeats: false });
  });
});
