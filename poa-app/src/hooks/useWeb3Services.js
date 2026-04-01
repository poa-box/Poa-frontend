/**
 * useWeb3Services - Hook to access Web3 service layer
 * Provides a unified interface to all Web3 services with proper initialization.
 * Supports both EOA (RainbowKit/wagmi) and Passkey (ERC-4337) auth types.
 */

import { useMemo, useCallback, useState, useEffect } from 'react';
import { useQuery } from '@apollo/client';
import { encodeFunctionData } from 'viem';
import { useEthersSigner, useEthersProvider } from '@/components/ProviderConverter';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useRefreshEmit } from '../context/RefreshContext';
import { useIPFScontext } from '../context/ipfsContext';
import { usePOContext } from '../context/POContext';
import { useUserContext } from '../context/UserContext';
import { INFRASTRUCTURE_CONTRACTS, getInfrastructureAddress } from '../config/contracts';
import { DEFAULT_NETWORK, DEFAULT_CHAIN_ID } from '../config/networks';
import { FETCH_INFRASTRUCTURE_ADDRESSES } from '../util/queries';
import { FETCH_PAYMASTER_ORG_CONFIG, FETCH_PASSKEY_FACTORY_ADDRESS } from '../util/passkeyQueries';
import { createChainClients } from '../services/web3/utils/chainClients';
import PasskeyAccountFactoryABI from '../../abi/PasskeyAccountFactory.json';

// Core services
import { ContractFactory, createContractFactory } from '../services/web3/core/ContractFactory';
import { TransactionManager, createTransactionManager } from '../services/web3/core/TransactionManager';
import { createSmartAccountTransactionManager } from '../services/web3/core/SmartAccountTransactionManager';

// Domain services
import { UserService, createUserService } from '../services/web3/domain/UserService';
import { OrganizationService, createOrganizationService } from '../services/web3/domain/OrganizationService';
import { VotingService, VotingType, createVotingService } from '../services/web3/domain/VotingService';
import { TaskService, createTaskService } from '../services/web3/domain/TaskService';
import { EducationService, createEducationService } from '../services/web3/domain/EducationService';
import { EligibilityService, createEligibilityService } from '../services/web3/domain/EligibilityService';
import { TokenRequestService, createTokenRequestService } from '../services/web3/domain/TokenRequestService';
import { TreasuryService, createTreasuryService } from '../services/web3/domain/TreasuryService';

/**
 * Hook to access all Web3 services
 * @param {Object} [options={}] - Configuration options
 * @param {Object} [options.ipfsService] - IPFS service instance for content storage (falls back to context)
 * @param {string} [options.network] - Network name (defaults to DEFAULT_NETWORK)
 * @returns {Object} Object containing all services and utilities
 */
