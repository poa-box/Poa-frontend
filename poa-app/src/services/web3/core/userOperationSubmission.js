import { SponsoredSubmissionError } from '@poa-box/core/sponsorship-config';
import { decodeUserOperationOutcome } from '@poa-box/core/execute/outcome';
import { reconcileSubmissionRecovery, decodeReceiptBoundUserOperationOutcome } from '@poa-box/core/execute/recovery';
import { requireRawUint } from '@poa-box/core/amounts';
import { isPaymasterRejection, stripRequestArguments } from '@/services/web3/passkey/sponsorshipBudget';

const admissionRefusals = new WeakSet();
const transactionHash = value => typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value);
// viem uses named receipt statuses and maps invalid RPC statuses to undefined.
// A returned transaction receipt must establish a known status; logs-only evidence is not transport success.
const decodingReceipt = receipt => receipt && ({ ...receipt, status: receipt.status === 'success' ? 1 : receipt.status === 'reverted' ? 0 : receipt.status ?? null });

// A transport failure cannot establish a bundler's refusal, even if its diagnostic
// context mentions the paymaster. This is host RPC dialect/policy, not a new codec.
function definitePaymasterRefusal(error) {
  const text = [error?.name, error?.message, error?.shortMessage, error?.details,
    error?.cause?.name, error?.cause?.message, error?.cause?.shortMessage, error?.cause?.details]
    .map(stripRequestArguments).join('\n');
  return isPaymasterRejection(error)
    && !/timeout|timed out|network (?:error|unavailable|request)|fetch failed|socket|connection (?:lost|reset|closed|refused)|\bHTTP (?:request|response|error)|\bstatus(?: code)?:?\s*(?:429|502|503|504)|already (?:known|submitted)|response.*(?:lost|invalid|malformed)/i.test(text);
}

/** Journal only identities, never the signed operation. An ambiguous send cannot authorize retry. */
export async function submitUserOperation({ bundlerClient, userOp, computedHash, entryPoint, chainId, onSubmission, beforeSend = () => {} }) {
  // Validate the identity before handing anything to transport or persistence.
  decodeUserOperationOutcome(null, { userOpHash: computedHash, entryPoint, sender: userOp.sender, nonce: userOp.nonce });
  let submission = { phase: 'submitting', computedHash, entryPoint, chainId, sender: userOp.sender, nonce: requireRawUint(userOp.nonce) };
  try {
    await onSubmission?.({ ...submission });
  } catch (cause) {
    throw new SponsoredSubmissionError('Transaction status could not be saved before submission.', { ...submission, phase: 'pre-submit' }, cause);
  }

  let hash;
  try {
    await beforeSend();
  } catch (cause) {
    throw new SponsoredSubmissionError('Your account changed before submission.', { ...submission, phase: 'pre-submit' }, cause);
  }
  try {
    hash = await bundlerClient.sendUserOperation({ ...userOp, entryPointAddress: entryPoint });
  } catch (cause) {
    const phase = definitePaymasterRefusal(cause) ? 'pre-submit' : 'submitting';
    const error = new SponsoredSubmissionError('The transaction submission could not be confirmed.', { ...submission, phase }, cause);
    if (phase === 'pre-submit') admissionRefusals.add(error);
    throw error;
  }

  submission = { ...submission, phase: 'submitted', userOpHash: hash };
  // Retain a differing response diagnostically; the locally computed hash owns recovery.
  try {
    await onSubmission?.({ ...submission });
  } catch (cause) {
    throw new SponsoredSubmissionError('Transaction submitted, but its status could not be saved.', submission, cause);
  }
  if (typeof hash !== 'string' || hash.toLowerCase() !== computedHash.toLowerCase()) {
    throw new SponsoredSubmissionError('The transaction response did not match the submitted operation.', submission);
  }
  return { hash: computedHash, submission, expected: { userOpHash: computedHash, entryPoint, sender: userOp.sender, nonce: userOp.nonce } };
}

export async function confirmUserOperation(submitted, bundlerClient) {
  let receipt;
  const submission = { ...submitted.submission, phase: 'receipt' };
  try {
    receipt = await bundlerClient.waitForUserOperationReceipt({ hash: submitted.hash, timeout: 120_000 });
  } catch (cause) {
    throw new SponsoredSubmissionError('The transaction receipt could not be confirmed.', submission, cause);
  }
  const outer = receipt?.receipt;
  const outcome = transactionHash(outer?.transactionHash)
    ? decodeReceiptBoundUserOperationOutcome(decodingReceipt(outer), submitted.expected)
    : { ...submitted.expected, status: 'unknown', code: 'MISSING_TRANSACTION_HASH' };
  if (outcome.status === 'unknown') {
    const error = new SponsoredSubmissionError('The transaction outcome is not available yet.', submission);
    error.outcome = outcome;
    throw error;
  }
  return { receipt: outer, outcome };
}

