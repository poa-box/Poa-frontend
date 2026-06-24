/**
 * useClaimZkEmailRole
 * Orchestrates a client-side ZK Email role claim against the merkle-allowlist model:
 *   1. read the org's active allowlist (root + CID) on-chain,
 *   2. fetch the allowlist file from IPFS and assert it matches the on-chain root,
 *   3. decide the claimer's entry — a SPECIFIC-address entry for their From email if present, else a
 *      whole-DOMAIN entry for their sending domain,
 *   4. prove the matching circuit in-browser (v2 for email, v1 for domain),
 *   5. submit the claim with the entry's hatIds + merkle proof (gasless via PaymasterHub on a passkey).
 *
 * ZkEmailInvites is OPTIONAL — this hook refuses to run unless `zkEmailInvitesEnabled` (POContext).
 */

import { useCallback, useState } from 'react';
import { useWeb3Services, useTransactionWithNotification } from './useWeb3Services';
import { usePOContext } from '../context/POContext';
import { useAuth } from '../context/AuthContext';
import { useIPFScontext } from '../context/ipfsContext';
import { generateDomainProof, generateEmailAddressProof, parseEml } from '../lib/zkemail/prover';
import { emailHash, assertRootMatches, proofForDomain, proofForEmailHash } from '../lib/zkemail/allowlist';

export const ZK_CLAIM_STEPS = {
  IDLE: 'idle',
  CHECKING: 'checking',
  PROVING: 'proving',
  SUBMITTING: 'submitting',
  DONE: 'done',
  ERROR: 'error',
};

const ZERO_ROOT = '0x0000000000000000000000000000000000000000000000000000000000000000';

export function useClaimZkEmailRole() {
  const { zkEmailInvites } = useWeb3Services();
  const { executeWithNotification } = useTransactionWithNotification();
  const { zkEmailInvitesAddress, zkEmailInvitesEnabled } = usePOContext();
  const { accountAddress, isAuthenticated } = useAuth();
  const { safeFetchFromIpfs, bytes32ToIpfsCid } = useIPFScontext();

  const [step, setStep] = useState(ZK_CLAIM_STEPS.IDLE);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);

  const reset = useCallback(() => {
    setStep(ZK_CLAIM_STEPS.IDLE);
    setError(null);
    setMeta(null);
  }, []);

  const fail = useCallback((e) => {
    setError(e instanceof Error ? e : new Error(String(e)));
    setStep(ZK_CLAIM_STEPS.ERROR);
    return { success: false, error: e };
  }, []);

  /**
   * Claim a role by proving control of an email the org's allowlist invites.
   * @param {string} emlText raw .eml the user controls (sent from the address being verified)
   * @returns {Promise<{ success: boolean, error?: Error }>}
   */
  const claim = useCallback(
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
        // 1-2. Read the active allowlist and fetch + verify the file.
        setStep(ZK_CLAIM_STEPS.CHECKING);
        const { root, cid } = await zkEmailInvites.getActiveAllowlist(zkEmailInvitesAddress);
        if (!root || root === ZERO_ROOT) {
          return fail(new Error('This organization has not activated an email allowlist yet.'));
        }
        const cidStr = bytes32ToIpfsCid(cid);
        const doc = await safeFetchFromIpfs(cidStr);
        if (!doc) return fail(new Error('Could not load the allowlist file from IPFS — try again.'));
        const tree = assertRootMatches(doc, root); // throws if the file does not match the on-chain root

        // 3. Pick the claimer's entry: a specific-address entry for their From email wins, else domain.
        const { fromEmail, dkimDomain } = parseEml(emlText);
        let mode = null;
        let entry = null;
        if (fromEmail) {
          const eHash = await emailHash(fromEmail);
          entry = proofForEmailHash(tree, eHash);
          if (entry) mode = 'email';
        }
        if (!entry && dkimDomain) {
          entry = proofForDomain(tree, dkimDomain);
          if (entry) mode = 'domain';
        }
        if (!entry) {
          return fail(
            new Error(
              `Neither your address (${fromEmail || '?'}) nor your domain (@${dkimDomain || '?'}) is on this organization's allowlist.`,
            ),
          );
        }

        // 4. Prove the matching circuit (v2 for a specific address, v1 for a domain).
        setStep(ZK_CLAIM_STEPS.PROVING);
        const { proof, meta: proofMeta } =
          mode === 'email'
            ? await generateEmailAddressProof({ emlText, claimer: accountAddress })
            : await generateDomainProof({ emlText, claimer: accountAddress });
        setMeta({ mode, hatIds: entry.hatIds, ...proofMeta });

        // 5. Submit with the entry's hatIds + merkle proof; scope the gasless budget to those hats.
        setStep(ZK_CLAIM_STEPS.SUBMITTING);
        const submit =
          mode === 'email'
            ? () =>
                zkEmailInvites.claimRoleByEmail(zkEmailInvitesAddress, proof, accountAddress, entry.hatIds, entry.proof, {
                  paymasterHatIds: entry.hatIds,
                })
            : () =>
                zkEmailInvites.claimRoleByDomain(zkEmailInvitesAddress, proof, accountAddress, entry.hatIds, entry.proof, {
                  paymasterHatIds: entry.hatIds,
                });
        const result = await executeWithNotification(submit, {
          pendingMessage: 'Claiming your role…',
          successMessage: 'Role claimed!',
          errorMessage: 'Claim failed',
          refreshEvent: 'role:claimed',
        });

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
      safeFetchFromIpfs,
      bytes32ToIpfsCid,
      executeWithNotification,
      fail,
    ],
  );

  // Back-compat alias: the existing flow component calls `claimByDomain`.
  return { claim, claimByDomain: claim, reset, step, error, meta };
}
