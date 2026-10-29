/**
 * ZkEmailOnboardingService — ONE-STEP "create account + claim role by email".
 *
 * Mirrors PasskeyOnboardingService's vouch-claim shape, but against ZkEmailInvites'
 * registerAndClaimBy{Domain,Email}WithPasskey: a single gasless UserOp that
 *   1. deploys the passkey smart account (initCode, counterfactual address),
 *   2. registers the username on the UniversalAccountRegistry (EIP-712 passkey sig), and
 *   3. verifies the ZK email proof + merkle proof and mints the role hats,
 * all atomically — the on-chain twin of QuickJoin's registerAndClaimHatsWithPasskey.
 *
 * Requires the org's ZkEmailInvites proxy to have `universalFactory` set (late-bind via governance);
 * the factory MUST be the same PasskeyAccountFactory the frontend computes counterfactual addresses
 * with, or the in-circuit-bound claimer won't match the derived account and the claim reverts.
 */

import { encodeFunctionData } from 'viem';
import { PasskeyAccountAbi as PasskeyAccountABI } from '@poa-box/core/abis/PasskeyAccount';
import { PasskeyAccountFactoryAbi as PasskeyAccountFactoryABI } from '@poa-box/core/abis/PasskeyAccountFactory';
import { enrollmentJournal, submitEnrollment, reconcileEnrollment, persistPending } from '@/services/web3/domain/enrollmentSubmission';
import { UniversalAccountRegistryAbi as UniversalAccountRegistryABI } from '@poa-box/core/abis/UniversalAccountRegistry';
import { ZkEmailInvitesAbi as ZkEmailInvitesABI } from '@poa-box/core/abis/ZkEmailInvites';
import { requirePendingEnrollment } from '@/services/web3/passkey/passkeyStorage';
import { requireValidUsername } from '@/services/web3/utils/validation';
import { createPasskeyCredential } from '@/services/web3/passkey/passkeyCreate';
import { signUserOpWithPasskey, signRegistrationChallenge } from '@/services/web3/passkey/passkeySign';
import { buildUserOpWithFallback, getUserOpHash } from '@/services/web3/passkey/userOpBuilder';
import { encodeClaimPaymasterData, encodeHatPaymasterData } from '@/services/web3/passkey/paymasterData';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';

import { buildRegisterAndClaimByDomainWithPasskey, buildRegisterAndClaimByEmailWithPasskey } from '@poa-box/core/tx/zkemail';
import { canAbandonSubmissionRecovery } from '@poa-box/core/execute/recovery';
import { encodeIntent } from '@poa-box/core/tx/intent';
import { registrationChallenge } from '@poa-box/core/accounts/codecs';

const REGISTRATION_DEADLINE_SECONDS = 1209600;

import { emailProofProjection } from '@/lib/zkemail/proofProjection';

const toBig = (v) => BigInt(v);

export class ZkEmailOnboardingService {
  constructor({
    publicClient,
    bundlerClient,
    factoryAddress,
    registryAddress,
    zkEmailInvitesAddress,
    paymasterAddress,
    orgId,
    chainId,
    scopeGuard = () => {},
    submissionJournal,
    initiator,
    orgName,
  }) {
    this.scopeGuard = scopeGuard;
    this.initiator = initiator;
    this.orgName = orgName;
    this.submissionJournal = submissionJournal;
    this.publicClient = publicClient;
    this.bundlerClient = bundlerClient;
    this.factoryAddress = factoryAddress;
    this.registryAddress = registryAddress;
    this.zkEmailInvitesAddress = zkEmailInvitesAddress;
    this.paymasterAddress = paymasterAddress;
    this.orgId = orgId;
    this.chainId = chainId;
  }

