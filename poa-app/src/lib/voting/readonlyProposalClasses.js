/** Lazy, unsigned org-chain fallback for historical/restricted detail classes. */
import { providers } from 'ethers';
import { getAbi } from '@poa-box/core/contracts';
import { knownFact, unknownFact, assertSourceBlock } from '@poa-box/core/data/facts';
import { projectProposalPowerSnapshot } from '@poa-box/core/governance/power';
import { getNetworkByChainId } from '@/config/networks';
import { ContractFactory } from '@/services/web3/core/ContractFactory';

export async function readReadonlyProposalClasses({ scope, source, proposalId, proposal, readFactory }) {
  const network = getNetworkByChainId(scope.chainId);
  const factory = readFactory || new ContractFactory(null, new providers.JsonRpcProvider(network.rpcUrl,
    { chainId: scope.chainId, name: network.name }));
  const provider = factory.provider || factory.signer?.provider;
  if ((await provider.getNetwork()).chainId !== scope.chainId) throw new Error('Voting information belongs to another organization.');
  const blockTag = Number(source.block.number);
  if (!Number.isSafeInteger(blockTag)) throw new Error('Voting information could not be verified.');
  const before = await provider.getBlock(blockTag);
  assertSourceBlock(before && { number: String(before.number), hash: before.hash }, source.block);
  const votingModule = factory.createReadOnly(scope.contract, getAbi('HybridVotingNew'));
  const overrides = { blockTag };
  const [rows, restricted] = await Promise.all([
    votingModule.getProposalClasses(proposalId, overrides), votingModule.pollRestricted(proposalId, overrides),
  ]);
  if (restricted !== proposal.isHatRestricted || !Array.isArray(rows) || !rows.length || rows.length > 8) throw new Error('Voting groups could not be verified.');
  const rpcSource = { ...source, endpoint: network?.rpcUrl || source.endpoint,
    method: 'getProposalClasses', indexed: false };
  const classes = rows.map(row => ({ strategy: row.strategy, slicePct: Number(row.slicePct), quadratic: row.quadratic,
    minBalance: String(row.minBalance), asset: row.asset, hatIds: row.hatIds.map(String) }));
  const projected = projectProposalPowerSnapshot({ scope: { chainId: scope.chainId, orgId: scope.orgId, contract: scope.contract }, snapshot: { source: rpcSource,
    coverage: { status: 'complete', receivedKeys: [], missingIds: [], failedIds: [], issues: [] }, data: {
      classes: knownFact(classes, rpcSource), proposalClassSubjects: unknownFact('IMMUTABLE_BINDINGS_NOT_READ'),
      createdAt: unknownFact('CREATION_TIME_NOT_READ'), restrictedSubjectIds: knownFact(proposal.restrictedHatIds, source),
    } } });
  const after = await provider.getBlock(blockTag);
  assertSourceBlock(after && { number: String(after.number), hash: after.hash }, source.block);
  if (projected.state !== 'known') throw new Error('Voting groups could not be verified.');
  return knownFact(projected.value.data.classes, rpcSource);
}
