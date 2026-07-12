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
};
