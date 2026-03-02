/**
 * SmartAccountTransactionManager
 * Drop-in replacement for TransactionManager for passkey (ERC-4337) users.
 *
 * Implements the same execute(contract, method, args, options) API.
 * Instead of sending a direct transaction, it wraps calls inside
 * PasskeyAccount.execute() → builds a UserOp → signs with passkey → submits to bundler.
 */

import { encodeFunctionData } from 'viem';
import { TransactionResult, TransactionState } from './TransactionManager';
import PasskeyAccountABI from '../../../../abi/PasskeyAccount.json';
import { buildUserOp, getUserOpHash } from '../passkey/userOpBuilder';
import { signUserOpWithPasskey } from '../passkey/passkeySign';
import { encodeAccountPaymasterData } from '../passkey/paymasterData';
import { ENTRY_POINT_ADDRESS } from '../../../config/passkey';
import { NETWORKS, DEFAULT_NETWORK } from '../../../config/networks';

const networkConfig = NETWORKS[DEFAULT_NETWORK];

/**
 * ERC-4337 error code mappings
 */
const AA_ERROR_MESSAGES = {
  AA21: 'Account does not exist. You may need to create your account first.',
  AA25: 'Signature validation failed. Please try signing again.',
  AA31: 'Gas sponsor rejected the transaction. The organization may have run out of gas budget.',
  AA33: 'Gas sponsor rejected the transaction. The organization may have run out of gas budget.',
  AA40: 'Verification gas limit too low.',
  AA41: 'Transaction exceeds gas limits.',
  AA51: 'Prefund not available.',
};

export class SmartAccountTransactionManager {
  /**
   * @param {Object} params
   * @param {string} params.accountAddress - Smart account address
   * @param {string} params.rawCredentialId - base64url credential ID for signing
   * @param {Object} params.publicClient - viem public client
   * @param {Object} params.bundlerClient - Pimlico bundler client
   * @param {string} params.paymasterAddress - PaymasterHub proxy address
   * @param {string} [params.orgId] - Current org ID (bytes32) for paymaster data
   */
  constructor({ accountAddress, rawCredentialId, publicClient, bundlerClient, paymasterAddress, orgId = null }) {
    this.accountAddress = accountAddress;
    this.rawCredentialId = rawCredentialId;
    this.publicClient = publicClient;
    this.bundlerClient = bundlerClient;
    this.paymasterAddress = paymasterAddress;
    this.orgId = orgId;
    this.chainId = networkConfig.chainId;
  }

  /**
   * Execute a contract transaction via ERC-4337 UserOp.
   * Same signature as TransactionManager.execute().
   *
   * @param {ethers.Contract} contract - Contract instance (used for ABI encoding only)
   * @param {string} method - Method name to call
   * @param {Array} [args=[]] - Method arguments
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>}
   */
  async execute(contract, method, args = [], options = {}) {
    const { onStateChange } = options;

    try {
      // State: Estimating
      this._notifyState(onStateChange, TransactionState.ESTIMATING);

      // 1. ABI-encode the target call
      const targetAddress = contract.address;
      const targetCallData = contract.interface.encodeFunctionData(method, args);

      // 2. Wrap in PasskeyAccount.execute(target, 0, data)
      const callData = encodeFunctionData({
        abi: PasskeyAccountABI,
        functionName: 'execute',
        args: [targetAddress, 0n, targetCallData],
      });

      // 3. Build paymaster data
      if (!this.paymasterAddress || !this.orgId) {
        throw new Error('Paymaster address and org ID are required for passkey transactions');
      }

      const paymasterData = encodeAccountPaymasterData({
        accountAddress: this.accountAddress,
        orgId: this.orgId,
      });

      // 4. Build the UserOp
      const userOp = await buildUserOp({
        sender: this.accountAddress,
        callData,
        bundlerClient: this.bundlerClient,
        publicClient: this.publicClient,
        paymasterAddress: this.paymasterAddress,
        paymasterData,
      });

      // State: Awaiting signature (biometric prompt)
      this._notifyState(onStateChange, TransactionState.AWAITING_SIGNATURE);

      // 5. Compute UserOp hash and sign with passkey
      const userOpHash = getUserOpHash(userOp, ENTRY_POINT_ADDRESS, this.chainId);
      const signature = await signUserOpWithPasskey(userOpHash, this.rawCredentialId);
      userOp.signature = signature;

      // State: Pending (submitting to bundler)
      this._notifyState(onStateChange, TransactionState.PENDING);

      // 6. Submit to bundler
      const userOpHashFromBundler = await this.bundlerClient.sendUserOperation({
        ...userOp,
        entryPointAddress: ENTRY_POINT_ADDRESS,
      });

      console.log(`UserOp submitted: ${userOpHashFromBundler}`);

      // State: Confirming
      this._notifyState(onStateChange, TransactionState.CONFIRMING);

      // 7. Wait for receipt
      const receipt = await this.bundlerClient.waitForUserOperationReceipt({
        hash: userOpHashFromBundler,
        timeout: 120_000,
      });

      if (!receipt.success) {
        const error = this._parseAAError(receipt.reason || 'UserOp execution failed');
        this._notifyState(onStateChange, TransactionState.ERROR, { error });
        return TransactionResult.failure(error);
      }

      // State: Success
      const txReceipt = receipt.receipt;
      this._notifyState(onStateChange, TransactionState.SUCCESS, {
        receipt: txReceipt,
        txHash: txReceipt.transactionHash,
      });

      console.log(`UserOp confirmed: ${txReceipt.transactionHash} (block ${txReceipt.blockNumber})`);

      return TransactionResult.success(txReceipt);

    } catch (error) {
      console.error('=== SMART ACCOUNT TX ERROR ===');
      console.error('Method:', method);
      console.error('Args:', args);
      console.error('Error:', error.message);
      console.error('=== END SMART ACCOUNT TX ERROR ===');

      const parsedError = this._parseAAError(error.message || 'Unknown error', error);
      this._notifyState(onStateChange, TransactionState.ERROR, { error: parsedError });

      return TransactionResult.failure(parsedError);
    }
  }

