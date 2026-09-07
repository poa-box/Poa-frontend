import React, { createContext, useContext, useMemo } from 'react';
import { useWalletRuntimeControl } from '@/context/WalletContext';

// Heavy AuthProvider lives only in the wallet island; readers share this facade.
export const AuthContext = createContext();
const pendingAuth = {
  authType: null, accountAddress: null, isAuthenticated: false, isAuthHydrated: false,
  isPasskeyUser: false, isEOAUser: false, passkeyState: null, passkeyConnecting: false,
  hasStoredPasskey: false, publicClient: null, bundlerClient: null,
};
const authIdentity = (auth) => `${auth?.accountAddress || ''}:${auth?.authType || ''}`;
export function AuthFacadeProvider({ children }) {
  const wallet = useWalletRuntimeControl();
  const auth = wallet.snapshot?.auth;
  const { current, ensureRuntime, accountHint, clearAccountHint, allowAccountHint } = wallet;
  const value = useMemo(() => {
    const captured = authIdentity(auth);
    const actions = {};
    for (const name of ['connectPasskey', 'activatePasskey', 'disconnectPasskey', 'signOut', 'forgetPasskey']) {
      actions[name] = (...args) => {
        const invoke = (snapshot) => {
          if (auth && captured !== authIdentity(snapshot?.auth)) throw new Error('Your account changed. Please try again.');
          const action = snapshot?.auth?.[name];
          if (!action) throw new Error('Account tools are still loading. Please try again.');
          if (['signOut', 'forgetPasskey', 'disconnectPasskey'].includes(name)) clearAccountHint();
          if (['connectPasskey', 'activatePasskey'].includes(name)) allowAccountHint();
          return action(...args);
        };
        // Preserve synchronous state changes for ready sign-out/activation callers.
        if (current.current) return invoke(current.current);
        return ensureRuntime().then(invoke);
      };
    }
    return { ...(auth || pendingAuth), accountHint, ...actions };
  }, [auth, current, ensureRuntime, accountHint, clearAccountHint, allowAccountHint]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
