/**
 * useVouchFirstOnboarding
 * State machine hook for vouch-first passkey onboarding.
 *
 * Flow: create credential → get counterfactual address → share vouch link →
 * poll for vouches → once quorum met → deploy + join in single UserOp.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@apollo/client';
import { useAuth } from '../context/AuthContext';
import { usePOContext } from '../context/POContext';
import { createPasskeyCredential } from '../services/web3/passkey/passkeyCreate';
import {
  createPasskeyOnboardingService,
  PasskeyOnboardingService,
  OnboardingStep,
  STEP_MESSAGES,
} from '../services/web3/domain/PasskeyOnboardingService';
import {
  savePendingCredential,
  getPendingCredentialForOrg,
  removePendingCredential,
} from '../services/web3/passkey/passkeyStorage';
import { FETCH_INFRASTRUCTURE_ADDRESSES } from '../util/queries';
import { FETCH_PASSKEY_FACTORY_ADDRESS } from '../util/passkeyQueries';

/**
 * Vouch-first onboarding phases
 */
export const VouchFirstPhase = {
  IDLE: 'idle',
  CREATING_CREDENTIAL: 'creating_credential',
  AWAITING_VOUCHES: 'awaiting_vouches',
  COMPLETING: 'completing',
  SUCCESS: 'success',
  ERROR: 'error',
};

/**
 * @param {Object} params
 * @param {string} params.orgName - DAO name (userDAO)
 * @param {Function} params.refetchVouches - refetch function from useVouches
 */
