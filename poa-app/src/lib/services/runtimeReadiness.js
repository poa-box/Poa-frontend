import { ReadyState } from '@/util/readiness';

export function selectRuntimeSnapshot(snapshot, scope, error) {
  return !error && snapshot?.scope === scope ? snapshot.services : null;
}

export function serviceReadyState(services, { isAuthHydrated, isAuthenticated, passkeyConnecting }) {
  if (isAuthHydrated === false) return ReadyState.INITIALIZING;
  if (services) return services.readyState;
  return isAuthenticated || passkeyConnecting ? ReadyState.INITIALIZING : ReadyState.SIGNED_OUT;
}
