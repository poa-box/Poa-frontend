/** Election presentation around source-qualified core plans. */
import { planElection } from '@poa-box/core/governance/elections';
import { estimateBatchGas } from '@/lib/accessV2/proposalBuilders';

/**
 * An elected seat is held by the GROUP, not by the person: `delegable: false` (sticky) means the
 * winner cannot hand it on or drop it, and only another vote can move it. That is the whole point
 * of electing someone, and it matches the legacy arm, whose explicit `setWearerEligibility` rule
 * likewise survived any attempt by the wearer to re-arrange it.
 */
export const ELECTED_SEAT_STICKY = true;

const isAddress = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);

/**
 * ELECTION -> one authority batch per candidate option.
 *
 * Option order is the legacy order exactly: one batch per candidate in `candidates` order, with
 * the optional "No One" option appended LAST as an empty batch, so an existing ballot's indices
 * never shift.
 *
 * @param {object} opts
 * @param {string} opts.authority - MembershipAuthority address
 * @param {string} opts.subjectId - the ROLE being elected (a subject id on a v2 org)
 * @param {string} [opts.subjectName]
 * @param {Array<{name: string, address: string}>} opts.candidates
 * @param {Array<{name: string, address: string}>} [opts.selectedIncumbents] - seats at stake
 * @param {boolean} [opts.includeNoOneOption]
 * @param {string} [opts.fallbackSubjectId] - consolation role for the incumbents who lose
 * @param {string} [opts.fallbackSubjectName]
 * @param {boolean} [opts.sticky=ELECTED_SEAT_STICKY]
 * @param {boolean} [opts.banLosers=true] - see the header note on `RemovalIneffective`
 * @returns {{batches: Array, optionNames: string[], summaries: string[], warnings: string[], gasLimit: number}}
 */
export function buildV2ElectionBatches({
  authority,
  subjectId,
  subjectName = 'this role',
  candidates = [],
  selectedIncumbents = [],
  includeNoOneOption = false,
  fallbackSubjectId = '',
  fallbackSubjectName = '',
  sticky = ELECTED_SEAT_STICKY,
  planningEvidence = null,
} = {}) {
  if (!authority) throw new Error('This group’s roles contract hasn’t loaded yet — please try again in a moment.');
  if (!subjectId) throw new Error('Pick which role this election fills.');

  const runners = (candidates || []).filter((c) => c && isAddress(c.address));
  if (runners.length === 0) throw new Error('An election needs at least one candidate.');

  const atStake = (selectedIncumbents || []).filter((i) => i && isAddress(i.address));
  if (planningEvidence) {
    const evidence = planningEvidence;
    // Reviewed reason/source values are supplied by the selection UI, never copied from a new read.
    const removals = atStake.map(person => ({ account: person.address, ban: Boolean(person.ban),
      expectedReason: person.expectedReason, expectedSourceSet: person.expectedSourceSet }));
    const plan = planElection({ ...evidence,
      scope: { ...evidence.scope, contract: authority }, subjectId,
      candidates: runners.map(candidate => candidate.address), removals,
      confirmedBans: evidence.confirmedBans || [], includeNoOneOption,
      ...(fallbackSubjectId ? { fallbackSubjectId } : {}), stickyWinner: sticky });
    if (plan.status !== 'ready') {
      const error = new Error('The current election choices could not be verified. Refresh the roles and review the election again.');
      error.planningCodes = plan.codes;
      throw error;
    }
    const batches = plan.data.map(batch => batch.map(call => ({ target: call.target, value: String(call.value), data: call.calldata })));
    return {
      batches, optionNames: [...runners.map(candidate => candidate.name), ...(includeNoOneOption ? ['No One'] : [])],
      summaries: [`Elect ${runners.map(candidate => candidate.name || candidate.address).join(' or ')} as ${subjectName}.`,
        ...atStake.map(person => person.ban
          ? `If ${person.name || person.address} doesn’t win, remove them from ${subjectName} and block them from reclaiming it.`
          : `If ${person.name || person.address} doesn’t win, remove them from ${subjectName}.`),
        ...(fallbackSubjectId ? [`Offer or add losing incumbents to ${fallbackSubjectName || 'the fallback role'}, according to their remaining memberships.`] : []),
        ...(sticky ? ['The elected seat stays with the group and can only be changed by another vote.'] : []),
        ...(includeNoOneOption ? ['Voters can also choose “No One” — if that wins, nothing changes.'] : [])],
      warnings: ['Role memberships may change before this vote is counted.'], plan,
      gasLimit: Math.max(...batches.map(batch => estimateBatchGas(batch)), estimateBatchGas([])),
    };
  }
  throw new Error('Refresh the current role settings and review this election before continuing.');
}

const v2VoteActions = { buildV2ElectionBatches };
export default v2VoteActions;
