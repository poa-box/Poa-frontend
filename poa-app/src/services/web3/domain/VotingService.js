/** Voting protocol intents inside the host's existing transaction lifecycle. */
import { constants } from 'ethers';
import { getAbi } from '@poa-box/core/contracts';
import { buildVote, buildAnnounceWinner } from '@poa-box/core/tx/vote';
import { buildGovernanceProposal } from '@poa-box/core/tx/governance';
import { buildProposalMetadata, serializeProposalMetadata, prepareProposalMetadata } from '@poa-box/core/metadata/proposal';
import { cidV0ToBytes32 } from '@poa-box/core/encoding/cid';
import { requireValidVoteWeights } from '@poa-box/core/governance/validation';
import { requireRawUint } from '@poa-box/core/amounts';
import { executeCoreIntent } from '@/services/web3/core/coreIntent';
import { requireAddress, requireString, requireValidDuration } from '@/services/web3/utils/validation';
import { VotingType } from '@/lib/services/votingType';
export { VotingType } from '@/lib/services/votingType';

const abiNameFor = (type) => {
  if (type === VotingType.HYBRID) return 'HybridVotingNew';
  if (type === VotingType.DIRECT_DEMOCRACY) return 'DirectDemocracyVotingNew';
  throw new Error('Unknown voting type.');
};
const coreBatches = (batches) => (batches || []).map(batch => batch.map(call => ({
  target: call.target ?? call[0],
  value: call.value ?? call[1] ?? '0',
  calldata: call.calldata ?? call.data ?? call[2],
})));

export class VotingService {
  constructor(contractFactory, transactionManager, ipfsService = null) {
    this.factory = contractFactory;
    this.txManager = transactionManager;
    this.ipfs = ipfsService;
  }

  /** Create a request-local transport view through the guarded service entry. */
  withTransactionManager(transactionManager) {
    return new VotingService(this.factory, transactionManager, this.ipfs);
  }

  async createProposal(type, contractAddress, proposalData, options = {}) {
    const { beforeExecute, ...transactionOptions } = options;
    if (beforeExecute !== undefined && typeof beforeExecute !== 'function') throw new Error('Review this vote again before creating it.');
    if (transactionOptions.beforeSend !== undefined && typeof transactionOptions.beforeSend !== 'function') throw new Error('Review this vote again before creating it.');
    requireAddress(contractAddress, 'Voting contract address');
    requireString(proposalData.name, 'Proposal name');
    requireValidDuration(proposalData.durationMinutes);
    const { name, durationMinutes, numOptions, batches = [], hatIds, subjectIds,
      quorumOverride, equalWeight } = proposalData;
    // Validate all protocol arguments before asking the host to persist content.
    const namedInput = {
      votingAddress: contractAddress,
      votingAbiName: abiNameFor(type),
      title: name,
      descriptionHash: constants.HashZero,
      durationMinutes: Math.floor(durationMinutes),
      numOptions,
      batches: coreBatches(batches),
      hatIds,
      subjectIds,
      quorumOverride,
      equalWeight,
    };
    // Retain the core's normalized copy while content is persisted. In
    // particular, restricted subject arrays belong to the caller and can change
    // during an asynchronous upload; rebuilding afterward would silently submit
    // an electorate different from the reviewed request.
    const intent = buildGovernanceProposal(namedInput);
    const descriptionHash = await this._uploadProposalMetadata(proposalData);
    intent.args[1] = descriptionHash;
    await beforeExecute?.();
    const beforeSend = transactionOptions.beforeSend;
    return executeCoreIntent(this.factory, this.txManager, intent, beforeExecute ? {
      ...transactionOptions,
      // Wallet/lock preparation and a biometric prompt can outlive the upload.
      // Managers own the final scope check after this fresh authority check.
      beforeSend: async () => { await beforeSend?.(); await beforeExecute(); },
    } : transactionOptions);
  }

  async createHybridProposal(contractAddress, proposalData, options = {}) {
    return this.createProposal(VotingType.HYBRID, contractAddress, proposalData, options);
  }

  async createDDProposal(contractAddress, proposalData, options = {}) {
    return this.createProposal(VotingType.DIRECT_DEMOCRACY, contractAddress, proposalData, options);
  }

