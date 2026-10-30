/**
 * OrganizationService
 * Handles organization membership operations (QuickJoin)
 */

import { UniversalAccountRegistryAbi as UniversalAccountRegistryABI } from '@poa-box/core/abis/UniversalAccountRegistry';
import { requireAddress, requireValidUsername } from '@/services/web3/utils/validation';
import { signRegistrationChallenge } from '@/services/web3/passkey/passkeySign';
import { signRegistration } from '@/services/web3/utils/registrySigner';
import { NETWORKS, DEFAULT_NETWORK } from '@/config/networks';

import { buildQuickJoinWithUser, buildRegisterAndQuickJoin, buildRegisterAndQuickJoinWithPasskey } from '@poa-box/core/tx/user';
import { executeCoreIntent } from '@/services/web3/core/coreIntent';
import { pendingSubmissionError } from '@/services/web3/core/submissionJournal';

import { registrationChallenge } from '@poa-box/core/accounts/codecs';

// Host registration deadline: 14 days; retained during protocol migration.
const REGISTRATION_DEADLINE_SECONDS = 1209600;

/**
 * OrganizationService - Organization membership management
 */
export class OrganizationService {
  /**
   * @param {ContractFactory} contractFactory - Contract factory instance
   * @param {TransactionManager} transactionManager - Transaction manager instance
   * @param {string} [registryAddress] - UniversalAccountRegistry address for new user registration
   * @param {number} [chainId] - Chain ID for registration challenge (defaults to home chain)
   */
  constructor(contractFactory, transactionManager, registryAddress = null, chainId = null) {
    this.factory = contractFactory;
    this.txManager = transactionManager;
    this.registryAddress = registryAddress;
    this.chainId = chainId || NETWORKS[DEFAULT_NETWORK].chainId;
  }

  /**
   * Register a username and join an organization via registerAndQuickJoinWithPasskey.
   * Combines registration + org join into a single atomic contract call.
   *
   * Requires two biometric prompts:
   *   1. Sign the registration challenge (proves passkey ownership for username)
   *   2. Sign the UserOp (handled by SmartAccountTransactionManager)
   *
   * @param {string} contractAddress - QuickJoin contract address
   * @param {string} username - Username for new account
   * @param {Object} credential - Passkey credential { credentialId, publicKeyX, publicKeyY, salt, rawCredentialId }
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async registerAndJoinNewUser(contractAddress, username, credential, options = {}) {
    const guard = () => {
      this.txManager.assertCurrent?.();
      const pending = this.txManager.getPendingSubmission?.();
      if (pending) throw pendingSubmissionError(pending);
    };
    guard();
    requireAddress(contractAddress, 'QuickJoin contract address');
    requireValidUsername(username);

    if (!this.registryAddress) {
      throw new Error('Registry address is required for new user registration');
    }

    const { credentialId, publicKeyX, publicKeyY, salt, rawCredentialId } = credential;
    const accountAddress = this.txManager.accountAddress;

    // Query registry nonce for this account (0 for accounts that haven't registered).
    // Passkey: use chain-routed viem client (ethers provider may be on a different chain).
    // EOA: use ethers via contract factory (signer's provider is on the correct chain after auto-switch).
    let nonce;
    if (this.txManager.publicClient) {
      nonce = BigInt(await this.txManager.publicClient.readContract({
        address: this.registryAddress,
        abi: UniversalAccountRegistryABI,
        functionName: 'nonces',
        args: [accountAddress],
      }));
    } else {
      const registryContract = this.factory.createReadOnly(this.registryAddress, UniversalAccountRegistryABI);
      nonce = BigInt(await registryContract.nonces(accountAddress));
    }
    guard();
    const deadline = BigInt(Math.floor(Date.now() / 1000) + REGISTRATION_DEADLINE_SECONDS);

    // Compute and sign the registration challenge (biometric prompt #1)
    const challengeHash = registrationChallenge({
      user: accountAddress,
      username,
      nonce,
      deadline,
      chainId: this.chainId,
      registryAddress: this.registryAddress,
    }, 'passkey');

    const auth = await signRegistrationChallenge(challengeHash, rawCredentialId);
    guard();

    return executeCoreIntent(this.factory, this.txManager, buildRegisterAndQuickJoinWithPasskey({
      quickJoinAddress: contractAddress,
      passkey: { credentialId, publicKeyX, publicKeyY, salt },
      username, deadline, nonce, auth,
    }), options);
  }

  /**
   * Register a username and join an organization via registerAndQuickJoin (EOA wallets).
   * Uses EIP-712 signature for username registration.
   *
   * @param {string} contractAddress - QuickJoin contract address
   * @param {string} username - Username for new account
   * @param {ethers.Signer} signer - Ethers signer for the EOA wallet
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async registerAndJoinEOA(contractAddress, username, signer, options = {}) {
    const guard = () => {
      this.txManager.assertCurrent?.();
      const pending = this.txManager.getPendingSubmission?.();
      if (pending) throw pendingSubmissionError(pending);
    };
    guard();
    requireAddress(contractAddress, 'QuickJoin contract address');
    requireValidUsername(username);

    if (!this.registryAddress) {
      throw new Error('Registry address is required for new user registration');
    }

    // Sign registration via EIP-712
    const { deadline, nonce, signature } = await signRegistration({
      signer,
      registryAddress: this.registryAddress,
      username,
      guard,
    });
    guard();

    const userAddress = await signer.getAddress();
    guard();

    return executeCoreIntent(this.factory, this.txManager, buildRegisterAndQuickJoin({
      quickJoinAddress: contractAddress, user: userAddress, username,
      deadline: deadline.toString(), nonce: nonce.toString(), signature,
    }), options);
  }

  /**
   * Join an organization with an existing account
   * @param {string} contractAddress - QuickJoin contract address
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async quickJoinWithUser(contractAddress, options = {}) {
    requireAddress(contractAddress, 'QuickJoin contract address');

    return executeCoreIntent(this.factory, this.txManager,
      buildQuickJoinWithUser({ quickJoinAddress: contractAddress }), options);
  }


}

/**
 * Create an OrganizationService instance
 * @param {ContractFactory} factory - Contract factory
 * @param {TransactionManager} txManager - Transaction manager
 * @param {string} [registryAddress] - UniversalAccountRegistry address
 * @returns {OrganizationService}
 */
export function createOrganizationService(factory, txManager, registryAddress = null, chainId = null) {
  return new OrganizationService(factory, txManager, registryAddress, chainId);
}
