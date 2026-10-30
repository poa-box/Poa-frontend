import { getAbi } from '@poa-box/core/contracts';
import { knownFact, requireCompleteSnapshot, assertSourceBlock } from '@poa-box/core/data/facts';
import { authorityAccountActivationMemberships } from '@poa-box/core/reads/authority';
import { readProposalDetailFacts } from '@poa-box/core/reads/vote';
import { projectProposalPowerSnapshot } from '@poa-box/core/governance/power';
import { requireRawUint } from '@poa-box/core/amounts';

const complete = { status: 'complete', receivedKeys: [], missingIds: [], failedIds: [], issues: [] };

/** Only the mounted proposal requests immutable RPC fallback, never feed cards.
 * All calls and raw asset balances bind to the verified indexed observation block.
 */
export async function observeProposalPower({ readFactory, query, scope, authority, proposalId, rpcEndpoint, now = () => Date.now() / 1000 }) {
  requireCompleteSnapshot(authority, { scope: { chainId: scope.chainId, orgId: scope.orgId,
    contract: scope.contracts.membershipAuthority } });
  const provider = readFactory.provider || readFactory.signer?.provider;
  const network = await provider.getNetwork();
  if (network.chainId !== scope.chainId) throw new Error('Voting information belongs to another organization.');
  const blockTag = Number(authority.source.block.number);
  if (!Number.isSafeInteger(blockTag)) throw new Error('Voting information could not be verified.');
  const observed = await provider.getBlock(blockTag);
  const block = { number: String(observed.number), hash: observed.hash };
  assertSourceBlock(block, authority.source.block);
  const indexedSource = { ...scope, endpoint: authority.source.endpoint, method: 'proposal-detail', indexed: true,
    snapshot: 'pinned', block: authority.source.block };
  const detail = await readProposalDetailFacts({ source: indexedSource, query, lane: 'hybrid',
    compositeId: `${scope.contract.toLowerCase()}-${requireRawUint(proposalId)}` });
  requireCompleteSnapshot(detail, { scope: indexedSource });
  if (detail.data.proposal.state !== 'known' || !detail.data.proposal.value) throw new Error('Voting information is still loading.');
  const row = detail.data.proposal.value;
  const source = { ...scope, endpoint: rpcEndpoint, method: 'getProposalClasses/proposalClassSubject',
    indexed: false, snapshot: 'pinned', block, observedAt: Math.floor(now()) };
  const voting = readFactory.createReadOnly(scope.contract, getAbi('HybridVotingNew'));
  const overrides = { blockTag };
  const [rawClasses, created, boundAuthority, executor, restricted] = await Promise.all([
    voting.getProposalClasses(proposalId, overrides), voting.proposalCreatedAt(proposalId, overrides),
    voting.membershipAuthority(overrides), voting.executor(overrides), voting.pollRestricted(proposalId, overrides),
  ]);
  if (boundAuthority.toLowerCase() !== scope.contracts.membershipAuthority.toLowerCase()
      || executor.toLowerCase() !== scope.contracts.executor.toLowerCase()
      || restricted !== row.isHatRestricted || String(created) !== String(row.startTimestamp)
      || !Array.isArray(row.restrictedHatIds) || (restricted && !row.restrictedHatIds.length)) {
    throw new Error('Voting information changed. Please refresh.');
  }
  if (!rawClasses.length || rawClasses.length > 8) throw new Error('Voting groups could not be verified.');
  const subjects = await Promise.all(rawClasses.map((_, index) => voting.proposalClassSubject(proposalId, index, overrides)));
  const classes = rawClasses.map(cls => ({ strategy: cls.strategy, slicePct: Number(cls.slicePct),
    quadratic: cls.quadratic, minBalance: String(cls.minBalance), asset: cls.asset, hatIds: cls.hatIds.map(String) }));
  const projected = projectProposalPowerSnapshot({ scope, snapshot: { source, coverage: complete, data: {
    classes: knownFact(classes, source), proposalClassSubjects: knownFact(subjects.map(String), source),
    createdAt: knownFact(String(created), source),
    restrictedSubjectIds: knownFact(restricted ? row.restrictedHatIds : [], indexedSource),
  } } });
  if (projected.state !== 'known') throw new Error('Voting groups could not be verified.');
  const balances = {};
  await Promise.all([...new Set(classes.filter(cls => cls.strategy === 1 || cls.strategy === '1' || cls.strategy === 'ERC20_BAL')
    .map(cls => cls.asset.toLowerCase()))].map(async asset => {
    const token = readFactory.createReadOnly(asset, getAbi('ERC20'));
    const raw = await token.balanceOf(scope.account, overrides);
    balances[asset] = knownFact(requireRawUint(String(raw)), { ...source, contract: asset, method: 'balanceOf' });
  }));
  // Detect a changed RPC fork before publishing a joined observation.
  const after = await provider.getBlock(blockTag);
  assertSourceBlock({ number: String(after.number), hash: after.hash }, block);
  return { scope, proposal: projected.value, authority,
    memberships: authorityAccountActivationMemberships(authority, scope.account), balances,
    viewerIsExecutor: knownFact(scope.account.toLowerCase() === executor.toLowerCase(), source),
    balanceScope: { chainId: scope.chainId, orgId: scope.orgId, account: scope.account } };
}