export function useWeb3Services(options = {}) {
  const { ipfsService: providedIpfs = null, network = DEFAULT_NETWORK } = options;
  const signer = useEthersSigner();
  // Pass DEFAULT_CHAIN_ID so wagmi returns a client even without a wallet connection.
  // Without this, passkey-only users get no provider (useClient() returns undefined
  // when no wallet is connected and no chainId is specified).
  const provider = useEthersProvider({ chainId: DEFAULT_CHAIN_ID });
  const { isPasskeyUser, isAuthenticated, passkeyState, publicClient, bundlerClient } = useAuth();

  // Get IPFS service from context if not provided
  const ipfsContext = useIPFScontext();
  const ipfsService = providedIpfs || ipfsContext;

  // Get org ID, chain, and subgraph URL from POContext for paymaster data
  // usePOContext returns undefined when outside POProvider (non-org routes)
  const poContext = usePOContext();
  const orgId = poContext?.orgId || null;
  const subgraphUrl = poContext?.subgraphUrl || null;
  const orgChainId = poContext?.orgChainId || null;

  // Create chain-specific clients when org is on a different chain than home chain
  const isCrossChain = orgChainId && orgChainId !== DEFAULT_CHAIN_ID;
  const { effectivePublicClient, effectiveBundlerClient, effectiveChainId } = useMemo(() => {
    if (!isCrossChain) {
      return { effectivePublicClient: publicClient, effectiveBundlerClient: bundlerClient, effectiveChainId: DEFAULT_CHAIN_ID };
    }
    const clients = createChainClients(orgChainId);
    if (!clients) {
      return { effectivePublicClient: publicClient, effectiveBundlerClient: bundlerClient, effectiveChainId: DEFAULT_CHAIN_ID };
    }
    return { effectivePublicClient: clients.publicClient, effectiveBundlerClient: clients.bundlerClient, effectiveChainId: orgChainId };
  }, [isCrossChain, orgChainId, publicClient, bundlerClient]);

  // Get user's hat IDs for hat-scoped paymaster budget
  // useUserContext returns undefined outside UserProvider (safe with optional chaining)
  const userContext = useUserContext();
  const hatIds = userContext?.userData?.hatIds || null;

  // Fetch infrastructure addresses from subgraph — routed to org's chain.
  // Skip until subgraphUrl is resolved by POContext to avoid querying the default
  // (Arbitrum) subgraph and getting wrong-chain addresses.
  // MUST use no-cache: Apollo caches by query+variables (not endpoint), so queries
  // against different subgraphs can return poisoned cache results.
  const { data: infraData } = useQuery(FETCH_INFRASTRUCTURE_ADDRESSES, {
    context: { subgraphUrl },
    fetchPolicy: 'no-cache',
    skip: !subgraphUrl,
  });
  const registryAddress = infraData?.universalAccountRegistries?.[0]?.id || null;
  const paymasterHubAddress = infraData?.poaManagerContracts?.[0]?.paymasterHubProxy || null;

  // For passkey cross-chain: fetch factory address from org chain to compute initCode
  const { data: factoryData } = useQuery(FETCH_PASSKEY_FACTORY_ADDRESS, {
    skip: !isPasskeyUser || !isCrossChain || !subgraphUrl,
    context: { subgraphUrl },
    fetchPolicy: 'no-cache',
  });
  const orgFactoryAddress = factoryData?.passkeyAccountFactories?.[0]?.id || null;

  // Compute initCode for cross-chain passkey account deployment.
  // Verifies the target chain factory produces the same CREATE2 address (factories at
  // different addresses on different chains produce different account addresses).
  // SmartAccountTransactionManager will check account existence at call time before using it.
  const [crossChainInitCode, setCrossChainInitCode] = useState('0x');
  // Track whether cross-chain initCode resolution has completed (so we can
  // block isReady until it finishes and prevent transactions from firing early).
  const [crossChainInitCodeResolved, setCrossChainInitCodeResolved] = useState(false);

  useEffect(() => {
    if (!isPasskeyUser || !isCrossChain) {
      // Not cross-chain — no initCode needed, immediately resolved
      setCrossChainInitCode('0x');
      setCrossChainInitCodeResolved(true);
      return;
    }

    if (!orgFactoryAddress || !passkeyState || !effectivePublicClient) {
      // Cross-chain but deps not ready yet — mark as unresolved
      setCrossChainInitCode('0x');
      setCrossChainInitCodeResolved(false);
      return;
    }

    setCrossChainInitCodeResolved(false);
    let cancelled = false;

    async function verifyAndBuildInitCode() {
      try {
        // Verify factory produces the same account address on the target chain
        const targetAddress = await effectivePublicClient.readContract({
          address: orgFactoryAddress,
          abi: PasskeyAccountFactoryABI,
          functionName: 'getAddress',
          args: [passkeyState.credentialId, passkeyState.publicKeyX, passkeyState.publicKeyY, BigInt(passkeyState.salt)],
        });

        if (cancelled) return;

        if (targetAddress.toLowerCase() !== passkeyState.accountAddress.toLowerCase()) {
          console.error(
            `[useWeb3Services] Cross-chain CREATE2 mismatch: target factory produces ${targetAddress}, ` +
            `expected ${passkeyState.accountAddress}. Cross-chain account deployment unavailable.`
          );
          setCrossChainInitCode('0x');
          setCrossChainInitCodeResolved(true);
          return;
        }

        const factoryCallData = encodeFunctionData({
          abi: PasskeyAccountFactoryABI,
          functionName: 'createAccount',
          args: [passkeyState.credentialId, passkeyState.publicKeyX, passkeyState.publicKeyY, BigInt(passkeyState.salt)],
        });
        setCrossChainInitCode(orgFactoryAddress + factoryCallData.slice(2));
      } catch (e) {
        if (!cancelled) {
          console.warn('[useWeb3Services] Failed to verify cross-chain factory:', e.message);
          setCrossChainInitCode('0x');
        }
      } finally {
        if (!cancelled) {
          setCrossChainInitCodeResolved(true);
        }
      }
    }

    verifyAndBuildInitCode();
    return () => { cancelled = true; };
  }, [isPasskeyUser, isCrossChain, orgFactoryAddress, passkeyState, effectivePublicClient]);

  // Check if this org has gas sponsorship enabled (subgraph lookup, no RPC)
  const { data: pmConfig } = useQuery(FETCH_PAYMASTER_ORG_CONFIG, {
    variables: { orgId },
    skip: !orgId,
    fetchPolicy: 'cache-first',
    context: { subgraphUrl },
  });
  const orgPaymaster = pmConfig?.paymasterOrgConfigs?.[0];
  // Entity existence = registered. Only pass paymaster address when not paused.
  const paymasterAddress = (orgPaymaster && !orgPaymaster.isPaused)
    ? paymasterHubAddress
    : null;

  // Create core services — auth-type-aware
  const factory = useMemo(() => {
    if (isPasskeyUser) {
      // Passkey: factory is used for ABI encoding only (SmartAccountTransactionManager
      // handles execution). Provider is optional — contracts work for encoding without one.
      return createContractFactory(null, provider || undefined);
    }
    // EOA: create factory with signer
    if (!signer) return null;
    return createContractFactory(signer);
  }, [signer, provider, isPasskeyUser]);

  const txManager = useMemo(() => {
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
        initCode: crossChainInitCode,
      });
    }
    // EOA: create standard TransactionManager
    if (!signer) return null;
    return createTransactionManager(signer);
  }, [signer, isPasskeyUser, passkeyState, effectivePublicClient, effectiveBundlerClient, paymasterAddress, orgId, hatIds, effectiveChainId, crossChainInitCode]);

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
        tokenRequest: null,
        treasury: null,
      };
    }

    return {
      user: createUserService(factory, txManager, registryAddress),
      organization: createOrganizationService(factory, txManager, registryAddress, effectiveChainId),
      voting: createVotingService(factory, txManager, ipfsService),
      task: createTaskService(factory, txManager, ipfsService),
      education: createEducationService(factory, txManager, ipfsService),
      eligibility: createEligibilityService(factory, txManager),
      tokenRequest: createTokenRequestService(factory, txManager, ipfsService),
      treasury: createTreasuryService(factory, txManager),
    };
  }, [factory, txManager, ipfsService, registryAddress, effectiveChainId]);

  // Contract addresses helper
  const getContractAddress = useCallback((contractName) => {
    return getInfrastructureAddress(contractName);
  }, []);

  // Check if services are ready (auth-type-aware).
  // For cross-chain passkey users, also wait for initCode resolution so
  // transactions don't fire before we know whether account deployment is needed.
  const isReady = isPasskeyUser
    ? Boolean(isAuthenticated && factory && txManager && crossChainInitCodeResolved)
    : Boolean(signer && factory && txManager);

  return {
    // Core
    factory,
    txManager,

    // Domain services
    ...services,

    // Utilities
    getContractAddress,
    isReady,
    signer,

    // Constants
    VotingType,
  };
}

