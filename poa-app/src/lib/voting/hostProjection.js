import { assertSourceBlock, requireCompleteSnapshot } from '@poa-box/core/data/facts';
import { requireRawUint } from '@poa-box/core/amounts';
import { computeClassWeightedScores, computeProposalResults } from '@poa-box/core/reads/vote';
import { requireValidVoteWeights } from '@poa-box/core/governance/validation';

/** Canonical tally math; counts and bar percentages are presentation only.
 * Feed selections are previews until the observer supplies complete ballot coverage.
 */
export function proposalTallyView(proposal, type, classes, thresholdPct, quorum) {
  const count = Number(proposal.numOptions || 2);
  const votes = proposal.votes || [];
  const voterCounts = Array(count).fill(0);
  let results = computeProposalResults({ thresholdPct, quorum, proposals: [{ ...proposal, votes: [] }] });
  try {
    const ballots = votes.map(vote => {
      requireValidVoteWeights(vote.optionWeights, vote.optionIndexes);
      const weights = Array(count).fill(0);
      vote.optionIndexes.forEach((index, i) => {
        if (index >= count) throw new Error('OPTION_UNAVAILABLE');
        weights[index] = vote.optionWeights[i];
        if (weights[index] > 0) voterCounts[index]++;
      });
      const raw = type === 'Hybrid' ? vote.classRawPowers : ['100'];
      if (!Array.isArray(raw) || raw.length !== (type === 'Hybrid' ? classes.length : 1)) throw new Error('CLASS_POWER_UNAVAILABLE');
      return { weights, classRawPowers: raw.map(value => BigInt(requireRawUint(value))) };
    });
    results = computeProposalResults({ thresholdPct, quorum, proposals: [proposal] });
    if (type === 'Hybrid' && !classes.length) throw new Error('CLASSES_UNAVAILABLE');
    const scores = computeClassWeightedScores(ballots, type === 'Hybrid' ? classes.map(cls => Number(cls.slicePct)) : [100], count);
    return { scores, voterCounts, totalVotes: votes.length, results, known: true,
      complete: proposal.ballotCoverage?.status === 'complete' };
  } catch {
    return { scores: Array(count).fill(0), voterCounts, totalVotes: votes.length, results,
      known: false, complete: false };
  }
}

/** Keep optimistic own votes visible, but never call them indexed complete facts. */
export function mountedProposalView(poll, evidence, account) {
  if (!poll || !evidence) return poll;
  try {
    const row = evidence.detail.data.proposal.value;
    if (row.id !== poll.id || row.proposalId !== String(poll.proposalId)) return poll;
    assertSourceBlock(evidence.ballots.source.block, evidence.source.block);
    requireCompleteSnapshot(evidence.ballots, { scope: evidence.source, block: evidence.source.block });
    const votes = [...evidence.ballots.data];
    const own = account && poll.votes?.find(vote => vote.voter?.toLowerCase() === account.toLowerCase());
    const pendingOwn = own && !votes.some(vote => vote.voter.toLowerCase() === account.toLowerCase());
    if (pendingOwn) votes.push(own);
    const ballotCoverage = pendingOwn ? { ...evidence.ballots.coverage, status: 'incomplete' } : evidence.ballots.coverage;
    const raw = { ...row, votes, ballotCoverage };
    const classes = evidence.classes.state === 'known' ? evidence.classes.value : [];
    const tally = proposalTallyView(raw, poll.type, classes, poll.thresholdPct, poll.quorum);
    const scoreSum = tally.scores.reduce((sum, score) => sum + score, 0);
    const numOptions = Number(row.numOptions);
    const options = Array.from({ length: numOptions }, (_, index) => {
      const percentage = scoreSum > 0 ? tally.scores[index] / scoreSum * 100 : 0;
      return { ...(poll.options?.[index] || {}), id: `${poll.id}-option-${index}`,
        name: row.metadata?.optionNames?.[index] || poll.options?.[index]?.name || `Option ${index + 1}`,
        votes: tally.voterCounts[index], displayVotes: String(tally.voterCounts[index]),
        percentage: tally.known ? percentage : null, currentPercentage: tally.known ? Math.round(percentage) : null,
        rawScore: tally.known ? tally.scores[index] : null, approximate: !tally.complete, tallyUnavailable: !tally.known };
    });
    const indexedOwn = account && votes.find(vote => vote.voter?.toLowerCase() === account.toLowerCase());
    return { ...poll, votes, options, totalVotes: tally.totalVotes, tallyKnown: tally.known, tallyComplete: tally.complete,
      results: tally.results, winningOption: tally.results?.announcedWinningOption ?? null,
      userHasVoted: Boolean(indexedOwn), userVote: indexedOwn ? {
        optionIndexes: indexedOwn.optionIndexes, optionWeights: indexedOwn.optionWeights } : null };
  } catch { return { ...poll, tallyKnown: false, tallyComplete: false, options: (poll.options || []).map(option => ({
    ...option, percentage: null, currentPercentage: null, rawScore: null, approximate: true, tallyUnavailable: true,
  })) }; }
}
