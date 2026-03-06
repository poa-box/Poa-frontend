/**
 * OrganizationService
 * Handles organization membership operations (QuickJoin)
 */

import QuickJoinABI from '../../../../abi/QuickJoinNew.json';
import UniversalAccountRegistryABI from '../../../../abi/UniversalAccountRegistry.json';
import { requireAddress, requireValidUsername } from '../utils/validation';
import { signRegistrationChallenge, computeRegistrationChallenge } from '../passkey/passkeySign';
import { NETWORKS, DEFAULT_NETWORK } from '../../../config/networks';

const networkConfig = NETWORKS[DEFAULT_NETWORK];

// Registration deadline: 5 minutes
const REGISTRATION_DEADLINE_SECONDS = 300;

/**
 * OrganizationService - Organization membership management
 */
export class OrganizationService {
  /**
   * @param {ContractFactory} contractFactory - Contract factory instance
   * @param {TransactionManager} transactionManager - Transaction manager instance
   * @param {string} [registryAddress] - UniversalAccountRegistry address for new user registration
   */
  constructor(contractFactory, transactionManager, registryAddress = null) {
    this.factory = contractFactory;
    this.txManager = transactionManager;
    this.registryAddress = registryAddress;
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
    requireAddress(contractAddress, 'QuickJoin contract address');
    requireValidUsername(username);

    if (!this.registryAddress) {
      throw new Error('Registry address is required for new user registration');
    }

    const { credentialId, publicKeyX, publicKeyY, salt, rawCredentialId } = credential;
    const accountAddress = this.txManager.accountAddress;

    // Query registry nonce for this account (0 for accounts that haven't registered)
    const registryContract = this.factory.createReadOnly(this.registryAddress, UniversalAccountRegistryABI);
    const nonce = BigInt(await registryContract.nonces(accountAddress));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + REGISTRATION_DEADLINE_SECONDS);

    // Compute and sign the registration challenge (biometric prompt #1)
    const challengeHash = computeRegistrationChallenge({
      accountAddress,
      username,
      nonce,
      deadline,
      chainId: networkConfig.chainId,
      registryAddress: this.registryAddress,
    });

    console.log('[OrganizationService] Signing registration challenge...');
    const auth = await signRegistrationChallenge(challengeHash, rawCredentialId);

    // Call registerAndQuickJoinWithPasskey on QuickJoin
    // SmartAccountTransactionManager wraps this in execute() and signs the UserOp (biometric prompt #2)
    console.log('[OrganizationService] Calling registerAndQuickJoinWithPasskey...');
    const quickJoinContract = this.factory.createWritable(contractAddress, QuickJoinABI);

    return this.txManager.execute(
      quickJoinContract,
      'registerAndQuickJoinWithPasskey',
      [
        [credentialId, publicKeyX, publicKeyY, BigInt(salt)],
        username,
        deadline,
        nonce,
        [auth.authenticatorData, auth.clientDataJSON, auth.challengeIndex, auth.typeIndex, auth.r, auth.s],
      ],
      options
    );
  }

  /**
   * Join an organization with an existing account
   * @param {string} contractAddress - QuickJoin contract address
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async quickJoinWithUser(contractAddress, options = {}) {
    requireAddress(contractAddress, 'QuickJoin contract address');

    const contract = this.factory.createWritable(contractAddress, QuickJoinABI);

    return this.txManager.execute(contract, 'quickJoinWithUser', [], options);
  }
}

/**
 * Create an OrganizationService instance
 * @param {ContractFactory} factory - Contract factory
 * @param {TransactionManager} txManager - Transaction manager
 * @param {string} [registryAddress] - UniversalAccountRegistry address
 * @returns {OrganizationService}
 */
export function createOrganizationService(factory, txManager, registryAddress = null) {
  return new OrganizationService(factory, txManager, registryAddress);
}
