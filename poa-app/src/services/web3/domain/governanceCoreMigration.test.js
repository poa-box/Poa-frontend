import { describe, it, expect, vi } from 'vitest';
import { utils, BigNumber } from 'ethers';
import HybridABI from '../../../../abi/HybridVotingNew.json';
import DDABI from '../../../../abi/DirectDemocracyVotingNew.json';
import { VotingService, VotingType } from './VotingService';
import { RoleCreationService, readElectionAcceptance } from './RoleCreationService';

const votingAddress = '0x1111111111111111111111111111111111111111';
const target = '0x2222222222222222222222222222222222222222';
const subjectId = ((1n << 223n) + 900719925474099312345n).toString();
const proposalId = '90071992547409931234567890';
const value = '900719925474099312345678901234567890';
const cid = 'QmYwAPJzv5CZsnAzt8auVZRnGFWVkCRyd6jGV4q4BNToea';
const setup = () => {
  const contract = {};
  const result = { success: true, receipt: { logs: [] }, extraHostField: true };
  const factory = { createWritable: vi.fn().mockReturnValue(contract), createReadOnly: vi.fn() };
  const manager = { execute: vi.fn().mockResolvedValue(result) };
  const ipfs = { addToIpfs: vi.fn().mockResolvedValue({ path: cid }) };
  return { factory, manager, ipfs, result, service: new VotingService(factory, manager, ipfs) };
};
const poll = { name: 'Choose together', durationMinutes: 60, numOptions: 2, optionNames: ['Yes', 'No'] };

