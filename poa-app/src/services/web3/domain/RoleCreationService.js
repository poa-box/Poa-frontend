/** Read-only preflights for proposal configuration, always on the org's chain. */
import { providers, utils } from 'ethers';
import { ContractFactory } from '@/services/web3/core/ContractFactory';
import { getAbi } from '@poa-box/core/contracts';
import { parseCreatedProposalId } from '@/lib/voting/proposalReceipt';
import { createRoleCreationWorkflow } from '@/services/web3/domain/RoleCreationWorkflow';
import { createRoleOperationHost } from '@/lib/accessV2/roleOperationHost';
import { buildRoleFormBatch, normalizeRoleForm, roleOptionNames } from '@/lib/accessV2/roleFormBatch';
import { roleFormRequest } from '@/lib/accessV2/roleFormRequest';
import { readRoleContinuations, saveRoleContinuation, roleRecoveryIdentity } from '@/lib/accessV2/roleContinuationDraft';
import { DELEGATED_SUBMISSION_LEASE } from '@/services/web3/core/managerSubmissionScope';
export class RoleCreationService {
  constructor(readFactory) { this.readFactory = readFactory; }

  async getProposalPowerEvidence(input) {
    const { observeProposalPower } = await import('@/lib/voting/observeProposalPower');
    return observeProposalPower({ ...input, readFactory: this.readFactory });
  }

  async getDDPowerEvidence(input) {
    const { observeDDVotingEligibility } = await import('@/lib/voting/ddEligibility');
    return observeDDVotingEligibility({ ...input, readFactory: this.readFactory });
  }

  async getElectionPlanningEvidence(input) {
    const { observeElection } = await import('@/lib/accessV2/electionObservation');
    return observeElection({ ...input, readFactory: this.readFactory });
  }

  createWorkflow({ scope, observe, storage, txManager, voting, display, assertCurrent, canReview, changed }) {
    const operations = this.roleOperationHost ||= createRoleOperationHost(this.readFactory);
    const controller = createRoleCreationWorkflow({ operations, observe, assertCurrent, canReview, changed,
      proposalId: receipt => parseCreatedProposalId(receipt, scope.hybridVoting),
      store: { read: () => readRoleContinuations(storage(), scope), save: row => saveRoleContinuation(storage(), scope, row) },
      submission: { session: run => txManager.submissionController.session(run),
        withLease: (run, capability) => txManager.submissionController.withLease(run, capability, { settlement: true }),
        pending: () => txManager.getPendingSubmission(), recover: (saved, options) => txManager.reconcileSubmission(saved, options) },
      identity: (input, intent) => roleRecoveryIdentity(input, scope, intent),
      fetchDocument: display.fetchDocument, uploadDocument: display.uploadDocument,
      project: (form, operation, review, preview) => buildRoleFormBatch({ form, operation, review, preview, ...display }),
      propose: (built, proposal, { lease, publishDocument, ...options }) => voting.createHybridProposal(scope.hybridVoting, { ...proposal,
        numOptions: 2, batches: [built.batch, []], optionNames: roleOptionNames(built), createsSubject: built.createsSubject,
        actionSummaries: [...built.summaries, ...built.warnings.map(warning => `Worth knowing: ${warning}`)],
      }, { ...options, [DELEGATED_SUBMISSION_LEASE]: lease,
        publishMetadata: json => publishDocument({ key: 'proposal-metadata', digest: utils.id(json), json }) }),
    });
    const input = form => {
      const draft = normalizeRoleForm(form), normalized = { ...draft }; delete normalized.continuationId;
      return { request: roleFormRequest(form), draft, draftKey: utils.id(JSON.stringify(normalized)), continuationId: draft.continuationId };
    };
    return { ...controller,
      review: (form, options) => controller.review(input(form), options).catch(error => {
        if (error?.name === 'AbortError' || error?.code === 'PLANNING_READ_LIMIT' || error?.code === 'ROLE_OPERATION_UNAVAILABLE') throw error;
        throw new Error('Current role settings could not be verified. Refresh and review them again.', { cause: error });
      }),
      submit: ({ form, proposal, ...options }) => controller.submit(input(form), proposal, options),
    };
  }

  async getElectionAcceptance(authorityAddress, requests) {
    const authority = this.readFactory.createReadOnly(authorityAddress, getAbi('MembershipAuthority'));
    const entries = await Promise.all(requests.map(async ({ subjectId, addresses }) => {
      const unique = [...new Set(addresses.filter(Boolean).map(address => String(address).toLowerCase()))];
      const statuses = await Promise.all(unique.map(async address => {
        const status = await authority.getStatus(subjectId, address);
        const accepted = status?.accepted ?? status?.[0];
        if (typeof accepted !== 'boolean') throw new Error('Current role acceptance is unavailable.');
        return [address, accepted];
      }));
      return [String(subjectId), Object.fromEntries(statuses)];
    }));
    return Object.fromEntries(entries);
  }

}

/** Submission-only compatibility preflight. Never runs in a page's read/render path. */
export async function readElectionAcceptance({ authority, rpcUrl, chainId, networkName, requests, readFactory }) {
  const factory = readFactory || new ContractFactory(null, new providers.JsonRpcProvider(
    rpcUrl, { chainId, name: networkName || `chain-${chainId}` },
  ));
  return new RoleCreationService(factory).getElectionAcceptance(authority, requests);
}
