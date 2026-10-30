/** Display constants and copy for the core-backed task release decision. */

/**
 * Why a release is or isn't offered. Stable strings — the UI switches copy on
 * these and the tests assert them.
 */
export const ReleaseReason = {
  /** Claimer giving their own task back. Always allowed while CLAIMED. */
  SELF_RELEASE: 'self-release',
  /** ASSIGN holder reclaiming an expired claim from someone else. */
  THIRD_PARTY_EXPIRED: 'third-party-expired',

  NO_TASK: 'no-task',
  INDEXING: 'indexing',
  /** SUBMITTED: a reviewer must reject first, or the claimer would be zeroed. */
  SUBMITTED_MUST_REJECT_FIRST: 'submitted-must-reject-first',
  NOT_CLAIMED: 'not-claimed',
  NO_ACCOUNT: 'no-account',
  NEEDS_ASSIGN: 'needs-assign',
  CLAIM_NOT_EXPIRED: 'claim-not-expired',
  /**
   * The org's subgraph predates TaskManager v7, so it carries no TaskUnclaimed
   * handler. The contract call would SUCCEED, but the indexer would never
   * reflect it: the board would keep showing the task as claimed — not just
   * until the optimistic lock lapses, but permanently — and the next click
   * would revert BadStatus against an already-UNCLAIMED task.
   *
   * This is the one condition here that is about the INDEXER rather than the
   * chain, so it is checked last and never masks a contract-shaped refusal.
   */
  INDEXER_TOO_OLD: 'indexer-too-old',
};

/**
 * A third party's clock is not the chain's clock. `isClaimExpired` reads the
 * browser clock while the contract reads `block.timestamp`, so a user running a
 * few seconds fast would see the button light up and get a bare `BadStatus`.
 * Require the claim to be expired by a whole minute before offering a takeover
 * release. Only applies to the third-party branch — self-release has no
 * deadline condition at all, so no skew to guard against.
 */
export const EXPIRY_SKEW_BUFFER_MS = 60 * 1000;

/**
 * Is `address` the task's current claimer?
 *
 * Strict address equality on both sides lowercased. Deliberately NOT
 * `isTaskMine` (taskIndicators.js), whose username fallback is looser than the
 * contract's `msg.sender == t.claimer` — that would render a Release button
 * that reverts for anyone sharing a display name with the claimer.
 */
export function isTaskClaimer(task, address) {
  if (!task || !address) return false;
  const claimer = task.claimedBy;
  if (!claimer || typeof claimer !== 'string') return false;
  return claimer.toLowerCase() === String(address).toLowerCase();
}

/** Button label for an allowed release. */
export function releaseActionLabel(reason) {
  return reason === ReleaseReason.SELF_RELEASE ? 'Release task' : 'Release claim';
}

/** Confirmation copy for an allowed release. `claimerName` is display-only. */
export function releaseConfirmCopy(reason, claimerName) {
  if (reason === ReleaseReason.SELF_RELEASE) {
    return "Give this task back? It returns to Open and anyone eligible can claim it. Your work isn't submitted, and the payout stays with the task.";
  }
  const who = claimerName ? `${claimerName}'s` : 'this';
  return `Release ${who} expired claim? The task returns to Open for anyone to pick up. They keep no credit for it.`;
}