export function useVouchFirstOnboarding({
  orgName,
  refetchVouches,
}) {
  const { publicClient, bundlerClient, activatePasskey } = useAuth();
  const { quickJoinContractAddress, orgId } = usePOContext();

  // Infrastructure addresses
  const { data: infraData } = useQuery(FETCH_INFRASTRUCTURE_ADDRESSES);
  const registryAddress = infraData?.universalAccountRegistries?.[0]?.id || null;
  const paymasterAddress = infraData?.poaManagerContracts?.[0]?.paymasterHubProxy || null;

  const { data: factoryData } = useQuery(FETCH_PASSKEY_FACTORY_ADDRESS);
  const factoryAddress = factoryData?.passkeyAccountFactories?.[0]?.id || null;

  // State
  const [phase, setPhase] = useState(VouchFirstPhase.IDLE);
  const [pendingCredential, setPendingCredential] = useState(null);
  const [vouchLink, setVouchLink] = useState('');
  const [step, setStep] = useState(OnboardingStep.IDLE);
  const [error, setError] = useState(null);
  const pollIntervalRef = useRef(null);

  const stepMessage = STEP_MESSAGES[step] || '';

  // On mount: check for existing pending credential
  useEffect(() => {
    if (!orgName) return;
    const stored = getPendingCredentialForOrg(orgName);
    if (stored) {
      setPendingCredential(stored);
      setPhase(VouchFirstPhase.AWAITING_VOUCHES);
      setVouchLink(buildVouchLink(orgName, stored.accountAddress, stored.selectedHatId));
    }
  }, [orgName]);

  // Poll for vouches while awaiting
  useEffect(() => {
    if (phase === VouchFirstPhase.AWAITING_VOUCHES && refetchVouches) {
      pollIntervalRef.current = setInterval(() => {
        refetchVouches();
      }, 15000);
      return () => clearInterval(pollIntervalRef.current);
    }
    return () => clearInterval(pollIntervalRef.current);
  }, [phase, refetchVouches]);

  /**
   * Step 1: Create passkey credential + compute counterfactual address.
   * Does NOT deploy — just creates the WebAuthn credential and saves to pending storage.
   */
  const createCredentialAndLink = useCallback(async (username, selectedHatId) => {
    if (!factoryAddress || !publicClient) {
      setError(new Error('Infrastructure not ready. Please try again.'));
      return;
    }

    setPhase(VouchFirstPhase.CREATING_CREDENTIAL);
    setError(null);

    try {
      // Create passkey (biometric prompt)
      const credential = await createPasskeyCredential(username);

      // Compute counterfactual address
      const accountAddress = await PasskeyOnboardingService.computeCounterfactualAddress(
        publicClient,
        factoryAddress,
        credential,
      );

      const pending = {
        credentialId: credential.credentialId,
        rawCredentialId: credential.rawCredentialId,
        publicKeyX: credential.publicKeyX,
        publicKeyY: credential.publicKeyY,
        salt: credential.salt.toString(),
        accountAddress,
        selectedHatId,
        orgName,
      };

      // Persist so flow survives browser close
      savePendingCredential(pending);
      setPendingCredential(pending);

      const link = buildVouchLink(orgName, accountAddress, selectedHatId);
      setVouchLink(link);

      // Copy to clipboard
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        // Clipboard may fail in some browsers — link is still displayed
      }

      setPhase(VouchFirstPhase.AWAITING_VOUCHES);
      return pending;
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.message?.includes('NotAllowedError')) {
        setError(new Error('Passkey creation was cancelled.'));
      } else {
        setError(err);
      }
      setPhase(VouchFirstPhase.ERROR);
    }
  }, [factoryAddress, publicClient, orgName]);

  /**
   * Step 2: Deploy account + join in single UserOp.
   * Called after vouch quorum is met.
   */
  const completeOnboarding = useCallback(async (username) => {
    if (!pendingCredential) {
      setError(new Error('No pending credential found.'));
      return;
    }

    if (!publicClient || !bundlerClient || !factoryAddress || !registryAddress || !quickJoinContractAddress || !paymasterAddress || !orgId) {
      setError(new Error('Infrastructure not ready. Please try again.'));
      return;
    }

    setPhase(VouchFirstPhase.COMPLETING);
    setError(null);

    try {
      const service = createPasskeyOnboardingService({
        publicClient,
        bundlerClient,
        factoryAddress,
        registryAddress,
        quickJoinAddress: quickJoinContractAddress,
        paymasterAddress,
        orgId,
        hatId: pendingCredential.selectedHatId,
      });

      const credential = {
        credentialId: pendingCredential.credentialId,
        publicKeyX: pendingCredential.publicKeyX,
        publicKeyY: pendingCredential.publicKeyY,
        rawCredentialId: pendingCredential.rawCredentialId,
        salt: BigInt(pendingCredential.salt),
        accountAddress: pendingCredential.accountAddress,
      };

      const result = await service.deployWithExistingCredential(
        username,
        credential,
        (newStep, data) => {
          setStep(newStep);
          if (newStep === OnboardingStep.ERROR) {
            setError(data?.error || new Error('Unknown error'));
          }
        },
      );

      // Clean up pending storage
      removePendingCredential(pendingCredential.accountAddress);

      // Activate passkey auth
      activatePasskey({
        credentialId: result.credentialId,
        rawCredentialId: result.rawCredentialId,
        publicKeyX: result.publicKeyX,
        publicKeyY: result.publicKeyY,
        accountAddress: result.accountAddress,
        salt: result.salt,
      });

      setPhase(VouchFirstPhase.SUCCESS);
      return result;
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.message?.includes('NotAllowedError')) {
        setError(new Error('Passkey signing was cancelled.'));
      } else {
        setError(err);
      }
      setPhase(VouchFirstPhase.ERROR);
    }
  }, [
    pendingCredential,
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
   * Reset the entire flow.
   */
  const reset = useCallback(() => {
    if (pendingCredential?.accountAddress) {
      removePendingCredential(pendingCredential.accountAddress);
    }
    setPendingCredential(null);
    setVouchLink('');
    setPhase(VouchFirstPhase.IDLE);
    setStep(OnboardingStep.IDLE);
    setError(null);
  }, [pendingCredential]);

  return {
    phase,
    pendingCredential,
    vouchLink,
    step,
    stepMessage,
    error,
    createCredentialAndLink,
    completeOnboarding,
    reset,
  };
}

function buildVouchLink(orgName, accountAddress, hatId) {
  if (typeof window === 'undefined') return '';
  const base = `${window.location.origin}/user`;
  return `${base}?userDAO=${encodeURIComponent(orgName)}&vouch=${accountAddress}&hatId=${hatId}`;
}

export default useVouchFirstOnboarding;
