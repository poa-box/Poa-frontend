/**
 * useClaimZkEmailRole
 * Orchestrates a client-side ZK Email role claim: prove the email in-browser, then submit the claim
 * (gasless via the PaymasterHub when the connected account is a smart wallet).
 *
 * ZkEmailInvites is OPTIONAL — this hook refuses to run unless `zkEmailInvitesEnabled` (POContext).
 */

import { useCallback, useState } from 'react';
import { keccak256, toBytes } from 'viem';
import { useWeb3Services, useTransactionWithNotification } from './useWeb3Services';
import { usePOContext } from '../context/POContext';
import { useAuth } from '../context/AuthContext';
import { generateEmailProof } from '../lib/zkemail/prover';

export const ZK_CLAIM_STEPS = {
  IDLE: 'idle',
  PROVING: 'proving',
  SUBMITTING: 'submitting',
  DONE: 'done',
  ERROR: 'error',
};

export function useClaimZkEmailRole() {
  const { zkEmailInvites } = useWeb3Services();
  const { executeWithNotification } = useTransactionWithNotification();
  const { zkEmailInvitesAddress, zkEmailInvitesEnabled } = usePOContext();
  const { accountAddress, isAuthenticated } = useAuth();

  const [step, setStep] = useState(ZK_CLAIM_STEPS.IDLE);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);

  const reset = useCallback(() => {
    setStep(ZK_CLAIM_STEPS.IDLE);
    setError(null);
    setMeta(null);
  }, []);

  const fail = useCallback((e) => {
    setError(e);
    setStep(ZK_CLAIM_STEPS.ERROR);
    return { success: false, error: e };
  }, []);

  /**
   * @param {string} emlText - raw .eml contents the user controls
   * @returns {Promise<{success: boolean, error?: Error}>}
   */
  const claimByDomain = useCallback(
    async (emlText) => {
      setError(null);
      if (!zkEmailInvitesEnabled || !zkEmailInvitesAddress) {
        return fail(new Error('This organization does not have ZK Email invites enabled.'));
      }
      if (!isAuthenticated || !accountAddress) {
        return fail(new Error('Connect your wallet or passkey first.'));
      }
      if (!zkEmailInvites) {
        return fail(new Error('Web3 services are not ready yet — try again in a moment.'));
      }

      try {
        // 1. Prove client-side. The connected address is bound into the command, so the proof can
        //    only ever be redeemed to this account.
        setStep(ZK_CLAIM_STEPS.PROVING);
        const blueprintSlug = process.env.NEXT_PUBLIC_ZKEMAIL_BLUEPRINT || '';
        const { proof, meta: proofMeta } = await generateEmailProof({
          emlText,
          claimer: accountAddress,
          blueprintSlug,
        });
        setMeta(proofMeta);

        // 2. Best-effort: read which role(s) this domain grants, to scope the gasless paymaster
        //    budget to those hats (mirrors useClaimRole's paymasterHatIds).
        const domainHash = keccak256(toBytes((proofMeta.domain || '').toLowerCase()));
        let paymasterHatIds = [];
        try {
          const rule = await zkEmailInvites.getDomainRule(zkEmailInvitesAddress, domainHash);
          const hatIds = rule?.hatIds || rule?.[0] || [];
          paymasterHatIds = Array.from(hatIds).map((h) => h.toString());
        } catch (_) {
          // Rule read is best-effort; the claim still submits (just without a hat-scoped budget hint).
        }

        // 3. Submit. Gasless when the connected account is a smart wallet (passkey); EOA pays gas.
        setStep(ZK_CLAIM_STEPS.SUBMITTING);
        const result = await executeWithNotification(
          () => zkEmailInvites.claimRoleByDomain(zkEmailInvitesAddress, proof, accountAddress, { paymasterHatIds }),
          {
            pendingMessage: 'Claiming your role…',
            successMessage: 'Role claimed!',
            errorMessage: 'Claim failed',
            refreshEvent: 'role:claimed',
          },
        );

        if (result?.success) {
          setStep(ZK_CLAIM_STEPS.DONE);
        } else {
          setStep(ZK_CLAIM_STEPS.ERROR);
          if (result?.error) setError(result.error);
        }
        return result;
      } catch (e) {
        return fail(e);
      }
    },
    [
      zkEmailInvites,
      zkEmailInvitesAddress,
      zkEmailInvitesEnabled,
      accountAddress,
      isAuthenticated,
      executeWithNotification,
      fail,
    ],
  );

  return { claimByDomain, reset, step, error, meta };
}
