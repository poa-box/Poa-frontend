/**
 * useSolidarityOnboarding
 * React hook for solidarity-funded passkey account creation (no org context needed).
 * Used on the homepage where there is no POContext available.
 *
 * Targets GNOSIS chain where the solidarity fund is active and onboarding is enabled.
 * Arbitrum does not have onboarding enabled, so all solidarity-funded operations go through Gnosis.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  createPasskeyOnboardingService,
  OnboardingStep,
  STEP_MESSAGES,
} from '../services/web3/domain/PasskeyOnboardingService';
import { createChainClients } from '../services/web3/utils/chainClients';
import { DEFAULT_DEPLOY_CHAIN_ID, getSubgraphUrl } from '../config/networks';

// Gnosis chain — solidarity fund is active here, not on Arbitrum
const SOLIDARITY_CHAIN_ID = DEFAULT_DEPLOY_CHAIN_ID;

export function useSolidarityOnboarding() {
  const { activatePasskey } = useAuth();

  const [step, setStep] = useState(OnboardingStep.IDLE);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [isOnboarding, setIsOnboarding] = useState(false);

  // Infrastructure state (fetched from Gnosis subgraph)
  const [paymasterAddress, setPaymasterAddress] = useState(null);
  const [registryAddress, setRegistryAddress] = useState(null);
  const [factoryAddress, setFactoryAddress] = useState(null);
  const [isSolidarityFundActive, setIsSolidarityFundActive] = useState(false);
  const [solidarityLoading, setSolidarityLoading] = useState(true);

  // Create Gnosis-specific clients for the UserOp
  const gnosisClients = useMemo(() => createChainClients(SOLIDARITY_CHAIN_ID), []);
  const publicClient = gnosisClients?.publicClient;
  const bundlerClient = gnosisClients?.bundlerClient;

  // Fetch infrastructure from Gnosis subgraph via direct fetch (not Apollo)
  useEffect(() => {
    const subgraphUrl = getSubgraphUrl(SOLIDARITY_CHAIN_ID);
    if (!subgraphUrl) return;

    async function fetchInfra() {
      try {
        const query = `{
          poaManagerContracts(first: 1) { paymasterHubProxy }
          universalAccountRegistries(first: 1) { id }
          passkeyAccountFactories(first: 1) { id }
          paymasterHubContracts(first: 1) { solidarityBalance }
        }`;
        const res = await fetch(subgraphUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        });
        const json = await res.json();
        const data = json?.data;

        setPaymasterAddress(data?.poaManagerContracts?.[0]?.paymasterHubProxy || null);
        setRegistryAddress(data?.universalAccountRegistries?.[0]?.id || null);
        setFactoryAddress(data?.passkeyAccountFactories?.[0]?.id || null);

        const balance = data?.paymasterHubContracts?.[0]?.solidarityBalance || '0';
        setIsSolidarityFundActive(BigInt(balance) > 0n);
      } catch (err) {
        console.error('[SolidarityOnboarding] Failed to fetch Gnosis infrastructure:', err);
      } finally {
        setSolidarityLoading(false);
      }
    }

    fetchInfra();
  }, []);

  // Check if all required infrastructure is available
  const isReady = Boolean(
    publicClient &&
    bundlerClient &&
    factoryAddress &&
    paymasterAddress &&
    registryAddress &&
    isSolidarityFundActive
  );

  const stepMessage = STEP_MESSAGES[step] || '';

  /**
   * Start the solidarity-funded onboarding flow.
   * @param {string} displayName - Display name for the WebAuthn credential
   */
  const startOnboarding = useCallback(async (displayName) => {
    if (!isReady) {
      setError(new Error('Solidarity fund not available or infrastructure not loaded.'));
      return;
    }

    setIsOnboarding(true);
    setError(null);
    setResult(null);

    try {
      const service = createPasskeyOnboardingService({
        publicClient,
        bundlerClient,
        factoryAddress,
        registryAddress,
        paymasterAddress,
        mode: 'solidarity',
        chainId: SOLIDARITY_CHAIN_ID,
      });

      const onboardResult = await service.onboard(displayName, (newStep, data) => {
        setStep(newStep);
        if (newStep === OnboardingStep.ERROR) {
          setError(data?.error || new Error('Unknown error'));
        }
      });

      setResult(onboardResult);

      // Save credential and activate passkey auth
      activatePasskey({
        credentialId: onboardResult.credentialId,
        rawCredentialId: onboardResult.rawCredentialId,
        publicKeyX: onboardResult.publicKeyX,
        publicKeyY: onboardResult.publicKeyY,
        accountAddress: onboardResult.accountAddress,
        salt: onboardResult.salt,
      });

      return onboardResult;

    } catch (err) {
      if (err.name === 'NotAllowedError' || err.message?.includes('NotAllowedError')) {
        setError(new Error('Passkey creation was cancelled.'));
      } else {
        setError(err);
      }
      setStep(OnboardingStep.ERROR);
    } finally {
      setIsOnboarding(false);
    }
  }, [isReady, publicClient, bundlerClient, factoryAddress, registryAddress, paymasterAddress, activatePasskey]);

  /**
   * Reset the onboarding state (e.g., to retry).
   */
  const reset = useCallback(() => {
    setStep(OnboardingStep.IDLE);
    setError(null);
    setResult(null);
    setIsOnboarding(false);
  }, []);

  return {
    // State
    step,
    stepMessage,
    error,
    result,
    isOnboarding,
    isReady,
    isSolidarityFundActive,
    solidarityLoading,

    // Actions
    startOnboarding,
    reset,

    // Constants
    OnboardingStep,
  };
}
