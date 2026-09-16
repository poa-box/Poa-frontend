import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { createWalletRuntimeGate, walletIdentity as identity, assertWalletIdentity, throwIfAborted as aborted } from '@/lib/wallet/runtimeGate';

import { readAccountHint, hintFromVerifiedAuth, persistAccountHint, removeAccountHint, suppressHintAfterClear } from '@/lib/wallet/accountHint';

const WalletContext = createContext(null);
const clientSigners = new WeakMap();
const pendingAccount = Object.freeze({ address: undefined, addresses: undefined, chain: undefined, chainId: undefined, connector: undefined, isConnected: false, isConnecting: false, isReconnecting: true, isDisconnected: false, status: 'reconnecting' });
function unavailable() { return new Error('Account tools are still loading. Please try again.'); }

/** Stable ownership for public readers; heavy wallet providers are a sibling island. */
export function WalletFacadeProvider({ children, onRequestRuntime }) {
  const [snapshot, setSnapshot] = useState(null);
  const [accountHint, setAccountHint] = useState(null);
  const current = useRef(null);
  const hintRef = useRef(null);
  const hintSuppressed = useRef(false);
  const hintBrowser = () => typeof window === 'undefined' ? null : window;
  const clearAccountHint = useCallback(({ completedDisconnect = false } = {}) => {
    hintSuppressed.current = suppressHintAfterClear(current.current?.auth, completedDisconnect);
    hintRef.current = null;
    setAccountHint(null);
    removeAccountHint(typeof window === 'undefined' ? null : window);
  }, []);
  const allowAccountHint = useCallback(() => { hintSuppressed.current = false; }, []);
  const [runtimeError, setRuntimeError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [signerSubscribers, setSignerSubscribers] = useState(0);
  const [signerSnapshot, setSignerSnapshot] = useState(null);
  const requestRef = useRef(onRequestRuntime);
  requestRef.current = onRequestRuntime;
  const gateRef = useRef(null);
  if (!gateRef.current) gateRef.current = createWalletRuntimeGate({ readCurrent: () => current.current?.auth?.isAuthHydrated ? current.current : null, request: () => requestRef.current?.() });
  const publish = useCallback((next) => {
    current.current = next;
    setSnapshot(next);
    if (next?.auth?.isAuthHydrated === true) {
      const auth = next.auth;
      if (!auth.isAuthenticated) {
        hintRef.current = null;
        setAccountHint(null);
        removeAccountHint(typeof window === 'undefined' ? null : window);
        hintSuppressed.current = false;
      } else if (!hintSuppressed.current) {
        const hint = hintFromVerifiedAuth(auth);
        if (hint && (hint.address !== hintRef.current?.address || hint.authType !== hintRef.current?.authType)) {
          hintRef.current = hint;
          setAccountHint(hint);
          persistAccountHint(typeof window === 'undefined' ? null : window, hint);
        }
      }
    }
    if (next) {
      setRuntimeError(null);
      if (next.auth?.isAuthHydrated) gateRef.current.publish(next);
    }
  }, []);
  const reportRuntimeError = useCallback((error) => {
    current.current = null;
    setSnapshot(null);
    setRuntimeError(error);
    gateRef.current.fail(error);
  }, []);
  const ensureRuntime = useCallback((options) => gateRef.current.wait(options), []);
  const retryRuntime = useCallback(() => { gateRef.current.reset(); setRuntimeError(null); setAttempt((n) => n + 1); requestRef.current?.(); }, []);
  const subscribeSigner = useCallback(() => {
    setSignerSubscribers((n) => n + 1);
    return () => setSignerSubscribers((n) => n - 1);
  }, []);
  useEffect(() => {
    // Do not re-seed storage over a snapshot already settled by the island.
    if (!current.current?.auth?.isAuthHydrated && !hintSuppressed.current) {
      const hint = readAccountHint(hintBrowser());
      hintRef.current = hint;
      setAccountHint(hint);
    }
    gateRef.current.reset();
    return () => { current.current = null; gateRef.current.fail(unavailable()); };
  }, []);
  const value = useMemo(() => ({ snapshot, accountHint, clearAccountHint, allowAccountHint, current, publish, ensureRuntime, retryRuntime, preloadRuntime: ensureRuntime,
    reportRuntimeError, runtimeError, attempt, signerSubscribers, subscribeSigner, signerSnapshot, publishSigner: setSignerSnapshot,
    runtimeReady: !!snapshot?.auth?.isAuthHydrated, runtimeStatus: runtimeError ? 'error' : snapshot?.auth?.isAuthHydrated ? 'ready' : 'loading',
  }), [snapshot, accountHint, clearAccountHint, allowAccountHint, publish, ensureRuntime, retryRuntime, reportRuntimeError, runtimeError, attempt, signerSubscribers, subscribeSigner, signerSnapshot]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
export function useWalletRuntimeControl() {
  const value = useContext(WalletContext);
  if (!value) throw new Error('Wallet controls require WalletFacadeProvider');
  return value;
}
function useAction(name, { scoped = false } = {}) {
  const wallet = useWalletRuntimeControl();
  const captured = identity(wallet.snapshot);
  const { ensureRuntime, current } = wallet;
  return useCallback(async (args, { signal, isCurrent } = {}) => {
    const next = await ensureRuntime({ signal });
    aborted(signal);
    if (isCurrent && !isCurrent()) throw new DOMException('The request was cancelled.', 'AbortError');
    if (scoped) assertWalletIdentity(captured, current.current);
    const action = next.actions?.[name];
    if (!action) throw unavailable();
    return action(args);
  }, [ensureRuntime, current, captured, name, scoped]);
}
export function useAccount() { return useWalletRuntimeControl().snapshot?.account || pendingAccount; }
export function useConnections() { return useWalletRuntimeControl().snapshot?.connections || []; }
export function useWalletClient() {
  const wallet = useWalletRuntimeControl();
  return wallet.snapshot?.walletClient || { data: undefined, isLoading: !wallet.runtimeError, isPending: true, error: wallet.runtimeError };
}
export function useSwitchChain() {
  const wallet = useWalletRuntimeControl();
  const switchChainAsync = useAction('switchChainAsync', { scoped: true });
  return { chains: wallet.snapshot?.chains || [], switchChainAsync, switchChain: (args, options) => { switchChainAsync(args).then(options?.onSuccess).catch(options?.onError || (() => {})); }, isPending: !!wallet.snapshot?.switchPending, error: wallet.snapshot?.switchError };
}
export function useDisconnect() {
  const { snapshot, current, ensureRuntime, clearAccountHint } = useWalletRuntimeControl();
  const captured = identity(snapshot);
  const connections = snapshot?.connections;
  const disconnectAsync = useCallback(async (args) => {
    const next = await ensureRuntime();
    if (args?.connector) {
      // A unified sign-out removes every captured connector. Promotion after
      // the first removal must not invalidate the remaining explicit removals.
      const uid = args.connector.uid;
      if (!connections?.some((connection) => connection.connector.uid === uid)) throw new Error('Your account changed. Please try again.');
      if (!current.current?.connections?.some((connection) => connection.connector.uid === uid)) return;
    } else assertWalletIdentity(captured, current.current);
    const result = await next.actions.disconnectAsync(args);
    clearAccountHint({ completedDisconnect: true });
    return result;
  }, [ensureRuntime, current, captured, connections, clearAccountHint]);
  const disconnect = useCallback((args, options) => { disconnectAsync(args).then(options?.onSuccess).catch(options?.onError || (() => {})); }, [disconnectAsync]);
  return { disconnectAsync, disconnect };
}
export function useConfig() {
  const wallet = useWalletRuntimeControl();
  const { ensureRuntime, current } = wallet;
  const captured = identity(wallet.snapshot);
  return useMemo(() => ({ getConnectorClient: async (options) => {
    const next = await ensureRuntime();
    assertWalletIdentity(captured, current.current);
    const result = await next.actions.getConnectorClient(options);
    assertWalletIdentity(captured, current.current);
    clientSigners.set(result.client, result.signer);
    return result.client;
  } }), [ensureRuntime, current, captured]);
}
export function getConnectorClient(config, options) { return config.getConnectorClient(options); }
export function clientToSigner(client) {
  if (!client) return undefined;
  if (!clientSigners.has(client)) throw new Error('Refresh your account connection before continuing.');
  return clientSigners.get(client);
}
export function useEthersSigner() {
  const wallet = useWalletRuntimeControl();
  const { subscribeSigner } = wallet;
  useEffect(() => subscribeSigner(), [subscribeSigner]);
  return wallet.signerSnapshot?.identity === `${identity(wallet.snapshot)}:${wallet.snapshot?.account?.chainId || ''}` ? wallet.signerSnapshot.signer : undefined;
}
export function useWalletUI() {
  const wallet = useWalletRuntimeControl();
  const { ensureRuntime } = wallet;
  const open = useCallback((name) => async ({ signal } = {}) => {
    const next = await ensureRuntime({ signal });
    aborted(signal);
    if (!next.actions?.[name]) throw unavailable();
    next.actions[name]();
  }, [ensureRuntime]);
  const actions = useMemo(() => ({ openConnectModal: open('openConnectModal'), openAccountModal: open('openAccountModal'), openChainModal: open('openChainModal') }), [open]);
  return { ...wallet, ...actions, account: wallet.snapshot?.ui?.account, chain: wallet.snapshot?.ui?.chain,
    mounted: !!wallet.snapshot?.ui?.mounted };
}
export function useConnectModal() { const { openConnectModal } = useWalletUI(); return { openConnectModal }; }
export function useChainModal() { const { openChainModal } = useWalletUI(); return { openChainModal }; }
export function useAccountModal() { const { openAccountModal } = useWalletUI(); return { openAccountModal }; }
export { identity as walletIdentity };
