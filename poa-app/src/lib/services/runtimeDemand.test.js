import { describe, expect, it } from 'vitest';
import { shouldLoadServiceRuntime } from './runtimeDemand';

describe('service runtime demand', () => {
  it('keeps signing implementation out of anonymous and still-unresolved browsing', () => {
    expect(shouldLoadServiceRuntime(3, { isAuthenticated: false, isAuthHydrated: true })).toBe(false);
    expect(shouldLoadServiceRuntime(3, { isAuthenticated: false, isAuthHydrated: false })).toBe(false);
  });
  it('starts on restored or connecting identity and allows explicit retry', () => {
    expect(shouldLoadServiceRuntime(1, { isAuthenticated: true })).toBe(true);
    expect(shouldLoadServiceRuntime(1, { passkeyConnecting: true })).toBe(true);
    expect(shouldLoadServiceRuntime(1, {}, true)).toBe(true);
  });
  it('suspends an unused global runtime after account UI unmounts, even following retry', () => {
    expect(shouldLoadServiceRuntime(0, { isAuthenticated: true })).toBe(false);
    expect(shouldLoadServiceRuntime(0, { passkeyConnecting: true })).toBe(false);
    expect(shouldLoadServiceRuntime(0, {}, true)).toBe(false);
    // An org-scoped subscriber can run independently of the outer account shell.
    expect(shouldLoadServiceRuntime(2, { isAuthenticated: true })).toBe(true);
  });
});
