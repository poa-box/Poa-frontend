import { describe, it, expect, vi } from 'vitest';
import { ethers } from 'ethers';
import TaskManagerABI from '../../../../abi/TaskManagerNew.json';
import { TaskService } from '@/services/web3/domain/TaskService';

const TM = `0x${'12'.repeat(20)}`;
const OTHER = `0x${'34'.repeat(20)}`;
const PID = `0x${'00'.repeat(31)}07`;
const HASH = `0x${'ab'.repeat(32)}`;
const CID = 'QmZtnFaddFtzGNT8BxdHVbQrhSFdq1pWxud5z4fA4kxfDt';
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const BIG_ID = '9007199254740993';
const iface = new ethers.utils.Interface(TaskManagerABI);
const zero = ethers.constants.AddressZero;
const hashZero = ethers.constants.HashZero;
const utf8 = ethers.utils.toUtf8Bytes;
const unit = (text, decimals = 18) => ethers.utils.parseUnits(text, decimals);

function host(ipfs = true) {
  const result = { success: true, receipt: { status: 1, logs: [] }, custom: 'preserved' };
  const txManager = { execute: vi.fn().mockResolvedValue(result) };
  const factory = { createWritable: vi.fn((address, abi) => ({ address, abi })), createReadOnly: vi.fn() };
  const storage = ipfs ? { addToIpfs: vi.fn().mockResolvedValue({ path: CID }) } : null;
  const service = new TaskService(factory, txManager, storage);
  return { service, txManager, factory, storage, result };
}
function callData(host) {
  const [contract, method, args] = host.txManager.execute.mock.calls.at(-1);
  return new ethers.utils.Interface(contract.abi).encodeFunctionData(method, args);
}
function task(extra = {}) {
  return { name: 'Shared work 🌱', description: 'Care', projectId: `${TM}-${PID}`,
    payout: '1.000000000000000001', ...extra };
}
const BASE = { name: 'Before', description: 'Existing', location: 'Remote', difficulty: 'hard',
  estHours: '0.25', submission: 'Saved work', dueDate: 2100000000, extension: { owner: 'community' } };

function expectedCreate(data, hash = HASH) {
  return [unit(String(data.payout)), utf8(data.name), hash, PID, data.bountyToken || zero,
    data.bountyToken ? unit(String(data.bountyPayout ?? 0), 6) : 0,
    data.requiresApplication ?? false, data.absoluteDeadline ?? 0, data.completionWindow ?? 0];
}

