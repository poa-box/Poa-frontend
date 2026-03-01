/**
 * OrganizationService
 * Handles organization membership operations (QuickJoin)
 */

import QuickJoinABI from '../../../../abi/QuickJoinNew.json';
import UniversalAccountRegistryABI from '../../../../abi/UniversalAccountRegistry.json';
import { requireAddress, requireValidUsername } from '../utils/validation';

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
   * Join an organization without an existing account (creates account + joins)
   * Two-step process: first registers username, then joins the org.
   * @param {string} contractAddress - QuickJoin contract address
   * @param {string} username - Username for new account
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async quickJoinNoUser(contractAddress, username, options = {}) {
    requireAddress(contractAddress, 'QuickJoin contract address');
    requireValidUsername(username);

    if (!this.registryAddress) {
      throw new Error('Registry address is required for new user registration');
    }

    // Step 1: Register the username via UniversalAccountRegistry
    const registryContract = this.factory.createWritable(
      this.registryAddress,
      UniversalAccountRegistryABI
    );

    console.log("Step 1: Registering username:", username);
    const registerResult = await this.txManager.execute(
      registryContract,
      'registerAccount',
      [username],
      options
    );

    if (!registerResult.success) {
      return registerResult;
    }

    // Step 2: Join the organization (no username needed)
    console.log("Step 2: Joining organization at:", contractAddress);
    const quickJoinContract = this.factory.createWritable(contractAddress, QuickJoinABI);

    return this.txManager.execute(quickJoinContract, 'quickJoinNoUser', [], options);
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
