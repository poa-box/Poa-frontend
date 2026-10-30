/**
 * PasskeyOnboardingService
 * Orchestrates the full passkey onboarding flow:
 * 1. Create WebAuthn credential (biometric prompt)
 * 2. Compute counterfactual smart account address
 * 3. Sign registration challenge (biometric prompt — proves passkey ownership for username registration)
 * 4. Build UserOp with initCode (account deployment) + callData (registerAndQuickJoin)
 * 5. Sign UserOp hash with passkey (biometric prompt)
 * 6. Submit to bundler
 * 7. Wait for receipt
 */

import { encodeFunctionData } from 'viem';
import { computeCounterfactualAddress } from '@poa-box/core/browser/passkeys';
import { encodeIntent } from '@poa-box/core/tx/intent';
import { buildRegisterAccount, buildRegisterAndQuickJoinWithPasskey } from '@poa-box/core/tx/user';
import { PasskeyAccountAbi as PasskeyAccountABI } from '@poa-box/core/abis/PasskeyAccount';
import { UniversalAccountRegistryAbi as UniversalAccountRegistryABI } from '@poa-box/core/abis/UniversalAccountRegistry';
import { requireValidUsername } from '@/services/web3/utils/validation';
import { createPasskeyCredential } from '@/services/web3/passkey/passkeyCreate';
import { signUserOpWithPasskey, signRegistrationChallenge } from '@/services/web3/passkey/passkeySign';
import { buildUserOp, getUserOpHash } from '@/services/web3/passkey/userOpBuilder';
import { encodeOnboardingPaymasterData, encodeSolidarityOnboardingPaymasterData } from '@/services/web3/passkey/paymasterData';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';
import { NETWORKS, DEFAULT_NETWORK } from '@/config/networks';

import { registrationChallenge } from '@poa-box/core/accounts/codecs';
import { enrollmentJournal, submitEnrollment, reconcileEnrollment, persistPending } from '@/services/web3/domain/enrollmentSubmission';
import { requirePendingEnrollment, readPendingEnrollment, savePendingCredential } from '@/services/web3/passkey/passkeyStorage';
import { reconcileUserOperationSubmission } from '@/services/web3/core/userOperationSubmission';
import { pendingSubmissionError } from '@/services/web3/core/submissionJournal';

// Host registration deadline: 14 days; retained during protocol migration.
const REGISTRATION_DEADLINE_SECONDS = 1209600;

/**
 * Onboarding step identifiers for progress tracking
 */
export const OnboardingStep = {
  IDLE: 'idle',
  CHECKING_USERNAME: 'checking_username',
  CREATING_CREDENTIAL: 'creating_credential',
  COMPUTING_ADDRESS: 'computing_address',
  BUILDING_TRANSACTION: 'building_transaction',
  SIGNING_REGISTRATION: 'signing_registration',
  SIGNING: 'signing',
  SUBMITTING: 'submitting',
  CONFIRMING: 'confirming',
  SUCCESS: 'success',
  ERROR: 'error',
};

/**
 * Step descriptions for UI display
 */
export const STEP_MESSAGES = {
  [OnboardingStep.CHECKING_USERNAME]: 'Checking your username...',
  [OnboardingStep.CREATING_CREDENTIAL]: 'Creating your passkey...',
  [OnboardingStep.COMPUTING_ADDRESS]: 'Computing your account address...',
  [OnboardingStep.BUILDING_TRANSACTION]: 'Preparing your account...',
  [OnboardingStep.SIGNING_REGISTRATION]: 'Sign with your passkey to register your username...',
  [OnboardingStep.SIGNING]: 'Sign with your passkey to confirm...',
  [OnboardingStep.SUBMITTING]: 'Submitting to the network...',
  [OnboardingStep.CONFIRMING]: 'Confirming your account...',
  [OnboardingStep.SUCCESS]: 'Account created successfully!',
  [OnboardingStep.ERROR]: 'Something went wrong.',
};

