import { describe, expect, it, vi } from 'vitest';
import { composeSubjectId } from '@poa-box/core/authority/ids';
import { permissionWord } from '@poa-box/core/tx/authority';
import { observeDDVotingEligibility, ddEligibilityFact } from '@/lib/voting/ddEligibility';
import { voterEligibility } from '@/components/voting/votingDisplay';
import { PERM_KEYS, GLOBAL_CTX } from '@/lib/accessV2/permKeys';

const addr = n => `0x${n.repeat(40)}`;
const authorityAddress = addr('1'), voting = addr('2'), account = addr('3'), executor = addr('4');
const orgId = `0x${'5'.repeat(64)}`, hash = `0x${'6'.repeat(64)}`;
const role = composeSubjectId(authorityAddress, '1'), group = composeSubjectId(authorityAddress, '2');
function fixture() {
  const source = { chainId: 100, orgId, contract: authorityAddress, endpoint: 'https://index.example',
    method: 'authority', indexed: true, snapshot: 'pinned', block: { number: '123', hash } };
  const authority = { source, coverage: { status: 'complete', receivedKeys: [], missingIds: [], failedIds: [], issues: [] }, data: {
    authority: { executor }, subjects: [{ subjectId: role, name: 'Members', kind: 'Role' }, { subjectId: group, name: 'Voters', kind: 'Group' }],
    groupEdges: [{ id: 'edge', roleSubjectId: role, groupSubjectId: group, isActive: true }],
    permissions: [{ id: 'vote', subjectId: group, permKey: PERM_KEYS.DD_VOTE, ctx: GLOBAL_CTX, word: permissionWord('1', false).toString() }],
    memberships: [{ id: 'member', user: account, accepted: true, acceptedAt: '20', seededWhilePaused: true,
      ruleKind: 'None', rule: null, pendingAction: null, emailVerified: false, vouchCount: '0', vouchEpoch: '0',
      subject: { subjectId: role, kind: 'Role', defaultAllow: true, vouchConfig: null } }],
  } };
  const scope = { chainId: 100, orgId, account, contract: voting, contracts: { membershipAuthority: authorityAddress, executor } };
  const response = { _meta: { block: { number: 123, hash } }, organization: { id: orgId, directDemocracyVoting: { id: voting } }, proposals: [],
    ddvproposals: [{ id: `${voting}-9`, proposalId: '9', createdAtBlock: '100', startTimestamp: '10',
      isHatRestricted: true, restrictedHatIds: [group], directDemocracyVoting: { id: voting, organization: { id: orgId } } }] };
  const votingModule = { proposalCreatedAt: vi.fn(async () => '10'), membershipAuthority: vi.fn(async () => authorityAddress),
    executor: vi.fn(async () => executor), pollRestricted: vi.fn(async () => response.ddvproposals[0].isHatRestricted) };
  const provider = { getNetwork: vi.fn(async () => ({ chainId: 100 })), getBlock: vi.fn(async () => ({ number: 123, hash })) };
  return { authority, scope, query: async () => response, proposalId: '9', response, votingModule, provider,
    rpcEndpoint: 'https://rpc.example', readFactory: { provider, createReadOnly: () => votingModule } };
}
describe('current DD authority eligibility', () => {
  it('honors group DD_VOTE and seeded activation instead of legacy voting-hat arrays', async () => {
    const evidence = await observeDDVotingEligibility(fixture());
    expect(ddEligibilityFact(evidence)).toMatchObject({ state: 'known', value: true });
    expect(voterEligibility({ type: 'Direct Democracy' }, [], { ddVotingHats: [], powerEvidence: evidence })).toMatchObject({ eligible: true, indeterminate: false });
  });
  it('withholds a membership activated after the proposal and rejects cross-account reuse', async () => {
    const input = fixture(); input.authority.data.memberships[0].seededWhilePaused = false;
    const evidence = await observeDDVotingEligibility(input);
    expect(ddEligibilityFact(evidence)).toMatchObject({ state: 'known', value: false });
    expect(ddEligibilityFact({ ...evidence, scope: { ...input.scope, account: addr('8') } }).state).toBe('unknown');
  });
  it('lets the executor bypass general permission but never restricted activation', async () => {
    const input = fixture(); input.scope = { ...input.scope, account: executor };
    input.response.ddvproposals[0].isHatRestricted = false;
    input.response.ddvproposals[0].restrictedHatIds = [];
    expect(ddEligibilityFact(await observeDDVotingEligibility(input))).toMatchObject({ state: 'known', value: true });
    input.response.ddvproposals[0].isHatRestricted = true;
    input.response.ddvproposals[0].restrictedHatIds = [group];
    expect(ddEligibilityFact(await observeDDVotingEligibility(input)).state).toBe('unknown');
    input.authority.data.memberships[0].user = executor;
    input.authority.data.memberships[0].seededWhilePaused = false;
    expect(ddEligibilityFact(await observeDDVotingEligibility(input))).toMatchObject({ state: 'known', value: false });
    input.authority.data.memberships[0].seededWhilePaused = true;
    expect(ddEligibilityFact(await observeDDVotingEligibility(input))).toMatchObject({ state: 'known', value: true });
  });
  it('uses proposalCreatedAt rather than a guessed start timestamp', async () => {
    const input = fixture(); input.authority.data.memberships[0].seededWhilePaused = false;
    input.votingModule.proposalCreatedAt.mockResolvedValue('30');
    expect(ddEligibilityFact(await observeDDVotingEligibility(input))).toMatchObject({ state: 'known', value: true });
    expect(input.votingModule.proposalCreatedAt).toHaveBeenCalledWith('9', { blockTag: 123 });
  });
  it('withholds absent, foreign, partial and zero-authority observations', async () => {
    const missing = fixture(); delete missing.response._meta;
    await expect(observeDDVotingEligibility(missing)).rejects.toThrow();
    const zero = fixture(); zero.votingModule.membershipAuthority.mockResolvedValue(addr('0'));
    expect(ddEligibilityFact(await observeDDVotingEligibility(zero))).toMatchObject({ state: 'known', value: false });
    const foreign = fixture(); foreign.votingModule.membershipAuthority.mockResolvedValue(addr('8'));
    await expect(observeDDVotingEligibility(foreign)).rejects.toThrow();
    const partial = fixture(); partial.authority.coverage.status = 'incomplete';
    await expect(observeDDVotingEligibility(partial)).rejects.toThrow();
    const fork = fixture(); fork.provider.getBlock.mockResolvedValue({ number: 123, hash: `0x${'9'.repeat(64)}` });
    await expect(observeDDVotingEligibility(fork)).rejects.toThrow();
  });
});
