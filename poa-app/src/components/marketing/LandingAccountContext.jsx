import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/router';

const LandingAccountContext = createContext(null);

export function LandingAccountProvider({ children }) {
  const { pathname } = useRouter();
  const [accountNav, setAccountNav] = useState(null);
  const [isSignInOpen, setIsSignInOpen] = useState(false);

  // Reset on navigation, not effect cleanup: Strict Mode replays mount effects
  // and must not cancel a sign-in request queued while account code is loading.
  useEffect(() => {
    if (pathname !== '/') {
      setAccountNav(null);
      setIsSignInOpen(false);
    }
  }, [pathname]);

  return (
    <LandingAccountContext.Provider value={{ accountNav, setAccountNav, isSignInOpen, setIsSignInOpen }}>
      {children}
    </LandingAccountContext.Provider>
  );
}

export const useLandingAccount = () => useContext(LandingAccountContext);

// On the public landing, let the document's images/fonts finish before loading
// account services in idle time. A sign-in click or application route starts
// them immediately. Once mounted, keep the same providers across navigation.
export function useLandingCoreReady(isLanding) {
  const [ready, setReady] = useState(false);
  const { isSignInOpen } = useLandingAccount();

  useEffect(() => {
    if (ready) return;
    if (!isLanding || isSignInOpen) {
      setReady(true);
      return;
    }

    let idleId;
    let timerId;
    const schedule = () => {
      if (window.requestIdleCallback) {
        idleId = window.requestIdleCallback(() => setReady(true), { timeout: 1000 });
      } else {
        timerId = window.setTimeout(() => setReady(true), 0);
      }
    };

    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });

    return () => {
      window.removeEventListener('load', schedule);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }, [ready, isLanding, isSignInOpen]);

  return ready;
}
