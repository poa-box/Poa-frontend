/**
 * TokenRequestService
 * Handles ParticipationToken request/approval operations
 */

import { ethers } from 'ethers';
import { ParticipationTokenAbi as ParticipationTokenABI } from '@poa-box/core/abis/ParticipationToken';
import { parseRequestAmount, buildRequestTokens, buildApproveRequest, buildCancelRequest } from '@poa-box/core/tx/token';
import { buildTokenRequestMetadataAtSeconds, serializeTokenRequestMetadata } from '@poa-box/core/metadata/token';
import { executeCoreIntent } from '@/services/web3/core/coreIntent';
import { requireAddress } from '@/services/web3/utils/validation';

/**
 * TokenRequestService - Token request and approval management
 */
export class TokenRequestService {
  /**
   * @param {ContractFactory} contractFactory - Contract factory instance
   * @param {TransactionManager} transactionManager - Transaction manager instance
   * @param {Object} ipfsService - IPFS service for metadata storage
   */
  constructor(contractFactory, transactionManager, ipfsService = null) {
    this.factory = contractFactory;
    this.txManager = transactionManager;
    this.ipfs = ipfsService;
  }

  // ============================================
  // Request Functions
  // ============================================

  /**
   * Request participation tokens with IPFS-stored justification
   * @param {string} contractAddress - ParticipationToken contract address
   * @param {number|string} amount - Amount of tokens to request (in token units, not wei)
   * @param {Object} metadata - Request metadata to store in IPFS
   * @param {string} metadata.reason - Reason/justification for the request
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async requestTokens(contractAddress, amount, metadata, options = {}) {
    requireAddress(contractAddress, 'ParticipationToken contract address');
    // Parse and bound before storage, preserving all 18 decimal places.
    const amountWei = parseRequestAmount(amount);

    if (!metadata?.reason || metadata.reason.trim() === '') {
      throw new Error('Request reason is required');
    }

    // Upload metadata to IPFS
    // Use ipfsService from options if constructor didn't receive one
    const ipfsService = this.ipfs || options.ipfsService;
    if (!ipfsService) {
      throw new Error('IPFS service required for token requests');
    }

    const ipfsData = buildTokenRequestMetadataAtSeconds(metadata.reason, Math.floor(Date.now() / 1000));
    const ipfsResult = await ipfsService.addToIpfs(serializeTokenRequestMetadata(ipfsData));
    return executeCoreIntent(this.factory, this.txManager,
      buildRequestTokens({ participationTokenAddress: contractAddress, amountWei, ipfsHash: ipfsResult.path }), options);
  }

  // ============================================
  // Approval Functions
  // ============================================

  /**
   * Approve a token request (mints tokens to requester)
   * @param {string} contractAddress - ParticipationToken contract address
   * @param {number|string} requestId - Request ID to approve
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async approveRequest(contractAddress, requestId, options = {}) {
    requireAddress(contractAddress, 'ParticipationToken contract address');

    return executeCoreIntent(this.factory, this.txManager,
      buildApproveRequest({ participationTokenAddress: contractAddress, requestId: ethers.BigNumber.from(requestId) }), options);
  }

  // ============================================
  // Cancel Functions
  // ============================================

  /**
   * Cancel a pending token request
   * Can be called by requester or approver
   * @param {string} contractAddress - ParticipationToken contract address
   * @param {number|string} requestId - Request ID to cancel
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async cancelRequest(contractAddress, requestId, options = {}) {
    requireAddress(contractAddress, 'ParticipationToken contract address');

    return executeCoreIntent(this.factory, this.txManager,
      buildCancelRequest({ participationTokenAddress: contractAddress, requestId: ethers.BigNumber.from(requestId) }), options);
  }

  // ============================================
  // View Functions
  // ============================================

  /**
   * Get details of a specific request
   * @param {string} contractAddress - ParticipationToken contract address
   * @param {number|string} requestId - Request ID to query
   * @returns {Promise<Object>} Request details { requester, amount, approved, ipfsHash }
   */
  async getRequest(contractAddress, requestId) {
    requireAddress(contractAddress, 'ParticipationToken contract address');

    const contract = this.factory.createReadOnly(contractAddress, ParticipationTokenABI);
    const id = ethers.BigNumber.from(requestId);

    const result = await contract.requests(id);

    return {
      requester: result.requester,
      amount: result.amount.toString(),
      approved: result.approved,
      ipfsHash: result.ipfsHash,
    };
  }

  /**
   * Get current request counter (next request ID)
   * @param {string} contractAddress - ParticipationToken contract address
   * @returns {Promise<string>} Current request counter
   */
  async getRequestCounter(contractAddress) {
    requireAddress(contractAddress, 'ParticipationToken contract address');

    const contract = this.factory.createReadOnly(contractAddress, ParticipationTokenABI);
    const counter = await contract.requestCounter();

    return counter.toString();
  }

  /**
   * Get list of member hat IDs
   * @param {string} contractAddress - ParticipationToken contract address
   * @returns {Promise<string[]>} Array of hat IDs
   */
  async getMemberHatIds(contractAddress) {
    requireAddress(contractAddress, 'ParticipationToken contract address');

    const contract = this.factory.createReadOnly(contractAddress, ParticipationTokenABI);
    const hatIds = await contract.memberHatIds();

    return hatIds.map(id => id.toString());
  }

  /**
   * Get list of approver hat IDs
   * @param {string} contractAddress - ParticipationToken contract address
   * @returns {Promise<string[]>} Array of hat IDs
   */
  async getApproverHatIds(contractAddress) {
    requireAddress(contractAddress, 'ParticipationToken contract address');

    const contract = this.factory.createReadOnly(contractAddress, ParticipationTokenABI);
    const hatIds = await contract.approverHatIds();

    return hatIds.map(id => id.toString());
  }
}

/**
 * Create a TokenRequestService instance
 * @param {ContractFactory} factory - Contract factory
 * @param {TransactionManager} txManager - Transaction manager
 * @param {Object} [ipfsService] - IPFS service
 * @returns {TokenRequestService}
 */
export function createTokenRequestService(factory, txManager, ipfsService = null) {
  return new TokenRequestService(factory, txManager, ipfsService);
}