/** Recovery is read-only and deliberately lazy; it never signs or resubmits. */
export async function reconcileUserOperationSubmission(submission, bundlerClient, publicClient, options = {}) {
  if (submission?.recovery) {
    let rawReceipt;
    const result = await reconcileSubmissionRecovery(submission.recovery, {
      getChainId: () => publicClient.getChainId(),
      getTransactionReceipt: async hash => {
        const receipt = await publicClient.getTransactionReceipt({ hash });
        rawReceipt = receipt;
        return decodingReceipt(receipt);
      },
      getUserOperationReceipt: async hash => {
        const result = await bundlerClient.getUserOperationReceipt({ hash });
        return { transactionHash: result?.receipt?.transactionHash ?? result?.transactionHash };
      },
      getTransaction: hash => publicClient.getTransaction({ hash }),
      getBlock: blockNumber => publicClient.getBlock({ blockNumber: BigInt(blockNumber) }),
      getBlockNumber: () => publicClient.getBlockNumber(),
      getBlockTransactions: async blockNumber => {
        const block = await publicClient.getBlock({ blockNumber: BigInt(blockNumber), includeTransactions: true });
        if (String(block.number) !== blockNumber || !Array.isArray(block.transactions)
          || block.transactions.some(tx => !tx || typeof tx !== 'object')) throw new Error('Block evidence unavailable');
        return block.transactions;
      },
    }, options);
    return { ...result, submission, ...(result.receipt && rawReceipt ? { receipt: rawReceipt } : {}) };
  }

  // Legacy EOA descriptors have no independently saved call digest. A receipt alone
  // cannot establish that the intended action executed, even at a supplied hash.
  if (submission?.kind === 'transaction') return { submission, outcome: { status: 'unknown', code: 'LEGACY_CALL_IDENTITY_UNAVAILABLE' } };
  if (!Number.isSafeInteger(submission?.chainId) || await publicClient.getChainId() !== submission.chainId
    || !submission.accountAddress || submission.sender?.toLowerCase() !== submission.accountAddress.toLowerCase()
    || submission.nonce == null || !submission.entryPoint) {
    return { submission, outcome: { status: 'unknown', code: 'LEGACY_IDENTITY_UNAVAILABLE' } };
  }
  if (!submission?.computedHash && !submission?.userOpHash) throw new Error('No submitted transaction to check.');
  const { reconcileSponsoredSubmission } = await import('@poa-box/core/execute/sponsored');
  let rawReceipt;
  const result = await reconcileSponsoredSubmission(submission, {
    getUserOperationReceipt: async hash => {
      const result = await bundlerClient.getUserOperationReceipt({ hash });
      const observedHash = result?.receipt?.transactionHash ?? result?.transactionHash;
      return transactionHash(observedHash) ? { transactionHash: observedHash } : null;
    },
    getTransactionReceipt: async hash => {
      if (!transactionHash(hash)) return null;
      const receipt = await publicClient.getTransactionReceipt({ hash });
      if (receipt?.transactionHash?.toLowerCase() !== hash.toLowerCase()) return null;
      rawReceipt = receipt;
      return decodingReceipt(receipt);
    },
  });
  // Older descriptors lack nonce/sender. The computed hash still owns recovery;
  // new descriptors also require the exact inner sender/nonce at this host boundary.
  if (result.receipt) result.outcome = decodeReceiptBoundUserOperationOutcome(decodingReceipt(rawReceipt), {
    userOpHash: submission.computedHash ?? submission.userOpHash, entryPoint: submission.entryPoint,
    sender: submission.sender ?? submission.accountAddress, nonce: submission.nonce,
  });
  if (rawReceipt) result.receipt = rawReceipt;
  return result;
}

export function unknownSubmissionError(error) {
  if (error?.nativeSubmission) return { category: 'submission_unknown', userMessage: 'We couldn’t confirm this transaction yet. Check its status before trying again.', submission: error.nativeSubmission, originalError: error };
  if (!(error instanceof SponsoredSubmissionError) || error.submission.phase === 'pre-submit') return null;
  return {
    category: 'submission_unknown',
    userMessage: 'We couldn’t confirm this transaction yet. Check its status before trying again.',
    technicalMessage: error.message,
    submission: error.submission,
    ...(error.outcome ? { outcome: error.outcome } : {}),
    originalError: error,
  };
}

export function paymasterSubmissionRefusal(error) {
  return admissionRefusals.has(error) ? error.cause : null;
}