export class PasskeyOnboardingService {
  /**
   * @param {Object} params
   * @param {Object} params.publicClient - viem public client
   * @param {Object} params.bundlerClient - Pimlico bundler client
   * @param {string} params.factoryAddress - PasskeyAccountFactory address
   * @param {string} params.registryAddress - UniversalAccountRegistry address
   * @param {string} [params.quickJoinAddress] - QuickJoin contract address (org mode only)
   * @param {string} params.paymasterAddress - PaymasterHub proxy address
   * @param {string} [params.orgId] - bytes32 org ID (org mode only)
   * @param {string} [params.mode='org'] - 'org' for org-scoped onboarding, 'solidarity' for protocol-level
   */
  constructor({ publicClient, bundlerClient, factoryAddress, registryAddress, quickJoinAddress, paymasterAddress, orgId, mode = 'org', hatId, chainId = null, scopeGuard = () => {}, submissionJournal, initiator, orgName }) {
    this.scopeGuard = scopeGuard;
    this.initiator = initiator;
    this.orgName = orgName;
    this.submissionJournal = submissionJournal;
    this.publicClient = publicClient;
    this.bundlerClient = bundlerClient;
    this.factoryAddress = factoryAddress;
    this.registryAddress = registryAddress;
    this.quickJoinAddress = quickJoinAddress;
    this.paymasterAddress = paymasterAddress;
    this.orgId = orgId;
    this.mode = mode;
    this.hatId = hatId;
    this.chainId = chainId || NETWORKS[DEFAULT_NETWORK].chainId;
  }

  /**
   * Compute the counterfactual address for a credential without deploying.
   */
  static async computeCounterfactualAddress(publicClient, factoryAddress, credential) {
    return computeCounterfactualAddress(publicClient, factoryAddress, credential);
  }

  /**
   * Query the registry nonce for an account address.
   * For new (undeployed) accounts this returns 0n.
   */
  async _getRegistryNonce(accountAddress) {
    return this.publicClient.readContract({
      address: this.registryAddress,
      abi: UniversalAccountRegistryABI,
      functionName: 'nonces',
      args: [accountAddress],
    });
  }

  async _requireAvailableUsername(username) {
    this.scopeGuard();
    const owner = await this.publicClient.readContract({
      address: this.registryAddress, abi: UniversalAccountRegistryABI,
      functionName: 'getAddressOfUsername', args: [username],
    });
    this.scopeGuard();
    if (typeof owner !== 'string' || !/^0x[\da-f]{40}$/i.test(owner)) {
      throw new Error('Could not check this username. Please try again.');
    }
    if (!/^0x0{40}$/i.test(owner)) {
      throw Object.assign(new Error('This username is already taken. Choose another.'), { code: 'USERNAME_TAKEN' });
    }
  }

  _requireUnchangedPending(expected) {
    this.scopeGuard();
    const current = requirePendingEnrollment(this, { flow: 'onboarding', username: expected.username });
    if (!current || JSON.stringify(current) !== JSON.stringify(expected)) {
      throw new Error('Your saved account setup changed. Check its status again.');
    }
    return current;
  }

  /** Rename only the same unsent/definitely failed setup under its account lock. */
  async _prepareUsername(username) {
    const pending = requirePendingEnrollment(this, { flow: 'onboarding' });
    if (pending?.confirmation?.status === 'succeeded') throw new Error('Your earlier account setup is confirmed. Check its status to continue.');
    if (pending?.confirmation != null && pending.confirmation.status !== 'failed') {
      throw new Error('Check your earlier account setup before trying again.');
    }
    if (!pending || pending.username === username) {
      await this._requireAvailableUsername(username);
      this.scopeGuard();
      if (pending) this._requireUnchangedPending(pending);
      return pending;
    }
    const saved = readPendingEnrollment(this);
    if (saved?.provenance !== 'matched' || pending.sourceProvenance !== 'observed'
      || !pending.initiator || !this.initiator) {
      throw new Error('Finish or check your earlier account setup before changing its username.');
    }
    const accountAddress = await computeCounterfactualAddress(this.publicClient, this.factoryAddress, pending);
    this.scopeGuard(); this._requireUnchangedPending(pending);
    if (pending.accountAddress && pending.accountAddress.toLowerCase() !== accountAddress.toLowerCase()) {
      throw new Error('We couldn’t verify your saved account. Please check your earlier account setup.');
    }
    const journal = enrollmentJournal(this, accountAddress);
    const release = await journal.acquire();
    try {
      this.scopeGuard(); journal.assertLease();
      journal.abandonUnsent();
      if (journal.readPendingAccount()) throw pendingSubmissionError(journal.readPendingAccount());
      this._requireUnchangedPending(pending);
      if (pending.confirmation != null) {
        const confirmation = pending.confirmation;
        if (confirmation.chainId !== this.chainId || confirmation.accountAddress?.toLowerCase() !== accountAddress.toLowerCase()
          || confirmation.sender?.toLowerCase() !== accountAddress.toLowerCase()
          || confirmation.entryPoint?.toLowerCase() !== ENTRY_POINT_ADDRESS.toLowerCase()
          || !/^0x[\da-f]{64}$/i.test(confirmation.transactionHash || '')
          || !/^0x[\da-f]{64}$/i.test(confirmation.computedHash || '') || confirmation.nonce == null) {
          throw new Error('The earlier account setup could not be verified. Check its status again.');
        }
        const result = await reconcileUserOperationSubmission({ ...confirmation, txHash: confirmation.transactionHash }, this.bundlerClient, this.publicClient);
        this.scopeGuard(); journal.assertLease(); this._requireUnchangedPending(pending);
        if (result.outcome.status !== 'failed') throw new Error('Check your earlier account setup before changing its username.');
      }
      await this._requireAvailableUsername(username);
      this.scopeGuard(); journal.assertLease(); this._requireUnchangedPending(pending);
      if (journal.readPendingAccount()) throw pendingSubmissionError(journal.readPendingAccount());
      // Preserve the original credential/account/source and failure evidence.
      savePendingCredential({ ...pending, username });
      return requirePendingEnrollment(this, { flow: 'onboarding', username });
    } finally { await release(); }
  }

