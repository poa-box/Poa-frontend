/**
 * usePasskeyOnboarding
 * React hook wrapping PasskeyOnboardingService for component usage.
 * Provides step tracking, error handling, and AuthContext integration.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@apollo/client';
import { useEnrollmentScope, enrollmentInitiator } from '@/hooks/useEnrollmentScope';
import { useEnrollmentRecovery } from '@/hooks/useEnrollmentRecovery';
import { removePendingCredential } from '@/services/web3/passkey/passkeyStorage';
import { getClient } from '@/util/apolloClient';
import { useAuth } from '@/context/authState';
import { usePOContext } from '@/context/POContext';
import { DEFAULT_CHAIN_ID } from '@/config/networks';
import { createChainClients } from '@/services/web3/utils/chainClients';
import {
  createPasskeyOnboardingService,
  OnboardingStep,
  STEP_MESSAGES,
} from '@/services/web3/domain/PasskeyOnboardingService';
import { FETCH_INFRASTRUCTURE_ADDRESSES } from '@/util/queries';
import { FETCH_PASSKEY_FACTORY_ADDRESS } from '@/util/passkeyQueries';

/**
 * Hook for passkey onboarding within an organization context.
 *
 * @returns {Object} Onboarding state and controls
 */
export function usePasskeyOnboarding() {
  const auth = useAuth();
  const { publicClient: homePublicClient, bundlerClient: homeBundlerClient, activatePasskey } = auth;
  const { quickJoinContractAddress, orgId, subgraphUrl, orgChainId } = usePOContext();

  const completedActivation = useRef(null);
  const [step, setStep] = useState(OnboardingStep.IDLE);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [isOnboarding, setIsOnboarding] = useState(false);

  // Create chain-specific clients when org is on a different chain
  const isCrossChain = orgChainId && orgChainId !== DEFAULT_CHAIN_ID;
  const { publicClient, bundlerClient, chainId } = useMemo(() => {
    if (!isCrossChain) {
      return { publicClient: homePublicClient, bundlerClient: homeBundlerClient, chainId: DEFAULT_CHAIN_ID };
    }
    const clients = createChainClients(orgChainId);
    if (!clients) return { publicClient: null, bundlerClient: null, chainId: orgChainId };
    return { publicClient: clients.publicClient, bundlerClient: clients.bundlerClient, chainId: orgChainId };
  }, [isCrossChain, orgChainId, homePublicClient, homeBundlerClient]);

  // Per-chain client prevents cache poisoning: each endpoint has its own InMemoryCache.
  const orgClient = useMemo(() => getClient(subgraphUrl), [subgraphUrl]);

  // Fetch infrastructure addresses — routed to org's chain subgraph.
  // Skip until subgraphUrl is resolved by POContext to avoid querying the default
  // (Arbitrum) subgraph and getting wrong-chain addresses.
  const { data: infraData } = useQuery(FETCH_INFRASTRUCTURE_ADDRESSES, {
    client: orgClient,
    skip: !subgraphUrl,
  });
  const registryAddress = infraData?.universalAccountRegistries?.[0]?.id || null;
  const paymasterAddress = infraData?.poaManagerContracts?.[0]?.paymasterHubProxy || null;

  // Fetch factory address from org chain's subgraph
  const { data: factoryData } = useQuery(FETCH_PASSKEY_FACTORY_ADDRESS, {
    client: orgClient,
    skip: !subgraphUrl,
  });
  const factoryAddress = factoryData?.passkeyAccountFactories?.[0]?.id || null;

  // Check if all required addresses are available
  const isReady = Boolean(
    auth.isAuthHydrated !== false && subgraphUrl && orgChainId &&
    publicClient &&
    bundlerClient &&
    factoryAddress &&
    registryAddress &&
    quickJoinContractAddress &&
    paymasterAddress &&
    orgId
  );

  const { guard, scope } = useEnrollmentScope(auth, [orgId, subgraphUrl, orgChainId, quickJoinContractAddress, registryAddress, factoryAddress, paymasterAddress]);

  const source = useMemo(() => ({ chainId, registryAddress, factoryAddress, orgId, targetAddress: quickJoinContractAddress, flow: 'onboarding' }), [chainId, registryAddress, factoryAddress, orgId, quickJoinContractAddress]);
  useEffect(() => {
    const completed = completedActivation.current;
    completedActivation.current = null;
    if (completed && completed.accountAddress?.toLowerCase() === auth.accountAddress?.toLowerCase()
      && auth.isPasskeyUser && completed.source === JSON.stringify(source)) {
      setIsOnboarding(false); return;
    }
    setStep(OnboardingStep.IDLE); setError(null); setResult(null); setIsOnboarding(false);
  }, [scope, auth.accountAddress, auth.isPasskeyUser, source]);
  const onConfirmed = useCallback(value => { guard(); completedActivation.current = { accountAddress: value.accountAddress, source: JSON.stringify(source) }; setResult(value); setStep(OnboardingStep.SUCCESS); }, [guard, source]);
  const recovery = useEnrollmentRecovery({ auth, source, guard, onConfirmed });

  const stepMessage = STEP_MESSAGES[step] || '';

  /**
   * Start the onboarding flow.
   * @param {string} username - Username to register
   * @param {string|bigint} paymasterHatId - Hat ID whose org budget sponsors the
   *   onboarding UserOp (the quick-join member hat the new account will be granted).
   *   Required for org-mode onboarding — the paymaster checks this hat's shared budget.
   */
  const startOnboarding = useCallback(async (username, paymasterHatId) => {
    guard();
    if (!isReady) {
      setError(new Error('Required infrastructure not available. Please try again later.'));
      return;
    }

    setIsOnboarding(true);
    setError(null);
    setResult(null);

    try {
      if (await publicClient.getChainId() !== chainId) throw new Error('This network is unavailable. Please try again.');
      guard();
      const factoryCode = await publicClient.getBytecode({ address: factoryAddress });
      guard();
      if (!factoryCode || factoryCode === '0x') throw new Error('Account creation is unavailable on this network.');
      const service = createPasskeyOnboardingService({
        publicClient,
        bundlerClient,
        factoryAddress,
        registryAddress,
        quickJoinAddress: quickJoinContractAddress,
        paymasterAddress,
        orgId,
        hatId: paymasterHatId,
        chainId,
        scopeGuard: guard, initiator: enrollmentInitiator(auth),
      });

      const onboardResult = await service.onboard(username, (newStep, data) => {
        guard();
        setStep(newStep);
        if (newStep === OnboardingStep.ERROR) {
          setError(data?.error || new Error('Unknown error'));
        }
      });

      guard();
      onConfirmed(onboardResult);

      // Save credential and activate passkey auth
      await activatePasskey({
        credentialId: onboardResult.credentialId,
        rawCredentialId: onboardResult.rawCredentialId,
        publicKeyX: onboardResult.publicKeyX,
        publicKeyY: onboardResult.publicKeyY,
        accountAddress: onboardResult.accountAddress,
        salt: onboardResult.salt,
        credentialChainId: chainId,
      });

      removePendingCredential(onboardResult.accountAddress, source);
      return onboardResult;

    } catch (err) {
      try { guard(); } catch { return; }
      // Handle user cancellation gracefully
      if (err.name === 'NotAllowedError' || err.message?.includes('NotAllowedError')) {
        setError(new Error('Passkey creation was cancelled.'));
      } else {
        setError(err);
      }
      setStep(OnboardingStep.ERROR);
    } finally {
      try { guard(); setIsOnboarding(false); } catch { /* New scope owns this state. */ }
    }
  }, [
    guard,
    isReady,
    publicClient,
    bundlerClient,
    factoryAddress,
    registryAddress,
    quickJoinContractAddress,
    paymasterAddress,
    orgId,
    chainId,
    activatePasskey,
    onConfirmed,
    source,
    auth,
  ]);

  /**
   * Reset the onboarding state (e.g., to retry).
   */
  const reset = useCallback(() => {
    guard();
    setStep(OnboardingStep.IDLE);
    setError(null);
    setResult(null);
    setIsOnboarding(false);
  }, [guard]);

  return {
    // State
    step,
    stepMessage,
    error,
    result,
    isOnboarding,
    isReady,
    ...recovery,

    // Actions
    startOnboarding,
    reset,

    // Constants
    OnboardingStep,
  };
}