  async _uploadProposalMetadata({ description = '', optionNames = [], actionSummaries = [],
    promotedFrom, createsSubject, schemaVersion, extensions, createdAt, metadata }) {
    const hasContent = Boolean(metadata || description || optionNames.length || actionSummaries.length
      || promotedFrom !== undefined || createsSubject !== undefined || extensions !== undefined);
    if (!hasContent) return constants.HashZero;
    const document = metadata ? prepareProposalMetadata(metadata) : prepareProposalMetadata(buildProposalMetadata({
      description, optionNames, actionSummaries: actionSummaries.length ? actionSummaries : undefined,
      promotedFrom, createsSubject, schemaVersion, extensions, createdAt,
    }));
    if (metadata && (document.optionNames.length !== optionNames.length
        || document.optionNames.some((name, index) => name !== optionNames[index]))) {
      throw new Error('Proposal metadata options do not match the ballot.');
    }
    if (!this.ipfs || typeof this.ipfs.addToIpfs !== 'function') {
      throw new Error('Proposal details could not be saved. Please try again.');
    }
    const result = await this.ipfs.addToIpfs(serializeProposalMetadata(document));
    const hash = cidV0ToBytes32(result?.path);
    if (hash === constants.HashZero) throw new Error('Proposal metadata could not be persisted.');
    return hash;
  }

  async castVote(type, contractAddress, proposalId, optionIndices, weights, options = {}) {
    requireAddress(contractAddress, 'Voting contract address');
    try { requireValidVoteWeights(weights, optionIndices); } catch {
      throw new Error('Choose matching voting options and whole percentage weights totaling 100.');
    }
    requireRawUint(proposalId?._isBigNumber ? proposalId.toString() : proposalId);
    return executeCoreIntent(this.factory, this.txManager, buildVote({
      votingAddress: contractAddress, votingAbiName: abiNameFor(type), proposalId, optionIndices, weights,
    }), options);
  }

  async castHybridVote(contractAddress, proposalId, optionIndices, weights, options = {}) {
    return this.castVote(VotingType.HYBRID, contractAddress, proposalId, optionIndices, weights, options);
  }

  async castDDVote(contractAddress, proposalId, optionIndices, weights, options = {}) {
    return this.castVote(VotingType.DIRECT_DEMOCRACY, contractAddress, proposalId, optionIndices, weights, options);
  }

  async announceWinner(type, contractAddress, proposalId, options = {}) {
    requireAddress(contractAddress, 'Voting contract address');
    requireRawUint(proposalId?._isBigNumber ? proposalId.toString() : proposalId);
    return executeCoreIntent(this.factory, this.txManager, buildAnnounceWinner({
      votingAddress: contractAddress, votingAbiName: abiNameFor(type), proposalId,
    }), { callGasLimitMultiplier: 3n, ...options });
  }

  async announceHybridWinner(contractAddress, proposalId, options = {}) {
    return this.announceWinner(VotingType.HYBRID, contractAddress, proposalId, options);
  }

  async announceDDWinner(contractAddress, proposalId, options = {}) {
    return this.announceWinner(VotingType.DIRECT_DEMOCRACY, contractAddress, proposalId, options);
  }

  async getHybridClasses(contractAddress) {
    requireAddress(contractAddress, 'HybridVoting contract address');
    return this.factory.createReadOnly(contractAddress, getAbi('HybridVotingNew')).getClasses();
  }

  // Historical public name: the Hybrid getter supplies support percentage.
  async getHybridQuorum(contractAddress) {
    requireAddress(contractAddress, 'HybridVoting contract address');
    return this.factory.createReadOnly(contractAddress, getAbi('HybridVotingNew')).thresholdPct();
  }

  // Quorum is a minimum voter count, distinct from the support percentage.
  async getDDQuorum(contractAddress) {
    requireAddress(contractAddress, 'DirectDemocracyVoting contract address');
    return this.factory.createReadOnly(contractAddress, getAbi('DirectDemocracyVotingNew')).quorum();
  }
}

export function createVotingService(factory, txManager, ipfsService = null) {
  return new VotingService(factory, txManager, ipfsService);
}