  /**
   * Build the callData for org-mode onboarding using registerAndQuickJoinWithPasskey.
   * Signs the registration challenge (biometric prompt) and encodes the execute call.
   *
   * @param {Object} credential - { credentialId, publicKeyX, publicKeyY, salt, rawCredentialId }
   * @param {string} accountAddress - Counterfactual account address
   * @param {string} username - Username to register
   * @param {Function} onStep - Progress callback
   * @returns {string} Encoded callData for the UserOp
   */
  async _buildOrgModeCallData(credential, accountAddress, username, onStep) {
    const { credentialId, publicKeyX, publicKeyY, salt, rawCredentialId } = credential;

    // Query registry nonce (0 for new accounts)
    const nonce = await this._getRegistryNonce(accountAddress);
    this.scopeGuard();
    const deadline = BigInt(Math.floor(Date.now() / 1000) + REGISTRATION_DEADLINE_SECONDS);

    // Compute the EIP-712 registration challenge
    const challengeHash = registrationChallenge({
      user: accountAddress,
      username,
      nonce,
      deadline,
      chainId: this.chainId,
      registryAddress: this.registryAddress,
    }, 'passkey');

    // Sign registration challenge with passkey (biometric prompt)
    onStep(OnboardingStep.SIGNING_REGISTRATION);
    const auth = await signRegistrationChallenge(challengeHash, rawCredentialId);

    this.scopeGuard();
    const registerAndJoinData = encodeIntent(buildRegisterAndQuickJoinWithPasskey({
      quickJoinAddress: this.quickJoinAddress, orgId: this.orgId,
      passkey: { credentialId, publicKeyX, publicKeyY, salt }, username, deadline, nonce, auth,
    })).data;

    return encodeFunctionData({
      abi: PasskeyAccountABI,
      functionName: 'execute',
      args: [this.quickJoinAddress, 0n, registerAndJoinData],
    });
  }

