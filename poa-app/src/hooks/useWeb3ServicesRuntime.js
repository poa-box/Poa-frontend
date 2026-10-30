/**
 * useWeb3Services - Hook to access Web3 service layer
 * Provides a unified interface to all Web3 services with proper initialization.
 * Supports both EOA (RainbowKit/wagmi) and Passkey (ERC-4337) auth types.
 */

import { keccak256 } from '@ethersproject/keccak256';
import { toUtf8Bytes } from '@ethersproject/strings';
import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { createAccountHost } from '@/services/web3/core/accountHost';
import { resolveAccountWriteSource } from '@/services/web3/core/accountWriteSource';
import { executeUsernameUpdate } from '@/services/web3/core/accountActions';
import { guardService } from '@/lib/services/runtimeScope';
import { selectServiceOptions } from '@/lib/services/serviceOptions';
import { useQuery } from '@apollo/client';
import { getClient, useSubgraphClient } from '@/util/apolloClient';
import { resolveAccountDeployment, restoreCredentialKeys } from '@/services/web3/passkey/accountReadiness';
import { savePasskeyCredential } from '@/services/web3/passkey/passkeyStorage';
import { useEthersSigner, useEthersProvider, clientToSigner } from '@/components/ProviderConverter';
import { useWalletClient, useSwitchChain, useConfig } from 'wagmi';
import { getWalletClient, getAccount } from 'wagmi/actions';
import { useAuth } from '@/context/authState';
import { useIPFScontext } from '../context/ipfsContext';
import { ReadyState, getNotReadyMessage as buildNotReadyMessage } from '@/util/readiness';
import { usePOContext } from '../context/POContext';
import { useUserContext } from '../context/UserContext';
import { INFRASTRUCTURE_CONTRACTS, getInfrastructureAddress } from '../config/contracts';
import { DEFAULT_NETWORK, DEFAULT_CHAIN_ID, NETWORKS } from '../config/networks';
import { FETCH_INFRASTRUCTURE_ADDRESSES } from '../util/queries';
import { FETCH_PAYMASTER_ORG_CONFIG, FETCH_PASSKEY_FACTORY_ADDRESS } from '../util/passkeyQueries';
import { createChainClients } from '../services/web3/utils/chainClients';


// Core services
import { ContractFactory, createContractFactory } from '../services/web3/core/ContractFactory';
import { TransactionManager, createTransactionManager } from '../services/web3/core/TransactionManager';
import { createEnsureOrgChain } from '../services/web3/core/ensureOrgChain';
import { createSmartAccountTransactionManager } from '../services/web3/core/SmartAccountTransactionManager';
import { createEOA7702TransactionManager } from '../services/web3/eip7702/EOA7702TransactionManager';
import { checkWallet7702Support } from '../services/web3/eip7702/authorizationBuilder';
import { EOA_DELEGATION_ADDRESS } from '../config/contracts';

// Domain services
import { UserService, createUserService } from '../services/web3/domain/UserService';
import { OrganizationService, createOrganizationService } from '../services/web3/domain/OrganizationService';
import { VotingService, VotingType, createVotingService } from '../services/web3/domain/VotingService';
import { TaskService, createTaskService } from '../services/web3/domain/TaskService';
import { EducationService, createEducationService } from '../services/web3/domain/EducationService';
import { createMembershipAuthorityService } from '../services/web3/domain/MembershipAuthorityService';
import { ZkEmailInvitesService, createZkEmailInvitesService } from '../services/web3/domain/ZkEmailInvitesService';
import { TokenRequestService, createTokenRequestService } from '../services/web3/domain/TokenRequestService';
import { TreasuryService, createTreasuryService } from '../services/web3/domain/TreasuryService';
import { RoleCreationService } from '@/services/web3/domain/RoleCreationService';

/**
 * Hook to access all Web3 services
 * @param {Object} [options={}] - Configuration options
 * @param {Object} [options.ipfsService] - IPFS service instance for content storage (falls back to context)
 * @param {string} [options.network] - Network name (defaults to DEFAULT_NETWORK)
 * @returns {Object} Object containing all services and utilities
 */
