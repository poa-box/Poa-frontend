/**
 * useSolidarityOnboarding
 * React hook for solidarity-funded passkey account creation (no org context needed).
 * Used on the homepage where there is no POContext available.
 */

import { useState, useCallback } from 'react';
import { useQuery } from '@apollo/client';
import { useAuth } from '../context/AuthContext';
import {
  createPasskeyOnboardingService,
  OnboardingStep,
  STEP_MESSAGES,
} from '../services/web3/domain/PasskeyOnboardingService';
import { FETCH_INFRASTRUCTURE_ADDRESSES } from '../util/queries';
import { FETCH_PASSKEY_FACTORY_ADDRESS, FETCH_SOLIDARITY_FUND_STATUS } from '../util/passkeyQueries';

export function useSolidarityOnboarding() {
  const { publicClient, bundlerClient, activatePasskey } = useAuth();

  const [step, setStep] = useState(OnboardingStep.IDLE);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [isOnboarding, setIsOnboarding] = useState(false);

  // Fetch infrastructure addresses (no org context needed)
  const { data: infraData } = useQuery(FETCH_INFRASTRUCTURE_ADDRESSES);
  const paymasterAddress = infraData?.poaManagerContracts?.[0]?.paymasterHubProxy || null;

  // Fetch PasskeyAccountFactory address
  const { data: factoryData } = useQuery(FETCH_PASSKEY_FACTORY_ADDRESS);
  const factoryAddress = factoryData?.passKeyAccountFactories?.[0]?.id || null;

  // Fetch solidarity fund status
  const { data: solidarityData, loading: solidarityLoading } = useQuery(FETCH_SOLIDARITY_FUND_STATUS);
  const solidarityBalance = solidarityData?.paymasterHubContracts?.[0]?.solidarityBalance || '0';
  const isSolidarityFundActive = BigInt(solidarityBalance) > 0n;

  // Check if all required infrastructure is available
  const isReady = Boolean(
    publicClient &&
    bundlerClient &&
    factoryAddress &&
    paymasterAddress &&
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
        paymasterAddress,
        mode: 'solidarity',
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
  }, [isReady, publicClient, bundlerClient, factoryAddress, paymasterAddress, activatePasskey]);

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
