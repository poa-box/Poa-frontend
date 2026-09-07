import { useAccount, useSwitchChain, useWalletRuntimeControl } from '@/context/WalletContext';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/authState';
import { usePOContext } from '@/context/POContext';
import { isNetworkSupported } from '@/config/networks';
import { createScopedRequestGate } from '@/lib/services/scopedRequestGate';

/** Switch only a restored wallet, and never replay an old org's queued intent. */
export function useAutoChainSwitch() {
  const { chainId, address, connector } = useAccount();
  const { isAuthHydrated, isPasskeyUser } = useAuth();
  const { runtimeReady } = useWalletRuntimeControl();
  const { orgChainId, orgId } = usePOContext();
  const { switchChainAsync } = useSwitchChain();
  const lastSwitchedScopeRef = useRef(null);
  const requestGate = useRef(null);
  if (!requestGate.current) requestGate.current = createScopedRequestGate();
  const scope = `${orgId || ''}:${orgChainId || ''}:${address?.toLowerCase() || ''}:${connector?.uid || ''}`;
  const ready = isAuthHydrated === true && runtimeReady && !isPasskeyUser;
  requestGate.current.setScope(ready ? scope : null);

  useEffect(() => {
    if (!ready || !orgId || !orgChainId || !chainId || orgChainId === chainId
      || !isNetworkSupported(orgChainId) || lastSwitchedScopeRef.current === scope) return;
    const isCurrent = requestGate.current.start(scope);
    if (!isCurrent) return;
    const controller = new AbortController();
    switchChainAsync({ chainId: orgChainId }, { signal: controller.signal, isCurrent })
      .then(() => {
        if (!controller.signal.aborted && isCurrent()) lastSwitchedScopeRef.current = scope;
      })
      .catch(() => {
        // Rejection/cancellation leaves the scope retryable on later navigation.
      });
    return () => controller.abort();
  }, [ready, orgId, orgChainId, chainId, scope, switchChainAsync]);
}