export function useWeb3ServicesRuntime({ guard: scopeGuard }) {

  // Org context first — the EOA signer + tx path must target the org's chain.
  // Accounts live on the Arbitrum home chain, while org writes and authority
  // reads must follow the organization (for example, Decentral Park on Gnosis).
  const poContext = usePOContext();
  const orgId = poContext?.orgId || null;
  const subgraphUrl = poContext?.subgraphUrl || null;
  const orgChainId = poContext?.orgChainId || null;
  // EOA signer. In E2E the burner has no chain-switch UI, so bind it directly to
  // the org chain's RPC (so it broadcasts to the right network). In production
  // keep the wallet's current chain here and switch + rebind at tx time via
  // `ensureOrgChain` below — binding to a chain the wallet isn't on yet would make
  // useConnectorClient return undefined and stall readiness.
  const signer = useEthersSigner(process.env.NEXT_PUBLIC_E2E_MODE === 'true' && orgChainId ? { chainId: orgChainId } : undefined);
  // Pass DEFAULT_CHAIN_ID so wagmi returns a client even without a wallet connection.
  // Without this, passkey-only users get no provider (useClient() returns undefined
  // when no wallet is connected and no chainId is specified).
  const provider = useEthersProvider({ chainId: DEFAULT_CHAIN_ID });
  const orgReadProvider = useEthersProvider({ chainId: orgChainId || DEFAULT_CHAIN_ID });
  const { accountAddress, authType, isSessionCurrent, sessionGeneration, isPasskeyUser, isAuthenticated, isAuthHydrated, passkeyConnecting, passkeyState, publicClient, bundlerClient } = useAuth();
  const guard = useCallback(() => {
    scopeGuard();
    if (isAuthHydrated === false) throw new Error('Your account is still loading. Please try again.');
    if (isSessionCurrent && !isSessionCurrent()) throw new Error('Your account changed. Please try again.');
  }, [scopeGuard, isSessionCurrent, isAuthHydrated]);
  const { switchChainAsync } = useSwitchChain();
  const wagmiConfig = useConfig();

  // Get IPFS service from context if not provided
  const ipfsContext = useIPFScontext();
  const ipfsService = ipfsContext;

  // Create chain-specific clients when org is on a different chain than home chain
  const isCrossChain = orgChainId && orgChainId !== DEFAULT_CHAIN_ID;
  const { effectivePublicClient, effectiveBundlerClient, effectiveChainId } = useMemo(() => {
    if (!isCrossChain) {
      return { effectivePublicClient: publicClient, effectiveBundlerClient: bundlerClient, effectiveChainId: DEFAULT_CHAIN_ID };
    }
    const clients = createChainClients(orgChainId);
    if (!clients) {
      return { effectivePublicClient: null, effectiveBundlerClient: null, effectiveChainId: orgChainId };
    }
    return { effectivePublicClient: clients.publicClient, effectiveBundlerClient: clients.bundlerClient, effectiveChainId: orgChainId };
  }, [isCrossChain, orgChainId, publicClient, bundlerClient]);

  // Get user's hat IDs for hat-scoped paymaster budget
  // useUserContext returns undefined outside UserProvider (safe with optional chaining)
  const userContext = useUserContext();
  const hatIds = userContext?.userData?.hatIds || null;

  // Per-chain client prevents cache poisoning: each endpoint has its own
  // InMemoryCache, so infrastructure addresses from one chain can't leak into
  // another chain's queries.
  const orgClient = useSubgraphClient(subgraphUrl);

  // Fetch infrastructure addresses from subgraph — routed to org's chain.
  // Skip until subgraphUrl is resolved by POContext to avoid querying the default
  // (Arbitrum) subgraph and getting wrong-chain addresses.
  const { data: infraData } = useQuery(FETCH_INFRASTRUCTURE_ADDRESSES, {
    client: orgClient,
    skip: !subgraphUrl,
  });
  const registryAddress = infraData?.universalAccountRegistries?.[0]?.id || null;
  const paymasterHubAddress = infraData?.poaManagerContracts?.[0]?.paymasterHubProxy || null;

  // For passkey cross-chain: fetch factory address from org chain to compute initCode
  const { data: factoryData } = useQuery(FETCH_PASSKEY_FACTORY_ADDRESS, {
    skip: !isPasskeyUser || !subgraphUrl,
    client: orgClient,
  });
  const orgFactoryAddress = factoryData?.passkeyAccountFactories?.[0]?.id || null;

  // Deployment readiness is positive evidence, never a settled failed promise.
  const [deployment, setDeployment] = useState(null);
  const initCodeScope = JSON.stringify([effectiveChainId, subgraphUrl, orgFactoryAddress, passkeyState]);
  const initCodeReady = !isPasskeyUser || deployment?.scope === initCodeScope;
  const crossChainInitCode = initCodeReady ? deployment?.initCode || '0x' : '0x';
  const needsCrossChainInit = isPasskeyUser;

  useEffect(() => {
    if (!isPasskeyUser || !passkeyState || !effectivePublicClient) return;
    let cancelled = false;
    const assertCurrent = () => {
      guard();
      if (cancelled) throw new Error('Your account changed. Please try again.');
    };
    async function resolve() {
      // Legacy discovery can omit unindexed keys. Recover only from its observed source.
      let credential = passkeyState;
      if (!credential.publicKeyX || !credential.publicKeyY) {
        credential = await restoreCredentialKeys(credential, {
          clientForChain: chainId => createChainClients(chainId)?.publicClient, guard: assertCurrent,
        });
        assertCurrent();
        savePasskeyCredential(credential);
      }
      const ready = await resolveAccountDeployment({ credential, factoryAddress: orgFactoryAddress,
        publicClient: effectivePublicClient, chainId: effectiveChainId, guard: assertCurrent });
      assertCurrent();
      setDeployment({ ...ready, scope: initCodeScope });
    }
    resolve().catch(() => { /* Unknown source/factory stays unresolved; no unsafe fallback. */ });
    return () => { cancelled = true; };
  }, [isPasskeyUser, passkeyState, effectivePublicClient, effectiveChainId, orgFactoryAddress, initCodeScope, guard]);

  // Check if this org has gas sponsorship enabled (subgraph lookup, no RPC)
  const { data: pmConfig } = useQuery(FETCH_PAYMASTER_ORG_CONFIG, {
    variables: { orgId },
    skip: !orgId,
    fetchPolicy: 'cache-first',
    client: orgClient,
  });
  const orgPaymaster = pmConfig?.paymasterOrgConfigs?.[0];
  // Entity existence = registered. Only pass paymaster address when not paused.
  const paymasterAddress = (orgPaymaster && !orgPaymaster.isPaused)
    ? paymasterHubAddress
    : null;

  // Create core services — auth-type-aware
  const rawFactory = useMemo(() => {
    if (isPasskeyUser) {
      // Passkey: factory is used for ABI encoding only (SmartAccountTransactionManager
      // handles execution). Provider is optional — contracts work for encoding without one.
      return createContractFactory(null, provider || undefined);
    }
    // EOA: create factory with signer
    if (!signer) return null;
    return createContractFactory(signer);
  }, [signer, provider, isPasskeyUser]);

  const factory = useMemo(() => guardService(rawFactory, guard), [rawFactory, guard]);

  // Keep writable contracts on the auth-aware factory above, but bind authority preflights to
  // the org's provider. Without this split a Gnosis org queried through a passkey would run
  // canRemove against Arbitrum, fail closed, and make every valid removal proposal impossible.
  const authorityReadFactory = useMemo(
    () => (orgReadProvider ? createContractFactory(null, orgReadProvider) : factory),
    [orgReadProvider, factory]
  );

  // EIP-7702 capability detection for EOA users
  const { data: walletClient } = useWalletClient();
  const [eoa7702Support, setEoa7702Support] = useState(null);
  const eoa7702DisabledRef = useRef(false); // Disabled for session if runtime fails
  const eoa7702Capable = eoa7702Support?.client === walletClient
    && eoa7702Support?.supported && !!walletClient?.account?.address;
  useEffect(() => {
    let cancelled = false;
    if (isPasskeyUser || !walletClient?.account?.address || eoa7702DisabledRef.current) {
      setEoa7702Support(null);
      return;
    }
    checkWallet7702Support(walletClient)
      .then((supported) => {
        if (!cancelled) setEoa7702Support({ client: walletClient, supported });
      })
      .catch(() => {
        if (!cancelled) setEoa7702Support({ client: walletClient, supported: false });
      });
    return () => { cancelled = true; };
  }, [walletClient, isPasskeyUser]);

  // Org-chain guard shared by BOTH EOA write paths — the direct TransactionManager
  // AND the EIP-7702 EOA7702TransactionManager. Ensures the wallet is on the org
  // chain and hands back a signer + walletClient freshly bound to it, so the direct
  // tx broadcasts to the right network AND the 7702 authorization is signed with the
  // org chain's id. Mirrors the switch-then-reacquire-client pattern already used
  // by useProfileUpdate / CashOutModal, but extracted to a pure, dependency-injected
  // factory (ensureOrgChain.js) so its fail-closed behavior is unit tested without
  // React (ensureOrgChain.test.js). Returns null ONLY when there is nothing to
  // enforce (E2E pre-pinned burner, passkey bundler path, non-org routes); otherwise
  // it ALWAYS reacquires + validates the org-chain client and THROWS on failure —
  // it never silently continues on a stale/ambient signer (the -32603 failure mode).
  const ensureOrgChain = useMemo(
    () => createEnsureOrgChain({
      orgChainId: orgChainId || DEFAULT_CHAIN_ID,
      isPasskeyUser,
      e2eEnabled: process.env.NEXT_PUBLIC_E2E_MODE === 'true',
      wagmiConfig,
      getAccount,
      switchChainAsync,
      getWalletClient,
      clientToSigner,
    }),
    [orgChainId, isPasskeyUser, switchChainAsync, wagmiConfig]
  );

  const submissionContext = useMemo(() => ({ orgId, authType, generation: sessionGeneration,
    scopeKey: keccak256(toUtf8Bytes(JSON.stringify([orgId, subgraphUrl, effectiveChainId, accountAddress, authType]))),
  }), [orgId, authType, sessionGeneration, subgraphUrl, effectiveChainId, accountAddress]);

  const rawTxManager = useMemo(() => {
    if (isPasskeyUser) {
      // Passkey: create SmartAccountTransactionManager
      // Uses org-chain clients when org is on a different chain than home chain
      if (!passkeyState || !effectivePublicClient || !effectiveBundlerClient) return null;
      return createSmartAccountTransactionManager({
        accountAddress: passkeyState.accountAddress,
        rawCredentialId: passkeyState.rawCredentialId,
        publicClient: effectivePublicClient,
        bundlerClient: effectiveBundlerClient,
        paymasterAddress,
        orgId,
        hatIds,
        chainId: effectiveChainId,
        scopeGuard: guard,
        submissionContext,
        initCode: needsCrossChainInit && initCodeReady ? crossChainInitCode : '0x',
      });
    }

    // EOA: always create the direct tx manager (needed as fallback).
    // `ensureChain` makes both the plain-direct and the 7702-fallback path switch
    // the wallet to the org chain and rebind the signer before sending. The guard
    // returns { signer, walletClient }; the direct manager only needs the signer.
    if (!signer) return null;
    const directTxManager = createTransactionManager(signer, {
      scopeGuard: guard, accountAddress, chainId: effectiveChainId, submissionContext,
      publicClient: effectivePublicClient, bundlerClient: effectiveBundlerClient,
      ensureChain: async () => (await ensureOrgChain())?.signer ?? null,
    });

    // EOA with EIP-7702: try gas-sponsored via PaymasterHub, fall back to direct tx.
    // Same org-chain guard is injected here so the 7702 authorization + UserOp are
    // signed against a walletClient freshly bound to the org chain — otherwise a
    // wallet still on the home chain would sign an authorization with the wrong id.
    if (eoa7702Capable && walletClient && paymasterAddress && orgId && hatIds?.length > 0
        && effectivePublicClient && effectiveBundlerClient) {
      return createEOA7702TransactionManager({
        accountAddress: walletClient.account.address,
        scopeGuard: guard,
        submissionContext,
        walletClient,
        publicClient: effectivePublicClient,
        bundlerClient: effectiveBundlerClient,
        paymasterAddress,
        orgId,
        hatIds,
        chainId: effectiveChainId,
        eoaDelegationAddress: EOA_DELEGATION_ADDRESS,
        ensureChain: ensureOrgChain,
        fallbackTxManager: directTxManager,
        on7702Disabled: () => {
          // Disable 7702 for the rest of this session so subsequent calls go direct
          eoa7702DisabledRef.current = true;
          setEoa7702Support(null);
        },
      });
    }

    return directTxManager;
  }, [signer, isPasskeyUser, passkeyState, effectivePublicClient, effectiveBundlerClient, paymasterAddress, orgId, hatIds, effectiveChainId, crossChainInitCode, needsCrossChainInit, initCodeReady, eoa7702Capable, walletClient, ensureOrgChain, guard, accountAddress, submissionContext]);

  const txManager = useMemo(() => {
    const scoped = guardService(rawTxManager, guard);
    if (!scoped) return null;
    return new Proxy(scoped, { get(target, key) {
      const value = target[key];
      if (!['execute', 'executeBatch'].includes(key)) return value;
      return (...args) => {
        guard();
        if (!initCodeReady) throw new Error(buildNotReadyMessage(ReadyState.INITIALIZING));
        return value(...args);
      };
    } });
  }, [rawTxManager, guard, initCodeReady]);

  const changeAccountUsername = useCallback((username, options = {}) => executeUsernameUpdate({
    username, options, guard,
    resolveSource: purpose => resolveAccountWriteSource(accountAddress, { purpose, guard }),
    createHost: source => createAccountHost({ source, accountAddress, isPasskeyUser, passkeyState, guard,
      ensureWallet: async chainId => {
        guard();
        await switchChainAsync({ chainId });
        guard();
        const walletClient = await getWalletClient(wagmiConfig, { chainId });
        guard();
        return { walletClient, signer: clientToSigner(walletClient) };
      },
    }),
  }), [accountAddress, isPasskeyUser, passkeyState, guard, switchChainAsync, wagmiConfig]);

  // Create domain services
  const services = useMemo(() => {
    if (!factory || !txManager) {
      return {
        user: null,
        organization: null,
        voting: null,
        task: null,
        education: null,
        eligibility: null,
        // Access v2. Non-null on every org — the SERVICE is harmless without an authority address;
        // it is the callers that gate on useOrgAuthority().enabled.
        membershipAuthority: null,
        roleCreation: null,
        zkEmailInvites: null,
        tokenRequest: null,
        treasury: null,
      };
    }

    const user = createUserService(factory, txManager, registryAddress);
    // Preserve the UserService API while routing renames by actual registration provenance.
    user.changeUsername = changeAccountUsername;
    return {
      user,
      organization: createOrganizationService(factory, txManager, registryAddress, effectiveChainId),
      voting: createVotingService(factory, txManager, ipfsService),
      task: createTaskService(factory, txManager, ipfsService),
      education: createEducationService(factory, txManager, ipfsService),
      eligibility: null,
      membershipAuthority: createMembershipAuthorityService(factory, txManager, authorityReadFactory),
      roleCreation: new RoleCreationService(authorityReadFactory),
      zkEmailInvites: createZkEmailInvitesService(factory, txManager, authorityReadFactory),
      tokenRequest: createTokenRequestService(factory, txManager, ipfsService),
      treasury: createTreasuryService(factory, txManager),
    };
  }, [factory, authorityReadFactory, txManager, ipfsService, registryAddress, effectiveChainId, changeAccountUsername]);

  // A per-consumer content-store override changes only storage-aware services.
  const getServicesForOptions = useCallback((options = {}) => {
    const selected = selectServiceOptions(services, ipfsService, options, (name, selectedIpfs) => {
      const creators = {
        voting: createVotingService, task: createTaskService,
        education: createEducationService, tokenRequest: createTokenRequestService,
      };
      return creators[name](factory, txManager, selectedIpfs);
    });
    return Object.fromEntries(Object.entries(selected).map(([name, service]) => [name, guardService(service, guard)]));
  }, [services, ipfsService, factory, txManager, guard]);

  // Contract addresses helper
  const getContractAddress = useCallback((contractName) => {
    return getInfrastructureAddress(contractName);
  }, []);

  // Discriminated readiness so call sites can tell "signed out" from "still
  // initializing" — and never tell a signed-in user to "connect your wallet".
  // For cross-chain passkey users, also wait for initCode resolution so
  // transactions don't fire before we know whether account deployment is needed.
  const readyState = (() => {
    // Not authenticated and not mid-connection → genuinely signed out.
    if (isAuthHydrated === false) return ReadyState.INITIALIZING;
    if (!isAuthenticated && !passkeyConnecting) return ReadyState.SIGNED_OUT;
    const servicesUp = isPasskeyUser
      ? Boolean(isAuthenticated && factory && txManager && initCodeReady)
      : Boolean(signer && factory && txManager);
    return servicesUp ? ReadyState.READY : ReadyState.INITIALIZING;
  })();
  // Back-compat: existing `!isReady` checks keep working unchanged.
  const isReady = readyState === ReadyState.READY;

  // Bound helper so call sites don't re-import readiness or recompute chainName.
  const orgChainName = orgChainId
    ? Object.values(NETWORKS).find((n) => n.chainId === orgChainId)?.name
    : null;
  const getNotReadyMessage = useCallback(
    (state = readyState) => buildNotReadyMessage(state, { chainName: orgChainName }),
    [readyState, orgChainName]
  );

  return useMemo(() => ({
    // Core
    factory,
    txManager,

    // Domain services
    ...services,
    getServicesForOptions,

    // Utilities
    getContractAddress,
    isReady,
    readyState,
    getNotReadyMessage,
    signer,

    // Constants
    VotingType,
  }), [factory, txManager, services, getServicesForOptions, getContractAddress, isReady, readyState, getNotReadyMessage, signer]);
}