describe('core governance intents through the real host bridge', () => {
  it('preserves nested option batches, exact wei/subject IDs, metadata and opaque host results/options', async () => {
    const { service, manager, factory, result, ipfs } = setup();
    const callback = vi.fn();
    const scopeGuard = vi.fn();
    const returned = await service.createHybridProposal(votingAddress, { ...poll, hatIds: [subjectId],
      batches: [[{ target, value, data: '0x1234' }], []],
      actionSummaries: ['Apply the selected action'], createdAt: 1770000000123,
      promotedFrom: 'dd-1', createsSubject: false, schemaVersion: 1,
      extensions: { custom: { preserved: false, count: 0, exact: value } },
    }, { onSuccess: callback, isCurrentScope: scopeGuard, callGasLimitFloor: 7654321 });
    expect(returned).toBe(result);
    const [, method, args, options] = manager.execute.mock.calls[0];
    expect(method).toBe('createProposal');
    const abi = factory.createWritable.mock.calls[0][1];
    const actual = new utils.Interface(abi).encodeFunctionData(method, args);
    const expected = new utils.Interface(HybridABI).encodeFunctionData('createProposal', [
      utils.toUtf8Bytes(poll.name), args[1], 60, 2, [[[target, value, '0x1234']], []], [subjectId],
    ]);
    expect(actual).toBe(expected);
    expect(options).toMatchObject({ onSuccess: callback, isCurrentScope: scopeGuard, callGasLimitFloor: 7654321, value: '0' });
    expect(JSON.parse(ipfs.addToIpfs.mock.calls[0][0])).toEqual({ description: '', optionNames: ['Yes', 'No'],
      createdAt: 1770000000123, actionSummaries: ['Apply the selected action'], promotedFrom: 'dd-1',
      createsSubject: false, schemaVersion: 1, extensions: { custom: { count: 0, exact: value, preserved: false } } });
  });

  it('keeps DD call-free and rejects executable DD before upload or send', async () => {
    const { service, factory, manager, ipfs } = setup();
    await expect(service.createDDProposal(votingAddress, { ...poll, batches: [[{ target, value: '0', data: '0x' }], []] }))
      .rejects.toThrow('EXECUTING_BATCH_REQUIRES_HYBRID');
    expect(ipfs.addToIpfs).not.toHaveBeenCalled();
    expect(manager.execute).not.toHaveBeenCalled();
    await service.createDDProposal(votingAddress, poll);
    const [, method, args] = manager.execute.mock.calls[0];
    expect(args[4]).toEqual([]);
    expect(new utils.Interface(factory.createWritable.mock.calls[0][1]).encodeFunctionData(method, args))
      .toBe(new utils.Interface(DDABI).encodeFunctionData(method, args));
  });

  it.each(['hybrid', 'dd'])('casts exact large proposal IDs and preserves finalization gas overrides on %s', async type => {
    const { service, manager, result } = setup();
    expect(await service.castVote(type, votingAddress, proposalId, [0, 1], [37, 63])).toBe(result);
    expect(manager.execute.mock.calls[0].slice(1, 3)).toEqual(['vote', [proposalId, [0, 1], [37, 63]]]);
    expect(await service.announceWinner(type, votingAddress, proposalId,
      { gasLimit: 2000000, callGasLimitFloor: 2000000, callGasLimitMultiplier: 5n })).toBe(result);
    expect(manager.execute.mock.calls[1][3]).toMatchObject({ gasLimit: 2000000, callGasLimitFloor: 2000000, callGasLimitMultiplier: 5n });
  });

  it('rejects invalid allocations, unsafe IDs and unknown dispatch without sending', async () => {
    const { service, manager } = setup();
    for (const [id, indices, weights] of [[proposalId, [0], [30, 70]], [proposalId, [0, 1], [30.5, 69.5]],
      [Number.MAX_SAFE_INTEGER + 1, [0], [100]], [proposalId, [0], [-1]], [proposalId, [0, 0], [50, 50]],
      [proposalId, [0], ['100']], [proposalId, [0, 1], [NaN, 100]]]) {
      await expect(service.castVote(VotingType.HYBRID, votingAddress, id, indices, weights)).rejects.toThrow();
    }
    await expect(service.announceWinner('unknown', votingAddress, proposalId)).rejects.toThrow('Unknown voting type');
    expect(manager.execute).not.toHaveBeenCalled();
  });

  it('rejects invalid duration, native values and metadata before sending', async () => {
    const { service, ipfs, manager } = setup();
    await expect(service.createHybridProposal(votingAddress, { ...poll, durationMinutes: 9 })).rejects.toThrow('DURATION_OUT_OF_RANGE');
    await expect(service.createHybridProposal(votingAddress, { ...poll,
      batches: [[{ target, value: Number.MAX_SAFE_INTEGER + 1, data: '0x' }], []] })).rejects.toThrow();
    await expect(service.createHybridProposal(votingAddress, { ...poll, createsSubject: 'yes' })).rejects.toThrow('INVALID_CREATION_MARKER');
    expect(ipfs.addToIpfs).not.toHaveBeenCalled();
    ipfs.addToIpfs.mockResolvedValue({ path: 'Qmnot-a-cid' });
    await expect(service.createHybridProposal(votingAddress, poll)).rejects.toThrow();
    expect(manager.execute).not.toHaveBeenCalled();
  });

  it('reads real factory methods and DD quorum independently of support threshold', async () => {
    const { service, factory } = setup();
    const classes = [{ strategy: 0 }];
    const contract = { getClasses: vi.fn().mockResolvedValue(classes), thresholdPct: vi.fn().mockResolvedValue(66),
      quorum: vi.fn().mockResolvedValue(BigNumber.from('99')) };
    factory.createReadOnly.mockReturnValue(contract);
    expect(await service.getHybridClasses(votingAddress)).toBe(classes);
    expect(await service.getHybridQuorum(votingAddress)).toBe(66);
    expect((await service.getDDQuorum(votingAddress)).toString()).toBe('99');
    expect(contract.quorum).toHaveBeenCalledTimes(1);
    expect(contract.thresholdPct).toHaveBeenCalledTimes(1);
  });

  it('keeps election acceptance reads inside the domain service with an injected org-chain factory', async () => {
    const getStatus = vi.fn().mockImplementation(async (_subject, account) => ({ accepted: account === target }));
    const readFactory = { createReadOnly: vi.fn().mockReturnValue({ getStatus }) };
    const requests = [{ subjectId, addresses: [target, target.toUpperCase(), votingAddress] }];
    const result = await readElectionAcceptance({ authority: votingAddress, readFactory, requests });
    expect(result).toEqual({ [subjectId]: { [target]: true, [votingAddress]: false } });
    expect(getStatus).toHaveBeenCalledTimes(2);
    expect(readFactory.createReadOnly).toHaveBeenCalledWith(votingAddress, expect.any(Array));
    expect(new RoleCreationService(readFactory)).toBeInstanceOf(RoleCreationService);
  });
});
