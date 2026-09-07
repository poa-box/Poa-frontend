import { describe, expect, it } from 'vitest';
import { createScopedRequestGate } from '@/lib/services/scopedRequestGate';

describe('scoped account requests', () => {
  it('rejects an old account completion immediately after switching', () => {
    const gate = createScopedRequestGate(); gate.setScope('a');
    const current = gate.start('a'); gate.setScope('b');
    expect(current()).toBe(false);
    expect(gate.start('a')).toBeNull();
  });
  it('does not revive a request after switching away and back', () => {
    const gate = createScopedRequestGate(); gate.setScope('a');
    const current = gate.start('a'); gate.setScope('b'); gate.setScope('a');
    expect(current()).toBe(false);
    expect(gate.start('a')()).toBe(true);
  });
  it('keeps the newest refresh when responses complete out of order', () => {
    const gate = createScopedRequestGate(); gate.setScope('a');
    const older = gate.start('a'); const latest = gate.start('a');
    expect(older()).toBe(false); expect(latest()).toBe(true);
  });
  it('invalidates connected-account work on signout without invalidating same-scope renders', () => {
    const gate = createScopedRequestGate(); gate.setScope('a');
    const current = gate.start('a'); gate.setScope('a'); expect(current()).toBe(true);
    gate.setScope(''); expect(current()).toBe(false);
  });
});