  /** Read on the same org chain that receives the onboarding UserOp. */
  async getActiveAllowlist() {
    this.scopeGuard();
    const read = (functionName) => { this.scopeGuard(); return this.publicClient.readContract({
      address: this.zkEmailInvitesAddress, abi: ZkEmailInvitesABI, functionName,
    }); };
    for (let attempt = 0; ; attempt++) {
      try {
        const root = await read('merkleRoot');
        this.scopeGuard();
        const cid = await read('allowlistCid');
        this.scopeGuard();
        return { root, cid };
      } catch (error) {
        this.scopeGuard();
        if (attempt >= 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }
  }

  async isEmailRegistered(hash) {
    this.scopeGuard();
    const registered = await this.publicClient.readContract({
      address: this.zkEmailInvitesAddress, abi: ZkEmailInvitesABI,
      functionName: 'isEmailRegistered', args: [hash],
    });
    this.scopeGuard();
    return registered;
  }

  /**
   * Create a passkey credential LOCALLY (one biometric prompt, no transaction) and compute the
   * counterfactual account address — the address the verification email's subject binds the claim to.
   * @returns {{ credential: Object, accountAddress: string }}
   */
  async createPendingCredential(username) {
    this.scopeGuard();
    requireValidUsername(username);
    const pending = requirePendingEnrollment(this, { flow: 'zkemail', username });
    if (pending?.accountAddress) return { credential: pending, accountAddress: pending.accountAddress };
    if (await this.publicClient.getChainId() !== this.chainId) throw new Error('This network is unavailable. Please try again.');
    this.scopeGuard();
    // Bare email claims do not need enrollment infrastructure, but this combined path does.
    // Verify the module's factory before producing a credential/address for the claim email.
    const accountRegistry = await this.publicClient.readContract({
      address: this.zkEmailInvitesAddress, abi: ZkEmailInvitesABI, functionName: 'accountRegistry',
    });
    this.scopeGuard();
    const universalFactory = await this.publicClient.readContract({
      address: this.zkEmailInvitesAddress, abi: ZkEmailInvitesABI, functionName: 'universalFactory',
    });
    this.scopeGuard();
    if (String(accountRegistry).toLowerCase() !== this.registryAddress.toLowerCase()
      || String(universalFactory).toLowerCase() !== this.factoryAddress.toLowerCase()) {
      throw new Error('Creating an account while claiming an email invite is not configured for this org. Sign in with an existing account to claim.');
    }
    const credential = pending || await createPasskeyCredential(username);
    if (!pending) persistPending(this, { ...credential, flow: 'zkemail' }, null, username);
    this.scopeGuard();
    const accountAddress = await this.publicClient.readContract({
      address: this.factoryAddress,
      abi: PasskeyAccountFactoryABI,
      functionName: 'getAddress',
      args: [credential.credentialId, credential.publicKeyX, credential.publicKeyY, BigInt(credential.salt)],
    });
    this.scopeGuard();
    persistPending(this, { ...credential, flow: 'zkemail' }, accountAddress, username);
    return { credential, accountAddress };
  }

  /**
   * Submit the single UserOp: deploy account + register username + claim the role hats.
   *
   * @param {Object} p
   * @param {Object} p.credential  pending credential ({credentialId, publicKeyX, publicKeyY, salt, rawCredentialId})
   * @param {string} p.accountAddress counterfactual account (the proof's bound claimer)
   * @param {string} p.username
   * @param {'domain'|'email'} p.mode which claim circuit the proof is for
   * @param {Object} p.proof formatted proof from prover.js (hex fields)
   * @param {Array}  p.hatIds entry's hat IDs (decimal strings)
   * @param {Array}  p.merkleProof bytes32[] proof for the entry's leaf
   * @param {Function} [p.onStep] progress callback: 'signing_registration' | 'signing' | 'submitting' | 'confirming'
   * @returns {{ accountAddress, transactionHash }}
   */
  async registerAndClaim({ credential, accountAddress, username, mode, proof, hatIds, merkleProof, onStep = () => {} }) {
    const report = onStep;
    onStep = (...args) => { this.scopeGuard(); report(...args); };
    this.scopeGuard();
    if (!['domain', 'email'].includes(mode)) throw new Error('Unknown email claim mode.');
    const projectedProof = emailProofProjection(proof, mode === 'email' ? 'v2' : 'v1', accountAddress);
    const { credentialId, publicKeyX, publicKeyY, rawCredentialId } = credential;
    const salt = toBig(credential.salt);

    let confirmed;
    try { confirmed = await submitEnrollment(this, { credential, accountAddress, username,
      onConfirming: () => onStep('confirming'),
      prepare: async (initCode, { prepareForSigning }) => {
        // Registry EIP-712 registration challenge (same machinery as QuickJoin's WithPasskey path).
        const nonce = await this.publicClient.readContract({
          address: this.registryAddress,
          abi: UniversalAccountRegistryABI,
          functionName: 'nonces',
          args: [accountAddress],
        });
        this.scopeGuard();
        const deadline = BigInt(Math.floor(Date.now() / 1000) + REGISTRATION_DEADLINE_SECONDS);
        const challengeHash = registrationChallenge({
          user: accountAddress,
          username,
          nonce,
          deadline,
          chainId: this.chainId,
          registryAddress: this.registryAddress,
        }, 'passkey');
        onStep('signing_registration');
        const auth = await signRegistrationChallenge(challengeHash, rawCredentialId);

        this.scopeGuard();
        const builder = mode === 'email' ? buildRegisterAndClaimByEmailWithPasskey : buildRegisterAndClaimByDomainWithPasskey;
        const inner = encodeIntent(builder({
          zkEmailInvitesAddress: this.zkEmailInvitesAddress, orgId: this.orgId, claimer: accountAddress,
          passkey: { credentialId, publicKeyX, publicKeyY, salt }, username, deadline, nonce, auth,
          proof: projectedProof, hatIds, merkleProof,
        })).data;
        const callData = encodeFunctionData({
          abi: PasskeyAccountABI,
          functionName: 'execute',
          args: [this.zkEmailInvitesAddress, 0n, inner],
        });

        // CLAIM subject (0x05) first: the hub binds the op to the ZkEmailInvites proxy and does NO
        // eligibility pre-check — required for a FRESH account's first claim (a HAT subject fails
        // validation before the claim can grant eligibility). Budget: keccak(0x05, proxy). The entry
        // hats follow as fallback subjects for orgs whose claim budget isn't configured yet.
        const paymasterDataEntries = [
          encodeClaimPaymasterData({ claimTarget: this.zkEmailInvitesAddress, orgId: this.orgId }),
          ...hatIds.map((hatId) => encodeHatPaymasterData({ hatId, orgId: this.orgId })),
        ];
        const userOp = await buildUserOpWithFallback({
          sender: accountAddress,
          callData,
          bundlerClient: this.bundlerClient,
          publicClient: this.publicClient,
          initCode,
          paymasterAddress: this.paymasterAddress,
          paymasterDataEntries,
        });

        onStep('signing');
        const userOpHash = getUserOpHash(userOp, ENTRY_POINT_ADDRESS, this.chainId);
        prepareForSigning(userOp);
        userOp.signature = await signUserOpWithPasskey(userOpHash, rawCredentialId);

        onStep('submitting');
        return userOp;
      },
    }); } catch (error) {
      // The shared enrollment host may annotate a signing cancellation before its finally
      // abandons the unsent journal. Preserve the actual refusal once that cleanup is proven.
      if (error.category === 'submission_unknown' && error.submission?.recovery
        && canAbandonSubmissionRecovery(error.submission.recovery) && !this.getPendingSubmission(accountAddress)) {
        delete error.category; delete error.userMessage; delete error.submission;
      }
      throw error;
    }
    const { receipt } = confirmed;
    return {
      accountAddress,
      transactionHash: receipt.transactionHash,
      // Callers thread this into the subgraph-sync + refresh machinery (role:claimed).
      blockNumber: Number(receipt.blockNumber),
    };
  }

  getPendingSubmission(accountAddress) { return enrollmentJournal(this, accountAddress).read(); }

  reconcileSubmission(submission = this.lastSubmission) { return reconcileEnrollment(this, submission); }
}

export function createZkEmailOnboardingService(params) {
  return new ZkEmailOnboardingService(params);
}
