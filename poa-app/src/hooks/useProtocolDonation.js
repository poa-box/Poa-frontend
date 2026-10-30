import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/authState';
import { useAccount, useSwitchChain, useConfig, getConnectorClient, clientToSigner } from '@/context/WalletContext';
import { useNotification } from '@/context/NotificationContext';
import { RefreshEvent, useRefreshEmit } from '@/context/RefreshContext';
import { useOrganizationWriteScope } from '@/lib/organization/useOrganizationWriteScope';

// Scoped notifications share the existing notification store. The generic hook's
// org-default indexing wait is not appropriate for this non-org action.
export function useProtocolDonation(chain, isOpen, onSuccess) {
  const { isAuthenticated, isPasskeyUser, accountAddress, isAuthHydrated, sessionGeneration, isSessionCurrent } = useAuth();
  const { chain: walletChain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const config = useConfig();
  const { addNotification, updateNotification, removeNotification } = useNotification();
  const { emit } = useRefreshEmit();
  const [sendingState, setSendingState] = useState(null);
  const sending = useRef(false);
  const pendingNotice = useRef(null);
  const hub = chain.infrastructure?.paymasterHubProxy;
  const scopeKey = `donate:${isOpen}:${hub}:${chain.source?.endpoint}:${chain.source?.contract}:${sessionGeneration}:${isAuthHydrated}:${isAuthenticated}:${isPasskeyUser}`;
  const capture = useOrganizationWriteScope({
    orgId: scopeKey,
    chainId: chain.chainId, account: accountAddress,
  });
  const renderedScope = capture();
  useEffect(() => () => {
    if (pendingNotice.current && !pendingNotice.current.scope.isCurrent()) {
      removeNotification(pendingNotice.current.id);
      pendingNotice.current = null;
    }
  }, [scopeKey, chain.chainId, accountAddress, removeNotification]);
  const isSending = !!sendingState?.pending && sendingState.scope.isCurrent();
  const canDonate = isOpen && isAuthHydrated !== false && isAuthenticated && !isPasskeyUser && !!accountAddress && !!hub;
  const donate = async amountRaw => {
    const scope = renderedScope;
    const guard = () => {
      scope.assertCurrent();
      if (!canDonate || (isSessionCurrent && !isSessionCurrent())) throw new Error('Your account changed. Please try again.');
    };
    guard();
    if (sending.current) return { success: false };
    sending.current = true;
    setSendingState({ scope, pending: true });
    const pending = addNotification('Sending donation…', 'loading');
    pendingNotice.current = { id: pending, scope };
    try {
      const { createProtocolDonationService } = await import('@/services/web3/domain/ProtocolDonationService');
      guard();
      const service = await createProtocolDonationService({ chainId: chain.chainId, accountAddress, isPasskeyUser,
        source: chain.source, paymasterAddress: hub, guard,
        getSigner: async () => {
          guard();
          if (walletChain?.id !== chain.chainId) await switchChainAsync({ chainId: chain.chainId });
          guard();
          const client = await getConnectorClient(config, { chainId: chain.chainId });
          guard();
          return clientToSigner(client);
        } });
      guard();
      const result = await service.donate(amountRaw);
      guard();
      updateNotification(pending, result.success ? 'Donation received. Thank you!' : result.error?.userMessage || 'Donation could not be completed. Please try again.', result.success ? 'success' : 'error');
      pendingNotice.current = null;
      if (result.success) {
        emit(RefreshEvent.SOLIDARITY_DONATED, { chainId: chain.chainId, endpoint: chain.source.endpoint,
          paymasterAddress: hub, address: accountAddress, transactionHash: result.txHash, blockNumber: result.blockNumber });
        onSuccess?.(result);
      }
      return result;
    } catch (error) {
      if (scope.isCurrent()) {
        updateNotification(pending, error?.userMessage || 'Donation could not be completed. Please try again.', 'error');
        pendingNotice.current = null;
      }
      return { success: false, error };
    } finally {
      sending.current = false;
      if (!scope.isCurrent() && pendingNotice.current?.id === pending) {
        removeNotification(pending);
        pendingNotice.current = null;
      }
      if (scope.isCurrent()) setSendingState({ scope, pending: false });
    }
  };
  return { donate, canDonate, isSending };
}
