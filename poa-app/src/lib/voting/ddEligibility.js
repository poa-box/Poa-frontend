import { getAbi } from '@poa-box/core/contracts';
import { knownFact, unknownFact, requireCompleteSnapshot, assertPlanScope, assertSourceBlock } from '@poa-box/core/data/facts';
import { readProposalDetailFacts } from '@poa-box/core/reads/vote';
import { authorityAccountActivationMemberships } from '@poa-box/core/reads/authority';
import { deriveDirectDemocracyAuthorization } from '@poa-box/core/governance/dd-authorization';
import { requireRawUint } from '@poa-box/core/amounts';

/** Mounted DD detail only. Actual votingModule bindings/creation time and same-block
 * indexed restrictions join current authority facts in the canonical policy.
 */
export async function observeDDVotingEligibility({ readFactory, query, scope, authority, proposalId, rpcEndpoint }) {
  requireCompleteSnapshot(authority, { scope: { chainId: scope.chainId, orgId: scope.orgId,
    contract: scope.contracts.membershipAuthority } });
  const id = requireRawUint(proposalId);
  const provider = readFactory.provider || readFactory.signer?.provider;
  if ((await provider.getNetwork()).chainId !== scope.chainId) throw new Error('Voting information belongs to another organization.');
  const blockTag = Number(authority.source.block.number);
  if (!Number.isSafeInteger(blockTag)) throw new Error('Voting information could not be verified.');
  const block = await provider.getBlock(blockTag);
  assertSourceBlock(block && { number: String(block.number), hash: block.hash }, authority.source.block);
  const indexedSource = { ...scope, endpoint: authority.source.endpoint, method: 'dd-proposal-detail',
    indexed: true, snapshot: 'pinned', block: authority.source.block };
  const detail = await readProposalDetailFacts({ source: indexedSource, query, lane: 'dd',
    compositeId: `${scope.contract.toLowerCase()}-${id}` });
  requireCompleteSnapshot(detail, { scope });
  const row = detail.data.proposal.state === 'known' ? detail.data.proposal.value : null;
  if (!row || typeof row.isHatRestricted !== 'boolean' || !Array.isArray(row.restrictedHatIds)) {
    return { scope, ddEligibility: unknownFact('DD_PROPOSAL_UNAVAILABLE', indexedSource) };
  }
  const source = { ...scope, endpoint: rpcEndpoint, method: 'dd-authorization-observation',
    indexed: false, snapshot: 'pinned', block: authority.source.block };
  const votingModule = readFactory.createReadOnly(scope.contract, getAbi('DirectDemocracyVotingNew'));
  const overrides = { blockTag };
  const [created, membershipAuthority, executor, restricted] = await Promise.all([
    votingModule.proposalCreatedAt(id, overrides), votingModule.membershipAuthority(overrides),
    votingModule.executor(overrides), votingModule.pollRestricted(id, overrides),
  ]);
  if (restricted !== row.isHatRestricted) throw new Error('Voting information changed. Please refresh.');
  const proposal = { source, coverage: detail.coverage, data: {
    proposalId: id, createdAt: knownFact(requireRawUint(String(created), 64), source),
    membershipAuthority: knownFact(membershipAuthority, source), executor: knownFact(executor, source),
    restricted: knownFact(restricted, source), restrictedSubjectIds: knownFact(row.restrictedHatIds, indexedSource),
  } };
  const memberships = authorityAccountActivationMemberships(authority, scope.account);
  // Core binds these observations by their actual contracts. The host's broader
  // expected-target map is checked here; authority snapshots do not claim it.
  if (membershipAuthority.toLowerCase() !== scope.contracts.membershipAuthority.toLowerCase()
      && !/^0x0{40}$/i.test(membershipAuthority)) throw new Error('Voting information changed. Please refresh.');
  if (scope.contracts.executor && executor.toLowerCase() !== scope.contracts.executor.toLowerCase()) {
    throw new Error('Voting information changed. Please refresh.');
  }
  for (const [key, expected] of Object.entries(scope.contracts)) {
    if (authority.source.contracts?.[key] !== undefined) assertPlanScope(authority.source, { chainId: scope.chainId, contracts: { [key]: expected } });
  }
  const policyScope = { chainId: scope.chainId, orgId: scope.orgId, account: scope.account, contract: scope.contract };
  const authorization = deriveDirectDemocracyAuthorization({ proposal, authority, memberships, scope: policyScope, proposalId: id });
  const after = await provider.getBlock(blockTag);
  assertSourceBlock(after && { number: String(after.number), hash: after.hash }, source.block);
  const ddEligibility = authorization.state === 'known' ? knownFact(authorization.value, source)
    : unknownFact(authorization.code, source);
  return { scope, ddEligibility, authorization, proposal, authority, memberships };
}

export function ddEligibilityFact(evidence) {
  const fact = evidence?.ddEligibility;
  try {
    if (!fact?.source || fact.state !== 'known') return unknownFact('DD_ELIGIBILITY_UNAVAILABLE');
    assertPlanScope(fact.source, evidence.scope);
    return fact;
  } catch { return unknownFact('DD_ELIGIBILITY_UNAVAILABLE'); }
}
