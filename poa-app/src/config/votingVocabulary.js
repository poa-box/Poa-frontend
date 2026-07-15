/**
 * votingVocabulary — single source of truth for user-facing governance strings.
 *
 * Product direction (Hudson): the weighted voting system is called "Blended
 * voting" everywhere a member can see it — plain, warm, co-op language. The
 * on-chain / code identifiers (HybridVoting, votingType === 'Hybrid', subgraph
 * fields) stay unchanged; this file only maps them to human copy.
 *
 * Wave-2 components (pollModal, CompletedPollModal, VoteCard, tabs) import
 * from here too so the vocabulary never drifts between surfaces again.
 */

/**
 * Map an internal voting-type identifier to its member-facing display name.
 * `votingType` comes from VotingContext ('Hybrid' | 'Direct Democracy' |
 * 'Participation'); we never surface "Hybrid" to a member.
 */
export function displayName(votingType) {
  switch (votingType) {
    case 'Hybrid':
      return 'Blended voting';
    case 'Direct Democracy':
      return 'Direct democracy';
    case 'Participation':
      return 'Participation voting';
    default:
      return votingType || 'Voting';
  }
}

/**
 * One-line tagline for each voting model, member-facing.
 */
export function taglineFor(votingType) {
  switch (votingType) {
    case 'Hybrid':
      return 'Decisions weighted by membership + contributions';
    case 'Direct Democracy':
      return 'One person, one vote — gauge sentiment before it binds';
    case 'Participation':
      return 'Binding decisions weighted by your contributions';
    default:
      return '';
  }
}

/**
 * Threshold / support-to-pass explainer. `pct` is the support percentage.
 */
export function thresholdLabel(pct) {
  const n = pct == null ? '' : `${pct}%`;
  return `Passes if the top choice gets over ${n} support`;
}

/**
 * Quorum explainer. `n` is the minimum voter count.
 */
export function quorumLabel(n) {
  const count = n == null ? '' : n;
  return `Needs ${count} voters for the result to count`;
}

/** Section label for who is currently able to vote (active poll). */
export const ELIGIBILITY_LABEL = 'Who can vote:';

/** Section label for who was able to vote (completed poll). */
export const COMPLETED_ELIGIBILITY_LABEL = 'Who could vote:';

/** Verb for finalizing / announcing a poll result. */
export const FINALIZE_VERB = 'Count the votes';

/**
 * Turnout copy — votes cast vs. eligible denominator, with a quorum aside.
 * `voted` = distinct voters, `eligible` = eligible denominator (may be the
 * member count fallback → set `approximate` so the label reads "members"),
 * `quorum` = minimum voters for the result to count (0 = no quorum).
 * Returns `{ line, quorumMet, needsMore }`.
 */
export function turnoutCopy({ voted = 0, eligible = 0, quorum = 0, approximate = false }) {
  const noun = approximate ? 'members' : 'eligible';
  const denom = eligible > 0 ? `${voted} of ${eligible} ${noun}` : `${voted} voted`;
  const base = eligible > 0 ? `${denom} voted` : denom;

  if (!quorum || quorum <= 0) {
    return { line: base, quorumMet: true, needsMore: 0 };
  }
  if (voted >= quorum) {
    return { line: `${base} · quorum\u00a0met\u00a0✓`, quorumMet: true, needsMore: 0 };
  }
  const needsMore = quorum - voted;
  return {
    line: `${base} · needs\u00a0${needsMore}\u00a0more\u00a0for\u00a0quorum`,
    quorumMet: false,
    needsMore,
  };
}

/**
 * Leading-option support vs. the pass threshold, member-facing.
 * `supportPct` = leading option's support %, `thresholdPct` = pass line.
 */
export function supportCopy(supportPct, thresholdPct) {
  const s = supportPct == null ? 0 : Math.round(supportPct);
  if (!thresholdPct || thresholdPct <= 0) {
    return `Leading option has ${s}% support`;
  }
  return `Leading option has ${s}% support · passes over ${Math.round(thresholdPct)}%`;
}

// ---------------------------------------------------------------------------
// Lifecycle status chips (board cards + detail header).
// ---------------------------------------------------------------------------

/** Live poll still open (paired with a relative-time countdown by the caller). */
export const STATUS_LIVE = 'LIVE';
/** Live poll closing within 24h. */
export const STATUS_CLOSING_SOON = 'CLOSING SOON';
/** Voting window ended, result not yet counted on-chain. */
export const STATUS_AWAITING_COUNT = 'VOTING ENDED — awaiting count';

/** "You already voted" affordance. */
export const YOU_VOTED_CHIP = 'You voted ✓';

