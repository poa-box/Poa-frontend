/**
 * TransactionManager
 * Unified transaction handling with gas estimation, error parsing, and state tracking
 */

import { pendingSubmissionError } from '@/services/web3/core/submissionJournal';
import { unknownSubmissionError, reconcileUserOperationSubmission } from '@/services/web3/core/userOperationSubmission';
import { managerIntentKey, snapshotCallValue, snapshotExecutionArguments, assertBeforeSend } from '@/services/web3/core/managerSubmissionScope';
import { installManagerLifecycle } from '@/services/web3/core/managerLifecycle';
import { parseError } from '@/lib/errors';
import { createGasOptions, getNetworkByChainId } from '@/config';
import { BigNumber } from 'ethers';
import { guardedRpcSigner } from '@poa-box/core/browser/wallet';

/**
 * Transaction states for tracking progress
 */
export const TransactionState = {
  IDLE: 'idle',
  ESTIMATING: 'estimating',
  AWAITING_SIGNATURE: 'awaiting_signature',
  PENDING: 'pending',
  CONFIRMING: 'confirming',
  SUCCESS: 'success',
  ERROR: 'error',
};

/**
 * Transaction result object
 */
export class TransactionResult {
  /**
   * @param {boolean} success - Whether transaction succeeded
   * @param {Object} [receipt=null] - Transaction receipt
   * @param {Object} [error=null] - Parsed error if failed
   */
  constructor(success, receipt = null, error = null) {
    this.success = success;
    this.receipt = receipt;
    this.error = error;
    this.txHash = receipt?.transactionHash;
    this.blockNumber = receipt?.blockNumber;
    this.timestamp = Date.now();
  }

  /**
   * Create a successful result
   * @param {Object} receipt - Transaction receipt
   * @returns {TransactionResult}
   */
  static success(receipt) {
    return new TransactionResult(true, receipt, null);
  }

  /**
   * Create a failed result
   * @param {Object} error - Parsed error object
   * @returns {TransactionResult}
   */
  static failure(error) {
    return new TransactionResult(false, null, error);
  }
}

/**
 * Default transaction options
 */
const DEFAULT_OPTIONS = {
  isDelete: false, // Use higher gas multiplier for delete operations
  confirmations: 1, // Number of block confirmations to wait
  onStateChange: null, // Callback for state changes: (state, data) => {}
  // Optional FLOOR (not a cap, not an override) applied over the buffered estimate. Exists for
  // calls whose estimate is systematically wrong in the LOW direction — above all `announceWinner`,
  // which runs the winning batch inside a try/catch so estimation prices only the cheap
  // caught-failure path and an under-funded call silently skips the batch while reporting success.
  // See lib/accessV2/gasFloors.
  gasLimit: null,
};

/**
 * TransactionManager - Handles the full transaction lifecycle
 *
 * This eliminates the 15+ repeated transaction patterns by providing
 * a single, unified method for executing contract transactions.
 */
export class TransactionManager {
  /**
   * @param {ethers.Signer} signer - Ethers signer
   * @param {Object} [config={}] - Configuration options
   */
  constructor(signer, config = {}) {
    this.signer = signer;
    this.submissionChainId = config.chainId;
    this.accountAddress = config.accountAddress;
    this.publicClient = config.publicClient;
    this.chainId = config.chainId;
    this.bundlerClient = config.bundlerClient;
    installManagerLifecycle(this, { ...config, direct: true });
    this._chainId = null; // resolved lazily in _getChainContext()
    // Optional async guard injected by useWeb3Services. Called before every
    // send to guarantee the wallet + signer are bound to the intended (org)
    // chain. Returns a fresh signer bound to that chain, or null for "no change".
    this.ensureChain = config.ensureChain || null;
  }

