import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { constants } from 'ethers';
import { bytes32ToCidV0 } from '@poa-box/core/encoding/cid';
import { getAbi } from '@poa-box/core/contracts';
import { Contract, utils } from 'ethers';
import { VotingService } from '@/services/web3/domain/VotingService';
import { submitTrackedRoleProposal } from '@/hooks/runtime/roleSubmissionTransport';
import { createRoleReviewSession } from '@/lib/accessV2/roleReview';
import { RoleCreationService } from '@/services/web3/domain/RoleCreationService';
import { operationFixture } from '@/lib/accessV2/roleObservationFixtures';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const address = `0x${'1'.repeat(40)}`, cid = bytes32ToCidV0(`0x${'ab'.repeat(32)}`);
beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('OFFLINE_NETWORK_FORBIDDEN'); })));
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe('role final transport handoff after real governance envelope upload', () => {
  function fixture() {
    const gate = deferred(), execute = vi.fn(async () => ({ success: true, receipt: { transactionHash: 'receipt' } }));
    const voting = new VotingService({ createWritable: () => new Contract(address, getAbi('HybridVotingNew')) }, { execute },
      { addToIpfs: vi.fn(async () => { await gate.promise; return { path: cid }; }) });
    const tracker = { revalidate: vi.fn(async () => {}), assertCurrent: vi.fn(), bindIntent: vi.fn(),
      captureSubmitted: vi.fn(), complete: vi.fn(), notSubmitted: vi.fn() };
    const submit = () => submitTrackedRoleProposal(voting, tracker, service => service.createHybridProposal(address,
      { name: 'Builders', description: 'Enclosing ballot details', durationMinutes: 60, numOptions: 2,
        optionNames: ['Create role', 'Reject'], batches: [[{ target: address, data: '0x1234', value: '0' }], []] }));
    return { gate, execute, voting, tracker, submit };
  }
  it.each(['changed facts', 'expired evidence', 'changed account', 'changed organization'])('prevents manager dispatch for %s after delayed metadata', async reason => {
    const f = fixture();
    const pending = f.submit(); await Promise.resolve();
    expect(f.tracker.revalidate).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
    f.tracker.revalidate.mockRejectedValue(Object.assign(new Error(`Role settings unavailable: ${reason}`), { code: 'ROLE_OPERATION_UNAVAILABLE' }));
    f.gate.resolve(); await expect(pending).rejects.toMatchObject({ code: 'ROLE_OPERATION_UNAVAILABLE' });
    expect(f.tracker.revalidate).toHaveBeenCalledOnce(); expect(f.tracker.bindIntent).not.toHaveBeenCalled();
    expect(f.tracker.notSubmitted).toHaveBeenCalledOnce(); expect(f.execute).not.toHaveBeenCalled(); expect(f.tracker.complete).not.toHaveBeenCalled();
  });
  it('checks current scope again after revalidation and before binding or manager entry', async () => {
    const f = fixture(); f.tracker.assertCurrent.mockImplementation(() => { throw new Error('Account changed'); });
    const pending = f.submit(); f.gate.resolve(); await expect(pending).rejects.toThrow('Account changed');
    expect(f.tracker.bindIntent).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
    expect(f.tracker.notSubmitted).toHaveBeenCalledOnce();
  });
  it('persists completion before page work and preserves the exact prepared calldata and payable values', async () => {
    const f = fixture(); const pending = f.submit(); f.gate.resolve(); await pending;
    expect(f.tracker.revalidate.mock.invocationCallOrder[0]).toBeLessThan(f.tracker.bindIntent.mock.invocationCallOrder[0]);
    expect(f.tracker.bindIntent.mock.invocationCallOrder[0]).toBeLessThan(f.execute.mock.invocationCallOrder[0]);
    expect(f.tracker.complete).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    const [contract, method, args, options] = f.execute.mock.calls[0];
    const decoded = new utils.Interface(getAbi('HybridVotingNew')).parseTransaction({ data: contract.interface.encodeFunctionData(method, args) });
    expect(decoded.args.batches[0][0].data).toBe('0x1234'); expect(options.value).toBe('0');
    expect(decoded.args.descriptionHash).not.toBe(constants.HashZero);
  });
  it('closes a genuine delayed-envelope clock window through the host review session', async () => {
    const f = fixture(); let now = 1001;
    const handle = { mode: 'create', requiresConfiguration: false, preview: { callCount: 1, createsSubject: true } };
    const service = { reviewRoleOperation: async () => ({ status: 'ready', data: handle }),
      prepareRoleOperation: async () => ({ status: 'ready', data: { ...handle, batch: [{ target: address, value: '0', calldata: '0x1234' }] } }),
      revalidatePreparedRoleOperation: vi.fn(async () => now > 1030 ? { status: 'unknown', codes: ['STALE_HEAD'] } : { status: 'ready', data: handle }) };
    const session = createRoleReviewSession({ service, describe: async () => ({ input: { request: {}, scope: {} } }), uploadDocument: vi.fn() });
    const form = { name: 'Builders', sponsorship: { enabled: false } }; await session.review(form);
    const built = await session.prepare(form); f.tracker.revalidate = built.revalidate;
    const pending = f.submit(); now = 1032; f.gate.resolve();
    await expect(pending).rejects.toMatchObject({ code: 'ROLE_OPERATION_UNAVAILABLE' });
    expect(service.revalidatePreparedRoleOperation).toHaveBeenCalledOnce(); expect(f.execute).not.toHaveBeenCalled();
  });
  it.each(['expired', 'module'])('uses the actual packed role API to prevent dispatch after a delayed envelope and %s change', async change => {
    const form = { name: 'Builders', creationMode: 'staged', sponsorship: { enabled: false } };
    const reads = await operationFixture({}, form); let now = 1001;
    reads.input.now = () => now;
    const service = new RoleCreationService(reads.input.readFactory);
    const session = createRoleReviewSession({ service,
      describe: async () => ({ input: reads.input }), uploadDocument: vi.fn() });
    const reviewed = await session.review(form);
    expect(reviewed.plan.status).toBe('ready'); expect(reviewed.plan.data.currentEffects).toContainEqual({ field: 'name' });
    const built = await session.prepare(form), gate = deferred(), execute = vi.fn();
    const target = reads.input.scope.contracts.hybridVoting;
    const voting = new VotingService({ createWritable: () => new Contract(target, getAbi('HybridVotingNew')) }, { execute },
      { addToIpfs: vi.fn(async () => { await gate.promise; return { path: cid }; }) });
    const tracker = { revalidate: built.revalidate, assertCurrent: vi.fn(), bindIntent: vi.fn(),
      captureSubmitted: vi.fn(), complete: vi.fn(), notSubmitted: vi.fn() };
    const pending = submitTrackedRoleProposal(voting, tracker, wallet => wallet.createHybridProposal(target,
      { name: 'Builders', description: 'Enclosing ballot details', durationMinutes: 60, numOptions: 2,
        optionNames: ['Create role', 'Reject'], batches: [built.batch, []] }));
    await Promise.resolve(); expect(execute).not.toHaveBeenCalled();
    if (change === 'expired') now = 1032;
    else {
      const block = { number: 124, hash: utils.id('changed module head'), timestamp: 1001 };
      reads.indexedResponse._meta.block = block;
      reads.indexedResponse.organization.executorContract.id = reads.input.scope.contracts.membershipAuthority;
      reads.provider.getBlock.mockResolvedValue(block);
    }
    gate.resolve();
    await expect(pending).rejects.toMatchObject({ code: 'ROLE_OPERATION_UNAVAILABLE' });
    expect(tracker.bindIntent).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
    expect(tracker.notSubmitted).toHaveBeenCalledOnce();
  });
});
