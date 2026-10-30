import { ELECTED_SEAT_STICKY } from '@/lib/voting/v2VoteActions';
import { planElection, planRoleRemovals } from '@poa-box/core/governance/elections';
import { assertPlanScope } from '@poa-box/core/data/facts';

/** Refresh after content upload without replacing the member's reviewed choices.
 * This callback stays in memory; it is never proposal metadata or saved evidence.
 */
export function createGovernanceSubmissionGuard(proposal, reviewed, refresh, now = () => Math.floor(Date.now() / 1000)) {
  if (!reviewed?.expectedFingerprint || typeof refresh !== 'function') throw new Error('Review the current role choices before creating this vote.');
  const selected = rows => (rows || []).map(row => ({ address: row.address, ban: row.ban === true,
    expectedReason: row.expectedReason, expectedSourceSet: row.expectedSourceSet }));
  const choices = {
    type: proposal.type,
    batches: proposal.batches.map(batch => batch.map(call => ({ target: call.target, value: String(call.value), data: call.data }))),
    electionRoleId: proposal.electionRoleId,
    electionCandidates: (proposal.electionCandidates || []).map(row => ({ address: row.address })),
    electionSelectedIncumbents: selected(proposal.electionSelectedIncumbents),
    electionIncludeNoOneOption: proposal.electionIncludeNoOneOption === true,
    electionConfirmBans: proposal.electionConfirmBans === true,
    electionFallbackRoleId: proposal.electionFallbackRoleId,
    roleRemovalConfig: { subjectId: proposal.roleRemovalConfig?.subjectId,
      members: selected(proposal.roleRemovalConfig?.members), confirmBans: proposal.roleRemovalConfig?.confirmBans === true },
  };
  const scope = { ...reviewed.scope, ...(reviewed.scope?.contracts ? { contracts: { ...reviewed.scope.contracts } } : {}) };
  const expectedFingerprint = reviewed.expectedFingerprint;
  const confirmedBans = (reviewed.confirmedBans || []).map(row => ({ ...row }));
  const maxAgeSeconds = reviewed.freshness?.maxAgeSeconds;
  return async () => {
    const fresh = await refresh();
    try { assertPlanScope(fresh?.scope, scope); }
    catch { throw new Error('The role choices changed or could not be verified. Review them again.'); }
    recheckGovernanceSubmission(choices, { ...fresh, expectedFingerprint, confirmedBans,
      freshness: { ...fresh.freshness, maxAgeSeconds } }, now());
  };
}

/** Last host boundary: preserve reviewed consent and compare actual canonical calls.
 * The observation is transient and never enters proposal metadata or saved drafts.
 */
export function recheckGovernanceSubmission(proposal, input, now = Math.floor(Date.now() / 1000)) {
  if (!input) throw new Error('Review the current role choices before creating this vote.');
  const election = proposal.type === 'election';
  const selected = election ? proposal.electionSelectedIncumbents || [] : proposal.roleRemovalConfig?.members || [];
  if (selected.some(row => row.ban) && !(election ? proposal.electionConfirmBans === true : proposal.roleRemovalConfig?.confirmBans === true)) {
    throw new Error('Confirm the selected blocks before creating this vote.');
  }
  const planInput = { ...input, freshness: { ...input.freshness, now },
    subjectId: election ? proposal.electionRoleId : proposal.roleRemovalConfig.subjectId,
    removals: selected.map(row => ({ account: row.address, ban: row.ban === true,
      expectedReason: row.expectedReason, expectedSourceSet: row.expectedSourceSet })),
  };
  if (election) Object.assign(planInput, {
    candidates: proposal.electionCandidates.map(row => row.address),
    includeNoOneOption: Boolean(proposal.electionIncludeNoOneOption), stickyWinner: ELECTED_SEAT_STICKY,
    ...(proposal.electionFallbackRoleId ? { fallbackSubjectId: proposal.electionFallbackRoleId } : {}),
  });
  const result = election ? planElection(planInput) : planRoleRemovals(planInput);
  if (result.status !== 'ready') throw new Error('The role choices changed or could not be verified. Review them again.');
  const batches = result.data.map(batch => batch.map(call => ({ target: call.target, value: String(call.value), data: call.calldata })));
  if (JSON.stringify(batches) !== JSON.stringify(proposal.batches)) throw new Error('The proposed changes differ from the reviewed role choices. Review them again.');
}
