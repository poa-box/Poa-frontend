/**
 * Force-connects the burner EOA on mount when E2E_ENABLED.
 *
 * Skipped when `NEXT_PUBLIC_E2E_AS=passkey` so the agent runs the
 * passkey/vouch-first flow without the EOA stealing focus via auth precedence.
 */
import { useEffect } from 'react';
import { useAccount, useConnect, useConnectors } from 'wagmi';
import { E2E_ENABLED, E2E_AS } from './e2eMode';

export default function E2EAutoConnect() {
  const { isConnected, isConnecting } = useAccount();
  const { connect } = useConnect();
  const connectors = useConnectors();

  useEffect(() => {
    if (!E2E_ENABLED) return;
    if (E2E_AS === 'passkey') return;
    if (isConnected || isConnecting) return;
    const burner = connectors.find((c) => c.id === 'mock');
    if (burner) connect({ connector: burner });
  }, [isConnected, isConnecting, connectors, connect]);

  return null;
}
