import { describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { getAbi } from '@poa-box/core/contracts';
import { subjectCreationRaceFacts } from '@poa-box/core/authority/ids';
import { recoverPlanningSubjectHistory } from '@/lib/accessV2/historicalSubjectRecovery';

const VOTING = `0x${'11'.repeat(20)}`, AUTHORITY = `0x${'22'.repeat(20)}`, ACCOUNT = `0x${'33'.repeat(20)}`;
const TX = `0x${'a1'.repeat(32)}`, HASH = `0x${'b2'.repeat(32)}`, OLD = `0x${'c3'.repeat(32)}`, META = `0x${'d4'.repeat(32)}`;
const authority = new ethers.utils.Interface(getAbi('MembershipAuthority'));
const voting = new ethers.utils.Interface(getAbi('HybridVotingNew'));
const scope = { chainId: 100, orgId: 'test-org', contract: VOTING, contracts: { membershipAuthority: AUTHORITY } };
const source = { ...scope, endpoint: 'mock://index', method: 'exact-proposal', indexed: true, snapshot: 'pinned', block: { number: '100', hash: HASH }, observedAt: 1000 };
const rpcSource = { ...source, endpoint: 'mock://rpc', method: 'exact-receipt', indexed: false };
const coverage = { status: 'complete', receivedKeys: [], missingIds: [], failedIds: [], issues: [] };
function fixture(creates = false) {
  const title = ethers.utils.hexlify(ethers.utils.toUtf8Bytes('Historical role'));
  const inner = authority.encodeFunctionData(creates ? 'createRole' : 'renameSubject', creates ? ['Stewards', META, '', 0] : ['9', 'New name', META, '']);
  const event = voting.encodeEventLog(voting.getEvent('NewProposal'), [7, title, META, 2, 1600, 1000]);
  const tx = { hash: TX, blockNumber: 50, blockHash: OLD, from: ACCOUNT, to: VOTING,
    data: voting.encodeFunctionData('createProposal', [title, META, 10, 2, [[[AUTHORITY, 0, inner]], []], []]), value: ethers.BigNumber.from(0), chainId: 100 };
  const receipt = { status: 1, transactionHash: TX, blockNumber: 50, blockHash: OLD,
    logs: [{ ...event, address: VOTING, transactionHash: TX, blockNumber: 50, blockHash: OLD, removed: false }] };
  const row = { id: `${VOTING}-7`, proposalId: '7', title: 'Historical role', descriptionHash: META, numOptions: 2,
    transactionHash: TX, createdAtBlock: '50', hybridVoting: { id: VOTING, organization: { id: scope.orgId } } };
  const response = { _meta: { block: { number: 100, hash: HASH } }, organization: { id: scope.orgId,
    membershipAuthority: { id: AUTHORITY }, hybridVoting: { id: VOTING } }, proposals: [row] };
  const provider = { getNetwork: vi.fn(async () => ({ chainId: 100 })), getTransaction: vi.fn(async () => tx),
    getTransactionReceipt: vi.fn(async () => receipt), getBlock: vi.fn(async tag => ({ number: tag === '0x32' ? 50 : 100, hash: tag === '0x32' ? OLD : HASH })) };
  const query = vi.fn(async () => response);
  const history = { source, coverage, data: [{ id: row.id, createsSubject: false, wasExecuted: false, status: 'Ended' }] };
  const input = { scope, history, rpcSource, provider, query, now: () => 1000 };
  return { input, provider, query, tx, response, history };
}
describe('installed core proofs in the actual planner adapter', () => {
  it.each([true, false])('recovers creation=%s and preserves the allocator race boundary', async creates => {
    const f = fixture(creates);
    const recovered = await recoverPlanningSubjectHistory(f.input);
    expect(recovered.data[0].createsSubject).toBe(creates);
    expect(subjectCreationRaceFacts(recovered, scope).hasCompetingCreation).toMatchObject({ state: 'known', value: creates });
    expect(recovered.coverage).toBe(coverage);
    await recoverPlanningSubjectHistory(f.input);
    expect(f.query).toHaveBeenCalledOnce();
    expect(f.provider.getTransaction).toHaveBeenCalledExactlyOnceWith(TX);
  });
  it.each(['missing', 'foreign-org', 'wrong-target', 'stale', 'reorg'])('keeps %s evidence unknown instead of allocating a guessed subject', async mode => {
    const f = fixture();
    if (mode === 'missing') f.response.proposals = [];
    if (mode === 'foreign-org') f.response.organization.id = 'foreign';
    if (mode === 'wrong-target') f.tx.to = ACCOUNT;
    if (mode === 'stale') f.input.now = () => 1031;
    if (mode === 'reorg') f.provider.getBlock.mockResolvedValue({ number: 100, hash: OLD });
    const recovered = await recoverPlanningSubjectHistory(f.input);
    expect(recovered.data[0].createsSubject).toBeUndefined();
    expect(subjectCreationRaceFacts(recovered, scope).hasCompetingCreation.state).toBe('unknown');
  });
  it('caps exact proposal reads, leaves excess unknown, and never scans history', async () => {
    const f = fixture(); f.response.proposals = [];
    f.history.data = Array.from({ length: 30 }, (_, i) => ({ id: `${VOTING}-${i}`, createsSubject: false }));
    const recovered = await recoverPlanningSubjectHistory(f.input);
    expect(f.query).toHaveBeenCalledTimes(12);
    expect(f.provider.getTransaction).not.toHaveBeenCalled();
    expect(recovered.data.every(row => row.createsSubject === undefined)).toBe(true);
    expect(recovered.coverage).toBe(coverage);
  });
});
