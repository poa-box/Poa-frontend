/**
 * Compatibility API for governance copy and execution-status explanations.
 * Read-only labels live in votingVocabularyCore so navigation does not load
 * contract-revert decoding. Proposal cards and details retain this full API.
 */
import vocabulary, { invalidReason } from '@/config/votingVocabularyCore';
import { describeExecutionFailure } from '@/lib/errors/contractErrors';

export * from '@/config/votingVocabularyCore';

/**
 * Resolve the execution-status chip for a completed proposal.
 * @param {object} p - transformed proposal (isValid, wasExecuted,
 *   executionFailed, executionError, hasExecutableActions)
 */
export function executionStatus(p = {}) {
  const isValid = p.isValid !== false;
  const hasActions = !!(p.executionBatchId || p.executedCallsCount > 0 || p.hasExecutableActions);

  if (!isValid) {
    return {
      // `key` stays 'no_quorum' — callers branch on it — but the member-facing
      // copy must not name a cause `isValid` cannot distinguish (see invalidReason).
      key: 'no_quorum',
      label: 'No result',
      colorScheme: 'gray',
      explain: invalidReason(p),
      canRetry: false,
    };
  }
  if (p.executionFailed === true) {
    return {
      key: 'failed',
      label: 'Execution Failed',
      colorScheme: 'red',
      // `executionError` is RAW BYTES (`ProposalExecutionFailed.reason`, Bytes in the schema) — it
      // used to be interpolated verbatim, so a member read "The winning action failed on-chain:
      // 0x5c0dee5d0000…". Decode it: the outer wrapper is always `Executor.CallFailed`, and the
      // cause is the inner revert. Falls back to the short selector, then to the generic line.
      explain: describeExecutionFailure(p.executionError)
        || "The winning option's on-chain action failed to run — it can be retried.",
      canRetry: true,
    };
  }
  if (p.wasExecuted) {
    return {
      key: 'applied',
      label: 'Decision Applied',
      colorScheme: 'green',
      explain: "The winning option's action was applied on-chain.",
      canRetry: false,
    };
  }
  if (hasActions) {
    return {
      key: 'pending',
      label: 'Pending Execution',
      colorScheme: 'yellow',
      explain: 'This decision has an action waiting to be applied — it can be retried.',
      canRetry: true,
    };
  }
  return {
    key: 'signal',
    label: 'Signal vote',
    colorScheme: 'blue',
    explain: 'This was a sentiment check with no on-chain action.',
    canRetry: false,
  };
}

export default { ...vocabulary, executionStatus };
