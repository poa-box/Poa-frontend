/** Read-only preflights for proposal configuration, always on the org's chain. */
import { providers } from 'ethers';
import { ContractFactory } from '@/services/web3/core/ContractFactory';
import { getAbi } from '@poa-box/core/contracts';
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

  async roleOperations() {
    const { createRoleOperationHost } = await import('@/lib/accessV2/roleOperationHost');
    this.roleOperationHost ||= createRoleOperationHost(this.readFactory);
    return this.roleOperationHost;
  }

  async getRolePlanningEvidence(input) { return (await this.roleOperations()).read(input); }
  async reviewRoleOperation(input) { return (await this.roleOperations()).review(input); }
  async prepareRoleOperation(input) { return (await this.roleOperations()).prepare(input); }
  async revalidatePreparedRoleOperation(input) { return (await this.roleOperations()).revalidate(input); }

  async getRoleContinuation(input) {
    const { roleCreationReference, roleConfigurationReference } = await import('@/lib/accessV2/roleFormRequest');
    return (await this.roleOperations()).status({ ...input, creation: roleCreationReference(input.creation),
      ...(input.configuration ? { configuration: roleConfigurationReference(input.configuration) } : {}) });
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