  /**
   * Execute the full onboarding flow.
   *
   * @param {string} username - Username to register
   * @param {Function} [onStep] - Callback for step changes: (step, data) => {}
   * @returns {Object} { accountAddress, credentialId, publicKeyX, publicKeyY, rawCredentialId, salt }
   */
  async onboard(username, onStep = () => {}) {
    const report = onStep;
    onStep = (...args) => { this.scopeGuard(); report(...args); };
    try {
      this.scopeGuard();
      requireValidUsername(username);
      if (await this.publicClient.getChainId() !== this.chainId) throw new Error('This network is unavailable. Please try again.');
      this.scopeGuard();
      onStep(OnboardingStep.CHECKING_USERNAME);
      const pending = await this._prepareUsername(username);
      this.scopeGuard();
      // Step 1: Create passkey credential (biometric prompt #1)
      onStep(OnboardingStep.CREATING_CREDENTIAL);
      if (pending && (pending.username !== username || pending.credentialChainId !== this.chainId
        || pending.registryAddress?.toLowerCase() !== this.registryAddress.toLowerCase()
        || pending.factoryAddress?.toLowerCase() !== this.factoryAddress.toLowerCase())) {
        throw new Error('Finish or check your earlier account setup before creating another account.');
      }
      const credential = pending ? { ...pending, salt: BigInt(pending.salt) } : await createPasskeyCredential(username);
      // Preserve a completed local ceremony even if its captured UI changed during the prompt.
      if (!pending) persistPending(this, credential, null, username);
      this.scopeGuard();
      const { credentialId, publicKeyX, publicKeyY, rawCredentialId, salt } = credential;


      // Step 2: Compute counterfactual address
      onStep(OnboardingStep.COMPUTING_ADDRESS);
      const accountAddress = await computeCounterfactualAddress(this.publicClient, this.factoryAddress, credential);
      this.scopeGuard();
      if (pending) this._requireUnchangedPending(pending);
      if (pending?.accountAddress && pending.accountAddress.toLowerCase() !== accountAddress.toLowerCase()) {
        throw new Error('We couldn’t verify your saved account. Please check your earlier account setup.');
      }


      persistPending(this, credential, accountAddress, username);
      // A name may be claimed while the credential prompt was open. Keep the
      // saved passkey but stop before registration signing if that happened.
      await this._requireAvailableUsername(username);
      this.scopeGuard();
      // Step 3: Build the UserOp
      onStep(OnboardingStep.BUILDING_TRANSACTION);

      const { receipt } = await submitEnrollment(this, { credential, accountAddress, username,
        onConfirming: () => onStep(OnboardingStep.CONFIRMING),
        prepare: async (initCode, { prepareForSigning }) => {
          // Build callData and paymasterData based on mode
          let callData;
          let paymasterData;

          if (this.mode === 'solidarity') {
            // Solidarity mode: deploy + register username (contract whitelists registerAccount)
            const registerCallData = encodeIntent(buildRegisterAccount({
              registryAddress: this.registryAddress, username,
            })).data;
            callData = encodeFunctionData({
              abi: PasskeyAccountABI,
              functionName: 'execute',
              args: [this.registryAddress, 0n, registerCallData],
            });
            paymasterData = encodeSolidarityOnboardingPaymasterData();
          } else {
            // Org mode: registerAndQuickJoinWithPasskey
            // The paymaster sponsors the UserOp against this hat's shared org budget, so a
            // hat ID is mandatory. Guard before the registration challenge so a misconfigured
            // call fails fast with a clear message instead of prompting for a second biometric
            // and then throwing "Cannot convert undefined to a BigInt" deep in paymaster encoding.
            if (this.hatId === undefined || this.hatId === null) {
              throw new Error('Account creation is not configured for this organization. Please try again later.');
            }

            // This signs the registration challenge (biometric prompt #2)
            callData = await this._buildOrgModeCallData(credential, accountAddress, username, onStep);

            paymasterData = encodeOnboardingPaymasterData({
              hatId: this.hatId,
              orgId: this.orgId,
            });
          }

          const userOp = await buildUserOp({
            sender: accountAddress,
            callData,
            bundlerClient: this.bundlerClient,
            publicClient: this.publicClient,
            initCode,
            paymasterAddress: this.paymasterAddress,
            paymasterData,
          });

          // Step 4: Sign UserOp hash with passkey (biometric prompt #3 for org, #2 for solidarity)
          onStep(OnboardingStep.SIGNING);
          const userOpHash = getUserOpHash(
            userOp,
            ENTRY_POINT_ADDRESS,
            this.chainId,
          );
          prepareForSigning(userOp);
          const signature = await signUserOpWithPasskey(userOpHash, rawCredentialId);
          userOp.signature = signature;

          onStep(OnboardingStep.SUBMITTING);
          return userOp;
        },
      });

      // Step 7: Success
      const result = {
        accountAddress,
        credentialId,
        publicKeyX,
        publicKeyY,
        rawCredentialId,
        salt: salt.toString(),
        transactionHash: receipt.transactionHash,
      };

      try { onStep(OnboardingStep.SUCCESS, result); } catch { /* Keep the confirmed original result if progress scope expired. */ }
      return result;

    } catch (error) {
      // An obsolete progress callback must not replace the original submission error.
      try { onStep(OnboardingStep.ERROR, { error }); } catch { /* New scope owns the UI. */ }
      throw error;
    }
  }

  getPendingSubmission(accountAddress) { return enrollmentJournal(this, accountAddress).read(); }

  reconcileSubmission(submission = this.lastSubmission) { return reconcileEnrollment(this, submission); }
}

/**
 * Create a PasskeyOnboardingService instance.
 */
export function createPasskeyOnboardingService(params) {
  return new PasskeyOnboardingService(params);
}