// ---------------------------------------------------------------------------
// Completed-poll execution-status taxonomy (preserved from CompletedPollModal)
// with plain-language explanations. `label` is the chip; `explain` is one line.
// ---------------------------------------------------------------------------

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
      key: 'no_quorum',
      label: 'No quorum',
      colorScheme: 'gray',
      explain: 'Not enough people voted, so nothing changed.',
      canRetry: false,
    };
  }
  if (p.executionFailed === true) {
    return {
      key: 'failed',
      label: 'Execution Failed',
      colorScheme: 'red',
      explain: p.executionError
        ? `The winning action failed on-chain: ${p.executionError}`
        : "The winning option's on-chain action failed to run — it can be retried.",
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

/**
 * Plain-language pass/fail line for a completed proposal.
 * @param {object} p - transformed proposal
 */
export function outcomeHeadline(p = {}) {
  if (p.isValid === false) return 'No quorum — not enough people voted';
  const win = p.options?.[p.winningOption];
  if (!win) return 'Voting complete';
  const support = Math.round(win.percentage || 0);
  const passed = !p.thresholdPct || support >= p.thresholdPct;
  return passed
    ? `Passed — "${win.name}" won with ${support}% support`
    : `Did not pass — "${win.name}" led with ${support}% but fell short`;
}

// ---------------------------------------------------------------------------
// Vote-celebration copy (VoteCelebration.jsx).
// ---------------------------------------------------------------------------

export const CELEBRATION_HEADLINE = 'Your vote is in!';
/** `pct` = the viewer's total share of this decision. */
export function celebrationShare(pct) {
  if (pct == null || Number.isNaN(pct)) return null;
  return `Counted as ${Number(pct).toFixed(1)}% of this decision`;
}
export const CELEBRATION_YOUR_CHOICE = 'You voted:';
export const CELEBRATION_DONE = 'Done';
export const CELEBRATION_ERROR_TITLE = "Your vote didn't go through";
export const CELEBRATION_ERROR_BODY = 'Nothing was recorded. Try again.';
export const CELEBRATION_RETRY = 'Try again';

// ---------------------------------------------------------------------------
// Finalize-zone explainer (PollDetail section i).
// ---------------------------------------------------------------------------

export const FINALIZE_EXPLAINER =
  "Voting has ended. Counting records the final result on-chain — anyone can " +
  "do it, it doesn't change the outcome, and it can't be undone.";
export const FINALIZE_CONFIRM_TITLE = 'Count the votes?';
export const FINALIZE_CONFIRM_BODY =
  "This records the final tally on-chain. It doesn't change who won and can't be undone.";

/** Badge on binding (official) polls. */
export const BINDING_BADGE = 'BINDING';

/** Badge on non-binding (temperature-check) polls. */
export const POLL_BADGE = 'POLL';

/**
 * Short plain-language explanation of Blended voting — reused by the education
 * header footer and the VotePowerReceipt "how it works" panel.
 */
export const BLENDED_EXPLAINER =
  'Blended voting mixes two kinds of say. Every member gets an equal vote, ' +
  'and contributors get extra weight from the shares they have earned. Each ' +
  'class counts for a fixed slice of every decision, so members always have a ' +
  'voice while the people doing the work carry more influence.';

// ---------------------------------------------------------------------------
// Class-label helpers — used by VotePowerReceipt and the education header.
// A "class" is one on-chain voting class (strategy DIRECT or ERC20_BAL).
// ---------------------------------------------------------------------------

/**
 * Human label for a voting class, derived from its strategy + config.
 * `roleNames` (optional) is an array of resolved role names for a DIRECT
 * class's gating hats, used to make the label specific ("Founders — equal vote").
 */
export function classLabel(cls, roleNames = []) {
  if (!cls) return 'Voting class';
  if (cls.strategy === 'DIRECT') {
    if (roleNames && roleNames.length > 0) {
      const shown = roleNames.slice(0, 2).join(', ');
      const suffix = roleNames.length > 2 ? '…' : '';
      return `${shown}${suffix} — equal vote`;
    }
    return 'Members — equal vote';
  }
  // ERC20_BAL
  return cls.quadratic ? 'Contributors — shares, quadratic' : 'Contributors — shares';
}

/**
 * Short slice badge copy, e.g. "80% of every decision".
 */
export function sliceBadge(slicePct) {
  const n = slicePct == null ? 0 : Math.round(Number(slicePct));
  return `${n}% of every decision`;
}

/**
 * Reason copy for why a class does not count for this user yet.
 */
export function ineligibleCopy(reason, opts = {}) {
  switch (reason) {
    case 'below_min_balance':
      return opts.minLabel
        ? `below the ${opts.minLabel} minimum — this class doesn't count for you yet`
        : "below the minimum balance — this class doesn't count for you yet";
    case 'no_role':
      return "you don't hold an eligible role — this class doesn't count for you yet";
    case 'no_balance':
      return "you hold no shares — this class doesn't count for you yet";
    default:
      return "this class doesn't count for you yet";
  }
}

export default {
  displayName,
  taglineFor,
  thresholdLabel,
  quorumLabel,
  ELIGIBILITY_LABEL,
  COMPLETED_ELIGIBILITY_LABEL,
  FINALIZE_VERB,
  BINDING_BADGE,
  POLL_BADGE,
  BLENDED_EXPLAINER,
  classLabel,
  sliceBadge,
  ineligibleCopy,
  turnoutCopy,
  supportCopy,
  STATUS_LIVE,
  STATUS_CLOSING_SOON,
  STATUS_AWAITING_COUNT,
  YOU_VOTED_CHIP,
  executionStatus,
  outcomeHeadline,
  CELEBRATION_HEADLINE,
  celebrationShare,
  CELEBRATION_YOUR_CHOICE,
  CELEBRATION_DONE,
  CELEBRATION_ERROR_TITLE,
  CELEBRATION_ERROR_BODY,
  CELEBRATION_RETRY,
  FINALIZE_EXPLAINER,
  FINALIZE_CONFIRM_TITLE,
  FINALIZE_CONFIRM_BODY,
};