  /**
   * Execute a contract transaction with full lifecycle management
   *
   * @param {ethers.Contract} contract - Contract instance
   * @param {string} method - Method name to call
   * @param {Array} [args=[]] - Method arguments
   * @param {Object} [options={}] - Transaction options
   * @returns {Promise<TransactionResult>} Transaction result
   */
  async execute(contract, method, args = [], options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const abi = contract.interface?.fragments;

    // Signer actually used for THIS send. Kept local (not written back onto
    // `this.signer`) so a chain switch during one execute can't leave the shared
    // manager instance in a half-mutated state for a concurrent/next call.
    let activeSigner = this.signer;
    let submission;
    let sendStarted = false;
    let rpcBoundary;
    let expectedData;
    let expectedTarget;
    let expectedValue;
    let expectedNonce;
    let acknowledgedCapture, acknowledgedError;

    try {
      args = snapshotCallValue(args);
      if (opts.value !== undefined) opts.value = snapshotCallValue(opts.value);
      this.assertCurrent();
      // Bind to the intended chain BEFORE we estimate/sign/send. An EOA tx
      // broadcasts through the wallet's *connected* chain — if that's the wrong
      // network the contract address has no code there. Depending on the wallet,
      // that can be rejected with a generic `-32603` (as in the reported incident)
      // or accepted as a useless no-op. `ensureChain` switches the wallet to the
      // org chain and returns a signer freshly bound to it; it is a no-op (null)
      // for non-org routes, passkey users, or E2E where the signer is pre-bound.
      if (this.ensureChain) {
        const boundSigner = await this.ensureChain();
        if (boundSigner) {
          activeSigner = boundSigner;
        }
      }

      rpcBoundary = await guardedRpcSigner(activeSigner, {
        beforeSend: () => assertBeforeSend(this, opts.beforeSend),
        assertCurrent: () => { this.assertCurrent(); this.submissionJournal?.assertLease(); },
        assertIntent: tx => {
          if (!tx || tx.to?.toLowerCase() !== expectedTarget || tx.data?.toLowerCase() !== expectedData
            || BigInt(tx.value ?? '0x0') !== BigInt(expectedValue)
            || (expectedNonce !== undefined && BigInt(tx.nonce) !== BigInt(expectedNonce))) {
            throw new Error('The transaction changed. Review this action again.');
          }
        },
        onDispatch: () => { sendStarted = true; },
        onHash: hash => {
          if (!submission) return;
          if (typeof hash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error('Transaction status is not available.');
          submission = { ...submission, phase: 'submitted', txHash: hash };
          // Core 2.2 invokes onHash synchronously. Persist immediately, track the
          // host's async capture, and consume rejection until execute can await it.
          acknowledgedCapture = this.recordSubmission(submission).then(
            saved => { submission = saved; }, error => { acknowledgedError = error; });
        },
      });
      if (rpcBoundary) activeSigner = rpcBoundary.signer;

      // The manager's checked signer must own the actual contract call, even
      // when no chain switch was needed and a caller retained an older factory.
      if (typeof contract.connect === 'function') contract = contract.connect(activeSigner);

      this.assertCurrent();
      // State: Estimating gas
      this._notifyState(opts.onStateChange, TransactionState.ESTIMATING);

      // Estimate gas (pass value override for payable functions)
      const valueOverride = opts.value ? { value: opts.value } : {};
      const gasEstimate = await this._estimateGas(contract, method, args, valueOverride);
      const gasOptions = createGasOptions(gasEstimate, {
        isDelete: opts.isDelete,
        gasLimitFloor: opts.gasLimit,
      });

      // Include value for payable function calls
      if (opts.value) {
        gasOptions.value = opts.value;
      }

      let nonce;
      let fromBlock;
      if (this.submissionJournal) {
        if (activeSigner.getAddress && (await activeSigner.getAddress()).toLowerCase() !== this.accountAddress.toLowerCase()) throw new Error('Your account changed. Please try again.');
        if (activeSigner.getChainId && await activeSigner.getChainId() !== this.submissionChainId) throw new Error('Your network changed. Please try again.');
        nonce = await activeSigner.getTransactionCount('pending');
        this.assertCurrent();
        fromBlock = this.publicClient?.getBlockNumber ? await this.publicClient.getBlockNumber() : undefined;
      }
      if (this.submissionJournal) {
        if (activeSigner.getAddress && (await activeSigner.getAddress()).toLowerCase() !== this.accountAddress.toLowerCase()) throw new Error('Your account changed. Please try again.');
        if (activeSigner.getChainId && await activeSigner.getChainId() !== this.submissionChainId) throw new Error('Your network changed. Please try again.');
        this.assertCurrent();
      }
      if (rpcBoundary) {
        expectedTarget = contract.address.toLowerCase();
        expectedData = contract.interface.encodeFunctionData(method, args).toLowerCase();
        expectedValue = BigNumber.from(opts.value ?? 0).toString();
        expectedNonce = nonce;
      }
      // Wallet signing and dispatch share one call. Refresh AFTER all awaited
      // setup and identity reads; only synchronous scope/lease checks follow.
      await assertBeforeSend(this, opts.beforeSend);
      this._notifyState(opts.onStateChange, TransactionState.AWAITING_SIGNATURE);
      if (this.submissionJournal) {
        this.submissionJournal.assertLease();
        submission = { kind: 'transaction', phase: 'submitting', chainId: this.submissionChainId, nonce: String(nonce),
          callKey: managerIntentKey('execute', [contract, method, args, opts]),
          ...(fromBlock === undefined ? {} : { fromBlock: String(fromBlock) }) };
        submission = await this.recordSubmission(submission);
        gasOptions.nonce = nonce;
      }
      // Capture may await durable host persistence. Renew consent after it, too.
      await assertBeforeSend(this, opts.beforeSend);
      this.submissionJournal?.assertLease();
      if (!rpcBoundary) sendStarted = true;
      const tx = await contract[method](...args, gasOptions);
      await acknowledgedCapture;
      if (acknowledgedError) throw acknowledgedError;

      if (submission) {
        if (typeof tx?.hash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(tx.hash)) throw new Error('Transaction status is not available.');
        if (submission.txHash && submission.txHash.toLowerCase() !== tx.hash.toLowerCase()) throw new Error('Transaction status is not available.');
        if (!submission.txHash) submission = await this.recordSubmission({ ...submission, phase: 'submitted', txHash: tx.hash });
      }
      // State: Pending
      this._notifyState(opts.onStateChange, TransactionState.PENDING, {
        txHash: tx.hash,
      });

      console.log(`Transaction sent: ${tx.hash}`);

      // State: Confirming
      this._notifyState(opts.onStateChange, TransactionState.CONFIRMING);

      // Wait for confirmation
      const receipt = await tx.wait(opts.confirmations);

      if (submission) {
        if (receipt.transactionHash?.toLowerCase() !== submission.txHash?.toLowerCase() || ![0, 1, 0n, 1n, '0', '1', '0x0', '0x1'].includes(receipt.status)) throw new Error('Transaction status is not available.');
        await this.settleSubmission(submission, { receipt, outcome: { status: [0, 0n, '0', '0x0'].includes(receipt.status) ? 'failed' : 'succeeded' } });
      }
      if ([0, 0n, '0', '0x0'].includes(receipt.status)) throw new Error('This action did not complete. Please try again.');
      // Preserve a known original outcome after navigation; callbacks remain scope-guarded.
      // State: Success
      this._notifyState(opts.onStateChange, TransactionState.SUCCESS, {
        receipt,
        txHash: tx.hash,
      });

      console.log(`Transaction confirmed: ${receipt.transactionHash} (block ${receipt.blockNumber})`);

      return TransactionResult.success(receipt);

    } catch (error) {
      // Ethers' post-send lookup can fail before the acknowledged capture finishes.
      await acknowledgedCapture;
      if (acknowledgedError) error = acknowledgedError;
      // The wallet's replacement hash selects one candidate. RPC transaction, receipt and canonical
      // block observations establish its outcome; wallet diagnostics alone cannot settle the barrier.
      if (submission?.recovery && error.code === 'TRANSACTION_REPLACED' && typeof error.replacement?.hash === 'string' && error.receipt) {
        let recovered;
        try {
          recovered = await reconcileUserOperationSubmission(submission, null, this.publicClient, { candidateTxHash: error.replacement.hash });
        }
        catch { /* Unverifiable replacement retains the original barrier. */ }
        const outcome = recovered?.outcome;
        if (outcome && outcome.status !== 'unknown' && await this.settleSubmission(submission, recovered)) {
          if (outcome.status === 'succeeded') {
            this._notifyState(opts.onStateChange, TransactionState.SUCCESS, { receipt: recovered.receipt, txHash: outcome.txHash });
            return TransactionResult.success(recovered.receipt);
          }
          const parsed = { category: outcome.status === 'replaced' ? 'transaction_replaced' : 'transaction_failed',
            userMessage: outcome.status === 'replaced' ? 'This action was replaced by another transaction. You can try the action again.' : 'This action did not complete. Please try again.' };
          this._notifyState(opts.onStateChange, TransactionState.ERROR, { error: parsed });
          return TransactionResult.failure(parsed);
        }
      }
      const cancelled = !submission?.txHash && (error?.code === 4001 || error?.code === 'ACTION_REJECTED');
      const failedReceipt = error.code !== 'TRANSACTION_REPLACED' && error.receipt && [0, 0n, '0', '0x0'].includes(error.receipt.status)
        && error.receipt.transactionHash?.toLowerCase() === submission?.txHash?.toLowerCase();
      let pendingError = null;
      try {
        if (submission && (cancelled || failedReceipt || !sendStarted) && await this.settleSubmission(submission, { success: false, ...(cancelled || !sendStarted ? { submissionState: 'not-submitted' } : {}), receipt: error.receipt }) !== true) {
          pendingError = unknownSubmissionError(pendingSubmissionError(submission));
        }
        if (submission && sendStarted && !cancelled && !failedReceipt && this.submissionJournal.read()) {
          pendingError = unknownSubmissionError(pendingSubmissionError(submission));
        }
      } catch {
        pendingError = submission ? unknownSubmissionError(pendingSubmissionError(submission)) : { category: 'account_unavailable', userMessage: 'Saved transaction status is unavailable. Check this account before trying again.' };
      }
      const parsedError = pendingError || parseError(error, abi, await this._getChainContext(activeSigner));

      // State: Error
      this._notifyState(opts.onStateChange, TransactionState.ERROR, {
        error: parsedError,
      });

      console.error('Transaction failed:', { method, category: parsedError.category });

      const result = TransactionResult.failure(parsedError);
      // A guard failure before the wallet call or a definite wallet rejection is
      // positive non-submission evidence. Failed journal cleanup keeps its barrier.
      if (!pendingError && (cancelled || !sendStarted)) result.submissionState = 'not-submitted';
      return result;
    } finally {
      rpcBoundary?.dispose();

    }
  }

  /**
   * Execute multiple transactions in sequence
   *
   * @param {Array<{contract, method, args, options}>} transactions - Array of transaction configs
   * @param {Object} [batchOptions={}] - Options for the batch
   * @returns {Promise<Array<TransactionResult>>} Array of results
   */
  async executeBatch(transactions, batchOptions = {}) {
    [transactions, batchOptions] = snapshotExecutionArguments('executeBatch', [transactions, batchOptions]);
    const results = [];

    for (const tx of transactions) {
      const result = await this.execute(
        tx.contract,
        tx.method,
        tx.args || [],
        { ...batchOptions, ...tx.options }
      );

      results.push(result);

      // Stop on first failure unless continueOnError is set
      if (!result.success && !batchOptions.continueOnError) {
        break;
      }
    }

    return results;
  }

  /**
   * Estimate gas for a contract call
   * @param {ethers.Contract} contract - Contract instance
   * @param {string} method - Method name
   * @param {Array} args - Method arguments
   * @returns {Promise<BigNumber>} Gas estimate
   */
  async _estimateGas(contract, method, args, overrides = {}) {
    try {
      return await contract.estimateGas[method](...args, overrides);
    } catch (error) {
      // Gas estimation failure usually means the transaction would revert
      // Re-throw with the original error for proper parsing
      throw error;
    }
  }

  /**
   * Update signer
   * @param {ethers.Signer} signer - New signer
   */
  updateSigner(signer) {
    this.signer = signer;
    this._chainId = null; // force re-resolution against the new signer
  }

  /**
   * Build chain context for parseError (native symbol + network name).
   * Resolved on-demand from the signer's provider — this is only called in
   * the error path, so the (usually cached) RPC call cost never touches the
   * success path. Returns {} if chainId is unknown or unsupported.
   *
   * @param {ethers.Signer} [signer] - Signer actually used for the failed send.
   *   Defaults to the manager's signer; execute() passes the (possibly chain-
   *   switched) active signer so the error names the network the tx really hit.
   *   The `this._chainId` cache is only used/updated for the manager's own signer.
   */
  async _getChainContext(signer = this.signer) {
    const usesManagerSigner = signer === this.signer;

    let chainId = usesManagerSigner ? this._chainId : null;
    if (chainId == null) {
      chainId = signer?.provider?.network?.chainId ?? null;
      if (chainId == null && signer?.getChainId) {
        try {
          chainId = await signer.getChainId();
        } catch {
          // Provider not ready; fall through to generic message.
        }
      }
      if (usesManagerSigner) this._chainId = chainId;
    }
    const network = chainId != null ? getNetworkByChainId(chainId) : null;
    if (!network) return {};
    return {
      nativeSymbol: network.nativeCurrency?.symbol,
      networkName: network.name,
    };
  }

}

/**
 * Create a TransactionManager instance
 * @param {ethers.Signer} signer - Ethers signer
 * @param {Object} [config={}] - Configuration options
 * @returns {TransactionManager} Transaction manager instance
 */
export function createTransactionManager(signer, config = {}) {
  return new TransactionManager(signer, config);
}
