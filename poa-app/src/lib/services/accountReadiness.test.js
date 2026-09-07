import { describe, expect, it } from 'vitest';
import { shouldWaitForAccount } from '@/lib/services/accountReadiness';

describe('account-dependent deep-link readiness', () => {
  it('retains intent before a restored identity is published', () => {
    expect(shouldWaitForAccount({ isAuthHydrated: false, isAuthenticated: false, userDataLoading: false })).toBe(true);
  });
  it('continues waiting for a restored member permission query', () => {
    expect(shouldWaitForAccount({ isAuthHydrated: true, isAuthenticated: true, userDataLoading: true })).toBe(true);
  });
  it('lets confirmed visitors receive the normal denial even if skipped user loading remains true', () => {
    expect(shouldWaitForAccount({ isAuthHydrated: true, isAuthenticated: false, userDataLoading: true })).toBe(false);
  });
  it('permits ready members without weakening the downstream permission decision', () => {
    expect(shouldWaitForAccount({ isAuthHydrated: true, isAuthenticated: true, userDataLoading: false })).toBe(false);
  });
});
