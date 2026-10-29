/**
 * useSolidarityOnboarding
 * React hook for solidarity-funded passkey account creation (no org context needed).
 * Used on the homepage where there is no POContext available.
 *
 * Targets GNOSIS chain where the solidarity fund is active and onboarding is enabled.
 * Arbitrum does not have onboarding enabled, so all solidarity-funded operations go through Gnosis.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useEnrollmentScope, enrollmentInitiator } from '@/hooks/useEnrollmentScope';
import { useEnrollmentRecovery } from '@/hooks/useEnrollmentRecovery';
import { removePendingCredential } from '@/services/web3/passkey/passkeyStorage';
import { print } from 'graphql';
import { ENROLLMENT_INFRASTRUCTURE } from '@/services/web3/domain/enrollmentQueries';
import { useAuth } from '@/context/authState';
import {
  createPasskeyOnboardingService,
  OnboardingStep,
  STEP_MESSAGES,
} from '@/services/web3/domain/PasskeyOnboardingService';
import { createChainClients } from '@/services/web3/utils/chainClients';
import { DEFAULT_DEPLOY_CHAIN_ID, getSubgraphUrl } from '@/config/networks';

// Gnosis chain — solidarity fund is active here, not on Arbitrum
const SOLIDARITY_CHAIN_ID = DEFAULT_DEPLOY_CHAIN_ID;

export function useSolidarityOnboarding() {
  const auth = useAuth();
  const { activatePasskey } = auth;

  const completedActivation = useRef(null);
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

    let alive = true;
    async function fetchInfra() {
      try {
        const query = print(ENROLLMENT_INFRASTRUCTURE);
        const res = await fetch(subgraphUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        });
        const json = await res.json();
        if (!alive) return;
        if (json.errors?.length) throw new Error('Account setup information is unavailable.');
        const data = json?.data;

        setPaymasterAddress(data?.poaManagerContracts?.[0]?.paymasterHubProxy || null);
        setRegistryAddress(data?.universalAccountRegistries?.[0]?.id || null);
        setFactoryAddress(data?.passkeyAccountFactories?.[0]?.id || null);

        const balance = data?.paymasterHubContracts?.[0]?.solidarityBalance || '0';
        setIsSolidarityFundActive(BigInt(balance) > 0n);
      } catch (err) {
        if (alive) setIsSolidarityFundActive(false);
      } finally {
        if (alive) setSolidarityLoading(false);
      }
    }

    fetchInfra();
    return () => { alive = false; };
  }, []);

  // Check if all required infrastructure is available
  const isReady = Boolean(
    auth.isAuthHydrated !== false &&
    publicClient &&
    bundlerClient &&
    factoryAddress &&
    paymasterAddress &&
    registryAddress &&
    isSolidarityFundActive
  );

  const { guard, scope } = useEnrollmentScope(auth, [SOLIDARITY_CHAIN_ID, getSubgraphUrl(SOLIDARITY_CHAIN_ID), registryAddress, factoryAddress, paymasterAddress]);
  const source = useMemo(() => ({ chainId: SOLIDARITY_CHAIN_ID, registryAddress, factoryAddress, orgId: null, targetAddress: registryAddress, flow: 'onboarding' }), [registryAddress, factoryAddress]);
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
   * Start the solidarity-funded onboarding flow.
   * @param {string} displayName - Display name for the WebAuthn credential
   */
  const startOnboarding = useCallback(async (displayName) => {
    guard();
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
        chainId: SOLIDARITY_CHAIN_ID, scopeGuard: guard, initiator: enrollmentInitiator(auth),
      });

      const onboardResult = await service.onboard(displayName, (newStep, data) => {
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
        credentialChainId: SOLIDARITY_CHAIN_ID,
      });

      removePendingCredential(onboardResult.accountAddress, source);
      return onboardResult;

    } catch (err) {
      try { guard(); } catch { return; }
      if (err.name === 'NotAllowedError' || err.message?.includes('NotAllowedError')) {
        setError(new Error('Passkey creation was cancelled.'));
      } else {
        setError(err);
      }
      setStep(OnboardingStep.ERROR);
    } finally {
      try { guard(); setIsOnboarding(false); } catch { /* New scope owns state. */ }
    }
  }, [guard, auth, source, onConfirmed, isReady, publicClient, bundlerClient, factoryAddress, registryAddress, paymasterAddress, activatePasskey]);

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
    isSolidarityFundActive,
    solidarityLoading,
    ...recovery,

    // Actions
    startOnboarding,
    reset,

    // Constants
    OnboardingStep,
  };
}
