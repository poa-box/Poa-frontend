/**
 * usePasskeyOnboarding
 * React hook wrapping PasskeyOnboardingService for component usage.
 * Provides step tracking, error handling, and AuthContext integration.
 */

import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { useAuth } from '../context/AuthContext';
import { usePOContext } from '../context/POContext';
import {
  createPasskeyOnboardingService,
  OnboardingStep,
  STEP_MESSAGES,
} from '../services/web3/domain/PasskeyOnboardingService';
import { FETCH_INFRASTRUCTURE_ADDRESSES } from '../util/queries';
import { FETCH_PASSKEY_FACTORY_ADDRESS } from '../util/passkeyQueries';

/**
 * Hook for passkey onboarding within an organization context.
 *
 * @returns {Object} Onboarding state and controls
 */
export function usePasskeyOnboarding() {
  const { publicClient, bundlerClient, activatePasskey } = useAuth();
  const { quickJoinContractAddress, orgId } = usePOContext();

  const [step, setStep] = useState(OnboardingStep.IDLE);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [isOnboarding, setIsOnboarding] = useState(false);

  // Fetch infrastructure addresses
  const { data: infraData } = useQuery(FETCH_INFRASTRUCTURE_ADDRESSES);
  const registryAddress = infraData?.universalAccountRegistries?.[0]?.id || null;
  const paymasterAddress = infraData?.poaManagerContracts?.[0]?.paymasterHubProxy || null;

  // Fetch PasskeyAccountFactory address
  const { data: factoryData } = useQuery(FETCH_PASSKEY_FACTORY_ADDRESS);
  const factoryAddress = factoryData?.passKeyAccountFactories?.[0]?.id || null;

  // Check if all required addresses are available
  const isReady = Boolean(
    publicClient &&
    bundlerClient &&
    factoryAddress &&
    registryAddress &&
    quickJoinContractAddress &&
    paymasterAddress &&
    orgId
  );

  const stepMessage = STEP_MESSAGES[step] || '';

  /**
   * Start the onboarding flow.
   * @param {string} username - Username to register
   */
  const startOnboarding = useCallback(async (username) => {
    if (!isReady) {
      setError(new Error('Required infrastructure not available. Please try again later.'));
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
        quickJoinAddress: quickJoinContractAddress,
        paymasterAddress,
        orgId,
      });

      const onboardResult = await service.onboard(username, (newStep, data) => {
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
      // Handle user cancellation gracefully
      if (err.name === 'NotAllowedError' || err.message?.includes('NotAllowedError')) {
        setError(new Error('Passkey creation was cancelled.'));
      } else {
        setError(err);
      }
      setStep(OnboardingStep.ERROR);
    } finally {
      setIsOnboarding(false);
    }
  }, [
    isReady,
    publicClient,
    bundlerClient,
    factoryAddress,
    registryAddress,
    quickJoinContractAddress,
    paymasterAddress,
    orgId,
    activatePasskey,
  ]);

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

    // Actions
    startOnboarding,
    reset,

    // Constants
    OnboardingStep,
  };
}
