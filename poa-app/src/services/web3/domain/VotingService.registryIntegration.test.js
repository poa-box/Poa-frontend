import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { constants, utils } from 'ethers';
import { getAbi } from '@poa-box/core/contracts';
import { VotingService, VotingType } from '@/services/web3/domain/VotingService';
import { votingLaneForBatches } from '@/components/voting/create/wizardSteps';

const votingAddress = `0x${'1'.repeat(40)}`, target = `0x${'2'.repeat(40)}`;
const subject = ((1n << 223n) + 900719925474099312345n).toString();
const changedSubject = (BigInt(subject) + 1n).toString();
const cid = 'QmYwAPJzv5CZsnAzt8auVZRnGFWVkCRyd6jGV4q4BNToea';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };
const poll = () => ({ name: 'Choose together', description: 'Keep the reviewed choices', durationMinutes: 60,
  numOptions: 2, optionNames: ['Approve', 'Keep'], batches: [], createdAt: 1770000000123 });
function fixture(upload = async () => ({ path: cid })) {
  const manager = { execute: vi.fn(async () => ({ success: true, receipt: { logs: [] } })) };
  const factory = { createWritable: vi.fn((address, abi) => ({ address, interface: new utils.Interface(abi) })) };
  const ipfs = { addToIpfs: vi.fn(upload) };
  return { manager, factory, ipfs, service: new VotingService(factory, manager, ipfs) };
}
beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('OFFLINE_NETWORK_FORBIDDEN'); })));
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe('installed-package vote creation at the host boundary', () => {
  it.each(['hatIds', 'subjectIds'])('keeps reviewed %s and exact custom calls stable while metadata is pending', async restriction => {
    const gate = deferred(), f = fixture(async () => { await gate.promise; return { path: cid }; });
    const request = { ...poll(), [restriction]: [subject],
      batches: [[{ target, value: '900719925474099312345', data: '0x1234' }], []] };
    const pending = f.service.createHybridProposal(votingAddress, request);
    expect(f.ipfs.addToIpfs).toHaveBeenCalledOnce(); expect(f.manager.execute).not.toHaveBeenCalled();
    request[restriction][0] = changedSubject;
    request.batches[0][0].target = votingAddress; request.batches[0][0].value = '1'; request.batches[0][0].data = '0xffff';
    request.optionNames[0] = 'Changed after approval';
    gate.resolve(); await pending;
    const [contract, method, args] = f.manager.execute.mock.calls[0];
    const decoded = contract.interface.parseTransaction({ data: contract.interface.encodeFunctionData(method, args) });
    expect(decoded.args.hatIds.map(String)).toEqual([subject]);
    expect(decoded.args.batches[0][0]).toMatchObject({ target, value: expect.anything(), data: '0x1234' });
    expect(decoded.args.batches[0][0].value.toString()).toBe('900719925474099312345');
    expect(JSON.parse(f.ipfs.addToIpfs.mock.calls[0][0]).optionNames).toEqual(['Approve', 'Keep']);
  });

  it.each([VotingType.HYBRID, VotingType.DIRECT_DEMOCRACY])('preserves restricted V2 poll overrides on the %s lane', async type => {
    const f = fixture();
    await f.service.createProposal(type, votingAddress, { ...poll(), subjectIds: [subject], quorumOverride: 4,
      ...(type === VotingType.HYBRID ? { equalWeight: true } : {}) });
    const [contract, method, args] = f.manager.execute.mock.calls[0];
    const parsed = contract.interface.parseTransaction({ data: contract.interface.encodeFunctionData(method, args) });
    expect(method).toBe('createProposalV2'); expect(parsed.args.hatIds.map(String)).toEqual([subject]);
    expect(parsed.args.quorumOverride).toBe(4);
    if (type === VotingType.HYBRID) expect(parsed.args.equalWeight).toBe(true);
  });

  it('routes every custom executable option to Hybrid and refuses DD before content publication', async () => {
    const f = fixture(), calls = [[], [{ target, value: '0', data: '0x1234' }]];
    expect(votingLaneForBatches(calls)).toBe('hybrid');
    await expect(f.service.createDDProposal(votingAddress, { ...poll(), batches: calls })).rejects.toThrow('EXECUTING_BATCH_REQUIRES_HYBRID');
    expect(f.ipfs.addToIpfs).not.toHaveBeenCalled(); expect(f.manager.execute).not.toHaveBeenCalled();
  });

  it('preserves a voting-class replacement batch and stable subject binding through the installed ABI', async () => {
    const f = fixture(), voting = new utils.Interface(getAbi('HybridVotingNew'));
    const configuration = [[0, 60, false, '0', constants.AddressZero, []], [1, 40, true, '9007199254740993', target, [subject]]];
    const calls = [{ target: votingAddress, value: '0', data: voting.encodeFunctionData('setClasses', [configuration]) },
      { target: votingAddress, value: '0', data: voting.encodeFunctionData('setClassSubject', [1, subject]) }];
    await f.service.createHybridProposal(votingAddress, { ...poll(), batches: [calls, []], actionSummaries: ['Update the voting groups.'] });
    const [, , args] = f.manager.execute.mock.calls[0];
    const classes = voting.decodeFunctionData('setClasses', args[4][0][0][2])[0];
    expect(classes[1].minBalance.toString()).toBe('9007199254740993'); expect(classes[1].hatIds.map(String)).toEqual([subject]);
    expect(voting.decodeFunctionData('setClassSubject', args[4][0][1][2])[1].toString()).toBe(subject);
    expect(JSON.parse(f.ipfs.addToIpfs.mock.calls[0][0]).actionSummaries).toEqual(['Update the voting groups.']);
  });

  it.each(['metadata failure', 'wrong content pointer', 'manager scope refusal'])('does not report a successful proposal after %s', async failure => {
    const f = fixture();
    if (failure === 'metadata failure') f.ipfs.addToIpfs.mockRejectedValue(new Error('Content unavailable'));
    else if (failure === 'wrong content pointer') f.ipfs.addToIpfs.mockResolvedValue({ path: 'invalid' });
    else f.manager.execute.mockRejectedValue(new Error('Your account or organization changed'));
    await expect(f.service.createHybridProposal(votingAddress, poll())).rejects.toThrow();
    if (failure !== 'manager scope refusal') expect(f.manager.execute).not.toHaveBeenCalled();
  });
});