/**
 * Hook for transaction execution with integrated notifications
 * Wraps service calls with loading states and automatic notifications
 */
export function useTransactionWithNotification() {
  const { addNotification, updateNotification } = useNotification();
  const { emit } = useRefreshEmit();

  /**
   * Execute a transaction with notification handling
   * @param {Function} transactionFn - Async function that returns a TransactionResult
   * @param {Object} options - Options for the transaction
   * @param {string} options.pendingMessage - Message to show while pending
   * @param {string} options.successMessage - Message to show on success
   * @param {string} [options.errorMessage] - Custom error message (uses parsed error if not provided)
   * @param {string} [options.refreshEvent] - Event to emit on success
   * @param {Object} [options.refreshData] - Data to include with refresh event
   * @returns {Promise<TransactionResult>}
   */
  const executeWithNotification = useCallback(async (
    transactionFn,
    {
      pendingMessage,
      successMessage,
      errorMessage,
      refreshEvent,
      refreshData = {},
    }
  ) => {
    // Show pending notification with loading status (blue spinner)
    const pendingId = addNotification(pendingMessage, 'loading');

    try {
      const result = await transactionFn();

      if (result.success) {
        // Update pending notification to success
        updateNotification(pendingId, successMessage, 'success');

        // Emit refresh event if specified
        if (refreshEvent) {
          emit(refreshEvent, {
            ...refreshData,
            transactionHash: result.transactionHash,
          });
        }
      } else {
        // Update to error
        const message = errorMessage || result.error?.userMessage || 'Transaction failed';
        updateNotification(pendingId, message, 'error');
      }

      return result;
    } catch (error) {
      // Handle unexpected errors - update to error
      const message = errorMessage || error.message || 'An unexpected error occurred';
      updateNotification(pendingId, message, 'error');

      return {
        success: false,
        error,
      };
    }
  }, [addNotification, updateNotification, emit]);

  /**
   * Create a transaction handler for common operations
   * Returns a wrapped function that handles notifications automatically
   */
  const createHandler = useCallback((
    serviceFn,
    {
      pendingMessage,
      successMessage,
      errorMessage,
      refreshEvent,
    }
  ) => {
    return async (...args) => {
      return executeWithNotification(
        () => serviceFn(...args),
        {
          pendingMessage,
          successMessage,
          errorMessage,
          refreshEvent,
          refreshData: { args },
        }
      );
    };
  }, [executeWithNotification]);

  return {
    executeWithNotification,
    createHandler,
  };
}

/**
 * Combined hook for services + transaction notifications
 * Most convenient for component usage
 */
export function useWeb3(options = {}) {
  const services = useWeb3Services(options);
  const txNotification = useTransactionWithNotification();

  return {
    ...services,
    ...txNotification,
  };
}

export default useWeb3Services;
