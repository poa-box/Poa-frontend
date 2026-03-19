/**
 * AuthContext
 * Unified authentication state for EOA (RainbowKit) and Passkey (ERC-4337) users.
 *
 * Provides:
 * - authType: 'eoa' | 'passkey' | null
 * - accountAddress: The active account address (EOA or smart account)
 * - isAuthenticated: Whether any auth method is active
 * - passkeyState: Credential info for passkey users
 * - connectPasskey(): Reconnect a returning passkey user
 * - activatePasskey(): Save + activate a new passkey credential
 * - disconnectPasskey(): Clear passkey session
 * - publicClient: viem public client (shared)
 * - bundlerClient: Pimlico bundler client (shared)
 */

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { createPublicClient, http, defineChain } from 'viem';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { getBundlerUrl, ENTRY_POINT_ADDRESS } from '../config/passkey';
import { NETWORKS, DEFAULT_NETWORK } from '../config/networks';
import {
  getLastUsedCredential,
  hasStoredCredentials,
  savePasskeyCredential,
} from '../services/web3/passkey/passkeyStorage';
import { discoverPasskeyCredential } from '../services/web3/passkey/passkeyDiscover';

const AuthContext = createContext();

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};

// Build a viem chain object from our network config
const networkConfig = NETWORKS[DEFAULT_NETWORK];
const defaultChain = defineChain({
  id: networkConfig.chainId,
  name: networkConfig.name,
  nativeCurrency: networkConfig.nativeCurrency,
  rpcUrls: {
    default: { http: [networkConfig.rpcUrl] },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: networkConfig.blockExplorer },
  },
});

export const AuthProvider = ({ children }) => {
  const { address: eoaAddress, isConnected: eoaConnected } = useAccount();

  // Passkey state
  const [passkeyState, setPasskeyState] = useState(null);
  const [passkeyConnecting, setPasskeyConnecting] = useState(false);

  // Derived auth type
  const authType = useMemo(() => {
    if (eoaConnected && eoaAddress) return 'eoa';
    if (passkeyState) return 'passkey';
    return null;
  }, [passkeyState, eoaConnected, eoaAddress]);

  // Unified account address
  const accountAddress = useMemo(() => {
    if (authType === 'eoa') return eoaAddress;
    if (authType === 'passkey') return passkeyState.accountAddress;
    return null;
  }, [authType, passkeyState, eoaAddress]);

  const isAuthenticated = authType !== null;

  // Create viem public client (shared, stateless)
  // Uses a standard RPC endpoint for eth_call, eth_getCode, etc.
  // (Pimlico bundler only supports ERC-4337 methods, not standard JSON-RPC.)
  const publicClient = useMemo(() => createPublicClient({
    chain: defaultChain,
    transport: http(networkConfig.rpcUrl),
  }), []);

  // Create Pimlico bundler client
  const bundlerClient = useMemo(() => {
    const bundlerUrl = getBundlerUrl(networkConfig.chainId);
    return createPimlicoClient({
      chain: defaultChain,
      transport: http(bundlerUrl),
      entryPoint: {
        address: ENTRY_POINT_ADDRESS,
        version: '0.7',
      },
    });
  }, []);

  // Auto-reconnect: on mount, check for stored passkey credential
  useEffect(() => {
    if (typeof window === 'undefined') return; // SSR guard
    if (!eoaConnected && hasStoredCredentials()) {
      const lastCred = getLastUsedCredential();
      if (lastCred) {
        setPasskeyState(lastCred);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // If EOA connects, passkey deactivates (EOA takes priority)
  useEffect(() => {
    if (eoaConnected && passkeyState) {
      setPasskeyState(null);
    }
  }, [eoaConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // If EOA disconnects and we have stored passkey, restore it
  useEffect(() => {
    if (!eoaConnected && !passkeyState && typeof window !== 'undefined' && hasStoredCredentials()) {
      const lastCred = getLastUsedCredential();
      if (lastCred) {
        setPasskeyState(lastCred);
      }
    }
  }, [eoaConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Connect a returning passkey user.
   * 1. Try stored credentials from localStorage (instant).
   * 2. If none stored, trigger WebAuthn discoverable auth and look up account from subgraph.
   */
  const connectPasskey = useCallback(async (credential = null) => {
    setPasskeyConnecting(true);
    try {
      // Fast path: use provided credential or localStorage
      const storedCred = credential || getLastUsedCredential();
      if (storedCred) {
        setPasskeyState(storedCred);
        return storedCred;
      }

      // Slow path: WebAuthn discoverable authentication + subgraph lookup
      const discovered = await discoverPasskeyCredential();

      // Save to localStorage for future fast reconnects
      savePasskeyCredential(discovered);
      setPasskeyState(discovered);
      return discovered;
    } finally {
      setPasskeyConnecting(false);
    }
  }, []);

  /**
   * Save and activate a new passkey credential (after onboarding).
   */
  const activatePasskey = useCallback((credentialData) => {
    savePasskeyCredential(credentialData);
    setPasskeyState(credentialData);
  }, []);

  /**
   * Disconnect passkey session (keeps stored credential for re-authentication).
   */
  const disconnectPasskey = useCallback(() => {
    setPasskeyState(null);
  }, []);

  const hasStoredPasskey = typeof window !== 'undefined' ? hasStoredCredentials() : false;

  const value = useMemo(() => ({
    // Auth state
    authType,
    accountAddress,
    isAuthenticated,
    isPasskeyUser: authType === 'passkey',
    isEOAUser: authType === 'eoa',

    // Passkey-specific
    passkeyState,
    passkeyConnecting,
    connectPasskey,
    activatePasskey,
    disconnectPasskey,
    hasStoredPasskey,

    // Shared infrastructure
    publicClient,
    bundlerClient,
  }), [authType, accountAddress, isAuthenticated, passkeyState, passkeyConnecting, connectPasskey, activatePasskey, disconnectPasskey, hasStoredPasskey, publicClient, bundlerClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
