import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ConnectButton, useConnectModal, useAccountModal, useChainModal } from '@rainbow-me/rainbowkit';
import { useAccount, useConnections, useDisconnect, useSwitchChain, useWalletClient, useConfig } from 'wagmi';
import { getConnectorClient } from 'wagmi/actions';
import { useAuth } from '@/context/authState';
import { useWalletRuntimeControl, walletIdentity } from '@/context/WalletContext';
import { createRuntimeLoader } from '@/lib/services/runtimeLoader';

const loadSigner = createRuntimeLoader(() => import('@/components/providers/WalletSignerRuntime'));
function PublishWallet({ state, ui, publish }) {
  const snapshot = useMemo(() => ({ ...state, ui: { account: ui.account ? { address: ui.account.address, displayName: ui.account.displayName, displayBalance: ui.account.displayBalance, ensName: ui.account.ensName, ensAvatar: ui.account.ensAvatar, hasPendingTransactions: ui.account.hasPendingTransactions } : undefined, chain: ui.chain ? { id: ui.chain.id, name: ui.chain.name, unsupported: ui.chain.unsupported, hasIcon: ui.chain.hasIcon, iconUrl: ui.chain.iconUrl, iconBackground: ui.chain.iconBackground } : undefined, mounted: ui.mounted },
    actions: state.actions,
  // Rainbow constructs new account/chain objects on every render; depend on displayed fields.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [state, ui.account?.address, ui.account?.displayName, ui.account?.displayBalance, ui.account?.ensName, ui.account?.ensAvatar, ui.account?.hasPendingTransactions, ui.chain?.id, ui.chain?.name, ui.chain?.unsupported, ui.chain?.hasIcon, ui.chain?.iconUrl, ui.chain?.iconBackground, ui.mounted]);
  useLayoutEffect(() => { if (snapshot.ui.mounted) publish(snapshot); }, [snapshot, publish]);
  return null;
}
export default function WalletRuntimeBridge() {
  const control = useWalletRuntimeControl();
  const { reportRuntimeError } = control;
  const auth = useAuth();
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const { openChainModal } = useChainModal();
  const account = useAccount();
  const connections = useConnections();
  const disconnect = useDisconnect();
  const switching = useSwitchChain();
  const walletClient = useWalletClient();
  const config = useConfig();
  const [Signer, setSigner] = useState(null);
  const connectorClient = useCallback(async (options) => {
    const client = await getConnectorClient(config, options);
    const { clientToSigner } = await import('@/components/ProviderConverter');
    return { client, signer: clientToSigner(client) };
  }, [config]);
  const state = useMemo(() => ({ auth, account, connections, walletClient: { data: walletClient.data, isLoading: walletClient.isLoading, isPending: walletClient.isPending, error: walletClient.error },
    chains: switching.chains, switchPending: switching.isPending, switchError: switching.error,
    actions: { openConnectModal, openAccountModal, openChainModal, disconnectAsync: disconnect.disconnectAsync, switchChainAsync: switching.switchChainAsync, getConnectorClient: connectorClient },
  }), [auth, account, connections, walletClient.data, walletClient.isLoading, walletClient.isPending, walletClient.error, switching.chains, switching.isPending, switching.error, switching.switchChainAsync, disconnect.disconnectAsync, connectorClient, openConnectModal, openAccountModal, openChainModal]);
  useEffect(() => {
    if (!control.signerSubscribers) return;
    let cancelled = false;
    loadSigner().then((module) => { if (!cancelled) setSigner(() => module.default); }).catch((error) => { if (!cancelled) reportRuntimeError(error); });
    return () => { cancelled = true; };
  }, [control.signerSubscribers, control.attempt, reportRuntimeError]);
  const { publish } = control;
  useLayoutEffect(() => () => publish(null), [publish]);
  return <>
    <ConnectButton.Custom>{(ui) => <PublishWallet state={state} ui={ui} publish={control.publish} />}</ConnectButton.Custom>
    {Signer && control.signerSubscribers > 0 && <Signer identity={`${walletIdentity(state)}:${account.chainId || ''}`} publish={control.publishSigner} />}
  </>;
}
