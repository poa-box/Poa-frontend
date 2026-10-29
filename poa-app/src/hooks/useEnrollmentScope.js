import { useEffect, useMemo, useRef } from 'react';
import { createScopeGuard } from '@/lib/services/runtimeScope';

/** Includes source and resolved session; saved callbacks cannot cross either boundary. */
export function useEnrollmentScope(auth, source) {
  const identity = JSON.stringify([source, auth.accountAddress?.toLowerCase() || null, auth.authType || null,
    auth.isAuthenticated, auth.isAuthHydrated, auth.sessionGeneration]);
  const scope = useMemo(() => ({ identity }), [identity]);
  const current = useRef(scope);
  const mounted = useRef(true);
  current.current = scope;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const { isAuthHydrated, isSessionCurrent } = auth;
  const guard = useMemo(() => {
    const check = createScopeGuard(scope, () => mounted.current ? current.current : null);
    return () => {
      check();
      if (isAuthHydrated === false || isSessionCurrent?.() === false) throw new Error('Your account is still loading or has changed. Please try again.');
    };
  }, [scope, isAuthHydrated, isSessionCurrent]);
  return { guard, scope };
}

export const enrollmentInitiator = auth => ({ account: auth.accountAddress?.toLowerCase() || null, authType: auth.authType || null });
