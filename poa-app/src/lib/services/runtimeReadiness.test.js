import { describe, expect, it } from 'vitest';
import { selectRuntimeSnapshot, serviceReadyState } from './runtimeReadiness';

describe('deferred service readiness', () => {
  it('never labels session restoration or an authenticated account as signed out during load', () => {
    expect(serviceReadyState(null, { isAuthHydrated: false })).toBe('initializing');
    expect(serviceReadyState(null, { isAuthHydrated: true, isAuthenticated: true })).toBe('initializing');
    expect(serviceReadyState(null, { isAuthHydrated: true, passkeyConnecting: true })).toBe('initializing');
    expect(serviceReadyState(null, { isAuthHydrated: true })).toBe('signed-out');
  });
  it('masks previous scope services and failed runtime snapshots synchronously', () => {
    const snapshot = { scope: 'previous', services: { readyState: 'ready' } };
    expect(selectRuntimeSnapshot(snapshot, 'current', null)).toBeNull();
    expect(selectRuntimeSnapshot(snapshot, 'previous', new Error('render failed'))).toBeNull();
    expect(selectRuntimeSnapshot(snapshot, 'previous', null)).toBe(snapshot.services);
    expect(serviceReadyState(null, { isAuthenticated: true })).toBe('initializing');
  });
  it('preserves runtime readiness and gives hydration precedence', () => {
    expect(serviceReadyState({ readyState: 'ready' }, { isAuthHydrated: true })).toBe('ready');
    expect(serviceReadyState({ readyState: 'initializing' }, { isAuthenticated: true })).toBe('initializing');
    expect(serviceReadyState({ readyState: 'ready' }, { isAuthHydrated: false })).toBe('initializing');
  });
});