describe('TaskService core migration at the host boundary', () => {
  it('creates projects with exact raw caps, managers and empty retirement arrays', async () => {
    const h = host();
    const cap = '9007199254740993';
    const bountyCap = (2n ** 128n - 1n).toString();
    const options = { onPending: vi.fn(), scopeGuard: vi.fn(), confirmations: 3 };
    await expect(h.service.createProject(TM, { name: 'Project 🌱', cap,
      metadataHash: CID, managers: [OTHER], bountyTokens: [USDC],
      bountyCaps: [ethers.BigNumber.from(bountyCap)], createHats: [],
    }, options)).resolves.toBe(h.result);
    expect(callData(h)).toBe(iface.encodeFunctionData('createProject', [[
      utf8('Project 🌱'), HASH, cap, [OTHER], [], [], [], [], [USDC], [bountyCap],
    ]]));
    expect(h.txManager.execute.mock.calls[0][3]).toEqual({ ...options, value: '0' });
    expect(h.storage.addToIpfs).not.toHaveBeenCalled();
  });

  it('creates tasks without scaling amounts twice and pins canonical ordered metadata', async () => {
    const h = host();
    const data = task({ bountyToken: USDC, bountyPayout: '12.123456', requiresApplication: true,
      dueDate: 2100000000, absoluteDeadline: 2100000010, completionWindow: 3600 });
    await expect(h.service.createTask(TM, data)).resolves.toBe(h.result);
    expect(callData(h)).toBe(iface.encodeFunctionData('createTask', expectedCreate(data)));
    expect(h.storage.addToIpfs.mock.calls[0][0]).toBe(JSON.stringify({ name: data.name,
      description: 'Care', location: '', difficulty: 'medium', estHours: 0,
      submission: '', dueDate: 2100000000 }));
  });

  it('creates and assigns atomically, with the assignee in the deployed position', async () => {
    const h = host();
    const data = task({ bountyToken: USDC, bountyPayout: '0.000001', completionWindow: 30 });
    await h.service.createAndAssignTask(TM, data, OTHER);
    const args = expectedCreate(data);
    args.splice(4, 0, OTHER);
    expect(callData(h)).toBe(iface.encodeFunctionData('createAndAssignTask', args));
    expect(h.txManager.execute).toHaveBeenCalledTimes(1);
  });

  it('keeps the optional-storage zero pointer and atomic assignment compatibility path', async () => {
    const h = host(false);
    const data = task();
    await h.service.createAndAssignTask(TM, data, OTHER);
    const args = expectedCreate(data, hashZero);
    args.splice(4, 0, OTHER);
    expect(callData(h)).toBe(iface.encodeFunctionData('createAndAssignTask', args));
  });

  it('publishes one ordered atomic batch with at most five simultaneous uploads', async () => {
    const h = host();
    let active = 0;
    let peak = 0;
    h.storage.addToIpfs.mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active -= 1;
      return { path: CID };
    });
    const tasks = Array.from({ length: 13 }, (_, i) => task({ name: `Draft ${i}`, payout: `${i + 1}`,
      completionWindow: i, absoluteDeadline: 2100000000 + i }));
    await h.service.createTasksBatch(TM, `${TM}-${PID}`, tasks);
    expect(peak).toBe(5);
    expect(h.txManager.execute).toHaveBeenCalledTimes(1);
    const rows = tasks.map(t => { const a = expectedCreate(t); a.splice(3, 1); return a; });
    expect(callData(h)).toBe(iface.encodeFunctionData('createTasksBatch', [PID, rows]));
  });

  it.each([
    ['claimTask', 'claimTask', []], ['unclaimTask', 'unclaimTask', []],
    ['completeTask', 'completeTask', []], ['cancelTask', 'cancelTask', []],
    ['submitTask', 'submitTask', [CID]], ['rejectTask', 'rejectTask', [CID]],
    ['assignTask', 'assignTask', [OTHER]], ['approveApplication', 'approveApplication', [OTHER]],
  ])('preserves %s calldata, exact composite ID, callbacks and raw result', async (publicMethod, method, extra) => {
    const h = host();
    const options = { onSuccess: vi.fn(), scopeGuard: vi.fn(), purpose: 'host' };
    await expect(h.service[publicMethod](TM, `${TM}-${BIG_ID}`, ...extra, options)).resolves.toBe(h.result);
    const values = extra.map(value => value === CID ? HASH : value);
    expect(callData(h)).toBe(iface.encodeFunctionData(method, [BIG_ID, ...values]));
    expect(h.txManager.execute.mock.calls[0][3]).toEqual({ ...options, value: '0',
      ...(publicMethod === 'cancelTask' ? { isDelete: true } : {}) });
  });

  it('converts a CID correctly on the existing updateTask method', async () => {
    const h = host();
    const data = task({ metadataHash: CID, absoluteDeadline: 1000, completionWindow: 30 });
    await h.service.updateTask(TM, BIG_ID, data);
    expect(callData(h)).toBe(iface.encodeFunctionData('updateTask', [BIG_ID, unit(data.payout),
      utf8(data.name), HASH, zero, 0, 1000, 30]));
  });

  it.each(['editTask', 'editTaskMetadata'])('%s retains saved submission, extensions and unchanged soft date', async method => {
    const h = host();
    const data = task({ baseMetadata: BASE, estHours: '0.75', location: 'Anywhere' });
    await h.service[method](TM, BIG_ID, data);
    expect(JSON.parse(h.storage.addToIpfs.mock.calls[0][0])).toEqual({ ...BASE,
      name: data.name, description: data.description, location: 'Anywhere', estHours: '0.75' });
    const expected = method === 'editTask'
      ? [BIG_ID, unit(data.payout), utf8(data.name), HASH, zero, 0, 0, 0]
      : [BIG_ID, utf8(data.name), HASH];
    expect(callData(h)).toBe(iface.encodeFunctionData(method === 'editTask' ? 'updateTask' : 'updateTaskMetadata', expected));
  });

  it('requires saved metadata before repinning instead of blanking submission', async () => {
    const h = host();
    await expect(h.service.editTaskMetadata(TM, BIG_ID, task())).rejects.toThrow(/saved task details/i);
    expect(h.storage.addToIpfs).not.toHaveBeenCalled();
    expect(h.txManager.execute).not.toHaveBeenCalled();
  });

  it('preserves application extensions and appliedAt and sends one prepared pointer', async () => {
    const h = host();
    const metadata = { notes: 'Ready', experience: 'Care', appliedAt: '2026-01-01T00:00:00Z', attachment: 'Local extension' };
    await h.service.applyForTask(TM, `${TM}-${BIG_ID}`, metadata);
    expect(JSON.parse(h.storage.addToIpfs.mock.calls[0][0])).toEqual(metadata);
    expect(callData(h)).toBe(iface.encodeFunctionData('applyForTask', [BIG_ID, HASH]));
  });

  it('preserves delete flags and folder CAS expected root', async () => {
    const h = host();
    await h.service.deleteProject(TM, `${TM}-${PID}`, { purpose: 'delete' });
    expect(callData(h)).toBe(iface.encodeFunctionData('deleteProject', [PID]));
    expect(h.txManager.execute.mock.calls[0][3].isDelete).toBe(true);
    await h.service.setFolders(TM, hashZero, HASH);
    expect(callData(h)).toBe(iface.encodeFunctionData('setFolders', [hashZero, HASH]));
  });

  it('uses core config encoding for exact caps and organizer IDs', async () => {
    const h = host();
    await h.service.setProjectCap(TM, `${TM}-${PID}`, ethers.BigNumber.from(BIG_ID));
    expect(callData(h)).toBe(iface.encodeFunctionData('setConfig', [6,
      ethers.utils.defaultAbiCoder.encode(['bytes32', 'uint256'], [PID, BIG_ID])]));
    await h.service.setBountyCap(TM, PID, USDC, (2n ** 128n - 1n).toString());
    expect(callData(h)).toBe(iface.encodeFunctionData('setConfig', [4,
      ethers.utils.defaultAbiCoder.encode(['bytes32', 'address', 'uint256'], [PID, USDC, 2n ** 128n - 1n])]));
    await h.service.setOrganizerHatAllowed(TM, BIG_ID, true);
    expect(callData(h)).toBe(iface.encodeFunctionData('setConfig', [7,
      ethers.utils.defaultAbiCoder.encode(['uint256', 'bool'], [BIG_ID, true])]));
  });

  it('keeps ethers budget return types and exact organizer IDs on reads', async () => {
    const h = host();
    const lens = vi.fn()
      .mockResolvedValueOnce(ethers.utils.defaultAbiCoder.encode(['uint128', 'uint128', 'bool'], [BIG_ID, '7', true]))
      .mockResolvedValueOnce(ethers.utils.defaultAbiCoder.encode(['uint128', 'uint128'], [BIG_ID, '9']))
      .mockResolvedValueOnce(ethers.utils.defaultAbiCoder.encode(['bytes32'], [HASH]))
      .mockResolvedValueOnce(ethers.utils.defaultAbiCoder.encode(['uint256[]'], [[BIG_ID]]));
    h.factory.createReadOnly.mockReturnValue({ getLensData: lens });
    const project = await h.service.readProjectBudget(TM, PID);
    expect(project.cap.toString()).toBe(BIG_ID);
    expect(project.spent.toString()).toBe('7');
    expect(project.exists).toBe(true);
    const bounty = await h.service.readBountyBudget(TM, PID, USDC);
    expect(bounty.spent.toString()).toBe('9');
    await expect(h.service.readFoldersRoot(TM)).resolves.toBe(HASH);
    await expect(h.service.readOrganizerHatIds(TM)).resolves.toEqual([BIG_ID]);
    expect(lens.mock.calls.map(c => c[0])).toEqual([2, 9, 10, 11]);
    expect(h.txManager.execute).not.toHaveBeenCalled();
  });

  it('rejects foreign/unsafe task IDs and retired permissions before any side effect', async () => {
    const h = host();
    await expect(h.service.claimTask(TM, `${OTHER}-${BIG_ID}`)).rejects.toThrow(/different TaskManager/);
    await expect(h.service.claimTask(TM, Number(BIG_ID))).rejects.toThrow(/exact integer/);
    await expect(h.service.createProject(TM, { name: 'No retired roles', createHats: [BIG_ID] })).rejects.toThrow();
    await expect(h.service.createTask(TM, task({ projectId: `${OTHER}-${PID}` }))).rejects.toThrow(/different TaskManager/);
    expect(h.storage.addToIpfs).not.toHaveBeenCalled();
    expect(h.txManager.execute).not.toHaveBeenCalled();
  });

  it('rejects malformed pointers/amounts and propagates storage or manager errors unchanged', async () => {
    const h = host();
    await expect(h.service.submitTask(TM, BIG_ID, 'not a CID')).rejects.toThrow();
    await expect(h.service.createTask(TM, task({ payout: '0.0000000000000000001' }))).rejects.toThrow();
    const pinError = new Error('mock storage unavailable');
    h.storage.addToIpfs.mockRejectedValueOnce(pinError);
    await expect(h.service.createTask(TM, task())).rejects.toBe(pinError);
    expect(h.txManager.execute).not.toHaveBeenCalled();
    const transportError = new Error('mock transport');
    h.txManager.execute.mockRejectedValueOnce(transportError);
    await expect(h.service.unclaimTask(TM, BIG_ID)).rejects.toBe(transportError);
    const failedResult = { success: false, error: { userMessage: 'Host parsed error' } };
    h.txManager.execute.mockResolvedValueOnce(failedResult);
    await expect(h.service.completeTask(TM, BIG_ID)).resolves.toBe(failedResult);
  });
});


