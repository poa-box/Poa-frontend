/** Host copy for canonical, source-qualified electorate activation facts. */
import { electorateActivationFacts } from '@poa-box/core/authority/activation';
import { knownFact, unknownFact } from '@poa-box/core/data/facts';
import { activationGateCopy } from '@/lib/accessV2/memberships';

/** The shape returned when there is nothing to say (also the legacy/absent-data answer). */
const SILENT = Object.freeze({
  checked: false,
  blocked: false,
  reason: null,
  activeSince: null,
  message: null,
  electorateRows: 0,
});

export function ballotActivation({
  enabled,
  loading,
  restrictedSubjectIds = [],
  proposalCreatedAt,
  proposalCreatedAtFact,
  activationEvidence = null,
  restrictionsKnown = true,
} = {}) {
  if (!enabled || loading) return SILENT;
  if (activationEvidence) {
    const facts = electorateActivationFacts({ ...activationEvidence,
      restrictions: restrictionsKnown ? knownFact(restrictedSubjectIds) : unknownFact('PROPOSAL_RESTRICTIONS_UNAVAILABLE'),
      proposalCreatedAt: proposalCreatedAtFact || (proposalCreatedAt == null ? unknownFact('PROPOSAL_CREATION_UNAVAILABLE') : knownFact(String(proposalCreatedAt))) });
    if (facts.reason.state !== 'known') return SILENT;
    if (facts.reason.value !== 'joined-after-proposal') {
      return { ...SILENT, checked: true, electorateRows: facts.qualifyingRoleIds.length };
    }
    const activeSince = facts.activeSince.state === 'known' ? Number(facts.activeSince.value) : null;
    const gate = { canVote: false, reason: 'joined-after-proposal', activeSince };
    return { checked: true, blocked: true, reason: gate.reason, activeSince,
      message: activationGateCopy(gate, proposalCreatedAtFact?.state === 'known' ? proposalCreatedAtFact.value : proposalCreatedAt), electorateRows: facts.qualifyingRoleIds.length };
  }
  return SILENT;
}

export default ballotActivation;
