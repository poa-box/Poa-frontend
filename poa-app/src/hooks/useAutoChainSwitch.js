import { useEffect, useRef, useCallback } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';
import { usePOContext } from '../context/POContext';
import { isNetworkSupported } from '../config/networks';

/**
 * Automatically switches the wallet to the org's chain when navigating to an org.
 * Only triggers once per org load (not on every render).
 * If the user rejects, navigating away and back will retry.
 */
export function useAutoChainSwitch() {
  const { chainId } = useAccount();
  const { orgChainId, orgId } = usePOContext();
  const { switchChainAsync } = useSwitchChain();
  const lastSwitchedOrgRef = useRef(null);

  const attemptSwitch = useCallback(async () => {
    if (
      orgChainId &&
      chainId &&
      orgChainId !== chainId &&
      isNetworkSupported(orgChainId) &&
      lastSwitchedOrgRef.current !== orgId
    ) {
      try {
        await switchChainAsync?.({ chainId: orgChainId });
        lastSwitchedOrgRef.current = orgId;
      } catch {
        // User rejected the wallet prompt — leave ref unset so retry is possible
      }
    }
  }, [orgChainId, chainId, orgId, switchChainAsync]);

  useEffect(() => {
    attemptSwitch();
  }, [attemptSwitch]);
}