  /**
   * Execute multiple calls atomically via PasskeyAccount.executeBatch().
   *
   * @param {Array<{contract, method, args, options}>} transactions
   * @param {Object} [batchOptions={}]
   * @returns {Promise<TransactionResult>}
   */
  async executeBatch(transactions, batchOptions = {}) {
    const { onStateChange } = batchOptions;

    try {
      this._notifyState(onStateChange, TransactionState.ESTIMATING);

      // Encode all target calls
      const targets = [];
      const values = [];
      const datas = [];

      for (const tx of transactions) {
        targets.push(tx.contract.address);
        values.push(0n);
        datas.push(tx.contract.interface.encodeFunctionData(tx.method, tx.args || []));
      }

      // Wrap in PasskeyAccount.executeBatch
      const callData = encodeFunctionData({
        abi: PasskeyAccountABI,
        functionName: 'executeBatch',
        args: [targets, values, datas],
      });

      if (!this.paymasterAddress || !this.orgId) {
        throw new Error('Paymaster address and org ID are required for passkey transactions');
      }

      const paymasterData = encodeAccountPaymasterData({
        accountAddress: this.accountAddress,
        orgId: this.orgId,
      });

      const userOp = await buildUserOp({
        sender: this.accountAddress,
        callData,
        bundlerClient: this.bundlerClient,
        publicClient: this.publicClient,
        paymasterAddress: this.paymasterAddress,
        paymasterData,
      });

      this._notifyState(onStateChange, TransactionState.AWAITING_SIGNATURE);

      const userOpHash = getUserOpHash(userOp, ENTRY_POINT_ADDRESS, this.chainId);
      const signature = await signUserOpWithPasskey(userOpHash, this.rawCredentialId);
      userOp.signature = signature;

      this._notifyState(onStateChange, TransactionState.PENDING);

      const userOpHashFromBundler = await this.bundlerClient.sendUserOperation({
        ...userOp,
        entryPointAddress: ENTRY_POINT_ADDRESS,
      });

      this._notifyState(onStateChange, TransactionState.CONFIRMING);

      const receipt = await this.bundlerClient.waitForUserOperationReceipt({
        hash: userOpHashFromBundler,
        timeout: 120_000,
      });

      if (!receipt.success) {
        const error = this._parseAAError(receipt.reason || 'Batch UserOp execution failed');
        this._notifyState(onStateChange, TransactionState.ERROR, { error });
        return TransactionResult.failure(error);
      }

      const txReceipt = receipt.receipt;
      this._notifyState(onStateChange, TransactionState.SUCCESS, {
        receipt: txReceipt,
        txHash: txReceipt.transactionHash,
      });

      return TransactionResult.success(txReceipt);

    } catch (error) {
      console.error('=== SMART ACCOUNT BATCH TX ERROR ===');
      console.error('Error:', error.message);
      console.error('=== END SMART ACCOUNT BATCH TX ERROR ===');

      const parsedError = this._parseAAError(error.message || 'Unknown error', error);
      this._notifyState(onStateChange, TransactionState.ERROR, { error: parsedError });

      return TransactionResult.failure(parsedError);
    }
  }

  /**
   * Parse ERC-4337 AA error codes into user-friendly messages.
   * @param {string} message - Error message
   * @param {Error} [originalError] - Original error object
   * @returns {Object} Parsed error with userMessage and technicalMessage
   */
  _parseAAError(message, originalError = null) {
    // Check for AA error codes
    for (const [code, userMessage] of Object.entries(AA_ERROR_MESSAGES)) {
      if (message.includes(code)) {
        return {
          category: 'smart_account_error',
          userMessage,
          technicalMessage: message,
          originalError,
        };
      }
    }

    // Check for user cancellation (WebAuthn)
    if (message.includes('NotAllowedError') || message.includes('The operation either timed out or was not allowed')) {
      return {
        category: 'user_rejected',
        userMessage: 'Authentication cancelled.',
        technicalMessage: message,
        originalError,
      };
    }

    // Check for paymaster-specific errors
    if (message.includes('paymaster') || message.includes('Paymaster')) {
      return {
        category: 'paymaster_error',
        userMessage: 'Gas sponsorship failed. The organization may need to add more funds.',
        technicalMessage: message,
        originalError,
      };
    }

    // Generic
    return {
      category: 'smart_account_error',
      userMessage: 'Transaction failed. Please try again.',
      technicalMessage: message,
      originalError,
    };
  }

  /**
   * Notify state change callback.
   */
  _notifyState(callback, state, data = {}) {
    if (typeof callback === 'function') {
      callback(state, data);
    }
  }
}

/**
 * Create a SmartAccountTransactionManager instance.
 * @param {Object} params - Constructor params
 * @returns {SmartAccountTransactionManager}
 */
export function createSmartAccountTransactionManager(params) {
  return new SmartAccountTransactionManager(params);
}