describe('raw task creation and safe metadata edit regressions', () => {
  it.each(['createTask', 'createAndAssignTask', 'createTasksBatch'])('%s keeps 2^79+1 raw payout, one smallest bounty unit and explicit zero metadata', async method => {
    const h = host(false);
    const payoutRaw = (2n ** 79n + 1n).toString();
    const data = task({ payout: ethers.utils.formatUnits(payoutRaw, 18), bountyToken: USDC, bountyPayout: '0.000001' });
    const prepared = vi.fn();
    if (method === 'createAndAssignTask') await h.service[method](TM, data, OTHER, { onPreparedCreation: prepared });
    else if (method === 'createTasksBatch') await h.service[method](TM, PID, [data], { onPreparedCreation: prepared });
    else await h.service[method](TM, data, { onPreparedCreation: prepared });
    const decoded = iface.decodeFunctionData(method, callData(h));
    const row = method === 'createTasksBatch' ? decoded[1][0] : decoded;
    expect(row[0].toString()).toBe(payoutRaw);
    expect(prepared.mock.calls[0][0].creations[0]).toMatchObject({ payoutRaw, bountyPayoutRaw: '1', metadataHash: hashZero });
    expect(h.txManager.execute).toHaveBeenCalledTimes(1);
  });
  it('keeps a one-wei payout exact and lets core reject out-of-range payouts before storage or send', async () => {
    const h = host();
    await h.service.createTask(TM, task({ payout: '0.000000000000000001' }));
    expect(iface.decodeFunctionData('createTask', callData(h))[0].toString()).toBe('1');
    h.storage.addToIpfs.mockClear(); h.txManager.execute.mockClear();
    await expect(h.service.createTask(TM, task({ payout: ethers.utils.formatUnits(2n ** 80n, 18) }))).rejects.toThrow();
    expect(h.storage.addToIpfs).not.toHaveBeenCalled(); expect(h.txManager.execute).not.toHaveBeenCalled();
  });
  it('requires an explicit final pointer in low-level updates, while preserving explicit clear support', async () => {
    const h = host(false);
    await expect(h.service.updateTask(TM, BIG_ID, task())).rejects.toMatchObject({ userMessage: expect.any(String) });
    expect(h.txManager.execute).not.toHaveBeenCalled();
    await h.service.updateTask(TM, BIG_ID, task({ metadataHash: hashZero }));
    expect(iface.decodeFunctionData('updateTask', callData(h))[3]).toBe(hashZero);
  });
  it.each(['editTask', 'editTaskMetadata'])('%s refuses unavailable storage with a recoverable member error and no zero-pointer write', async method => {
    const h = host(false);
    await expect(h.service[method](TM, BIG_ID, task({ baseMetadata: BASE }))).rejects.toMatchObject({
      userMessage: 'Task details could not be saved. Reload the task and try again.',
    });
    expect(h.txManager.execute).not.toHaveBeenCalled();
  });
  it('does not guess unknown bounty decimals and rejects an invalid batch before uploading any document', async () => {
    const h = host();
    await expect(h.service.createTask(TM, task({ bountyToken: OTHER, bountyPayout: '1' }))).rejects.toMatchObject({ userMessage: expect.any(String) });
    await expect(h.service.createTasksBatch(TM, PID, [task(), task({ payout: '1e3' })])).rejects.toThrow();
    expect(h.storage.addToIpfs).not.toHaveBeenCalled();
    expect(h.txManager.execute).not.toHaveBeenCalled();
  });
});
