import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ethers } from 'ethers';
import { knownFact } from '@poa-box/core/data/facts';
import { TaskService } from '@/services/web3/domain/TaskService';
import { TaskBoardProvider, useTaskBoard } from '@/context/TaskBoardContext';
import { taskActionPolicy } from '@/lib/tasks/actionPolicy';
import TaskManagerABI from '../../../abi/TaskManagerNew.json';

const state = vi.hoisted(() => ({ po: null, auth: null, project: null, projects: null, service: null,
  board: null, getTaskActions: null, refresh: null, fetch: null, pin: null, addNotification: null, updateNotification: null, emit: null }));
vi.mock('@/context/dataBaseContext', () => ({ useDataBaseContext: () => ({ selectedProject: state.project }) }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => state.po }));
vi.mock('@/context/authState', () => ({ useAuth: () => state.auth }));
vi.mock('@/context/ProjectContext', () => ({ useProjectContext: () => ({ projectsData: state.projects, getTaskActions: state.getTaskActions, refetchProjects: state.refresh }) }));
vi.mock('@/context/ipfsContext', () => ({ useIPFScontext: () => ({ fetchFromIpfs: state.fetch, safeFetchFromIpfs: state.fetch, addToIpfs: state.pin }) }));
vi.mock('@/context/RefreshContext', () => ({ useRefreshEmit: () => ({ emit: state.emit }),
  RefreshEvent: { TASK_CREATED: 'task:created', TASK_UPDATED: 'task:updated', TASK_SUBMITTED: 'task:submitted', TASK_REJECTED: 'task:rejected' } }));
vi.mock('@/context/NotificationContext', () => ({ useNotification: () => ({ addNotification: state.addNotification, updateNotification: state.updateNotification }) }));
vi.mock('@/hooks/useWeb3Services', () => ({ useWeb3Services: () => ({ task: state.service,
  isReady: true, getNotReadyMessage: () => 'Loading account' }) }));
vi.mock('@/util/apolloClient', () => ({ useSubgraphClient: () => null }));

const TM = `0x${'12'.repeat(20)}`;
const PID = `0x${'01'.repeat(32)}`;
const ORG = `0x${'ab'.repeat(32)}`;
const ACCOUNT = `0x${'34'.repeat(20)}`;
const HASH = `0x${'ab'.repeat(32)}`;
const CID = 'QmZtnFaddFtzGNT8BxdHVbQrhSFdq1pWxud5z4fA4kxfDt';
const base = { name: 'Saved task', description: 'Care', difficulty: 'hard', estHours: 2, location: 'Remote',
  submission: 'Previous work', dueDate: 2100000000, extensions: { priority: false, links: ['https://example.test'] } };
let execute;
let savedTask;
function mount(onUpdateColumns) {
  function Capture() { state.board = useTaskBoard(); return null; }
  renderToStaticMarkup(React.createElement(TaskBoardProvider, { initialColumns: state.project.columns, onUpdateColumns }, React.createElement(Capture)));
}
beforeEach(() => {
  vi.useFakeTimers();
  state.po = { taskManagerContractAddress: TM, orgId: ORG, orgChainId: 100, subgraphUrl: 'https://example.test/gnosis',
    taskPayoutHoursOnly: true, taskPayoutHourlyRate: 1 };
  state.auth = { accountAddress: ACCOUNT, isAuthHydrated: true, isAuthenticated: true, isPasskeyUser: false };
  const scope = { contract: TM, orgId: ORG, chainId: 100, endpoint: state.po.subgraphUrl, account: ACCOUNT, hydrated: true };
  savedTask = { id: `${TM}-9007199254740993`, taskId: '9007199254740993', projectId: `${TM}-${PID}`,
    metadataHash: HASH, name: 'Saved task', status: 'Open', claimedBy: '', requiresApplication: false, applicants: [],
    absoluteDeadline: 2100000010, completionWindow: 1800, claimDeadline: null, difficulty: 'hard', estHours: 2 };
  state.project = { id: savedTask.projectId,
    taskSource: { ...scope, indexed: true, snapshot: 'latest', method: 'host-test' },
    taskCoverage: { status: 'complete', receivedKeys: [savedTask.id], missingIds: [], failedIds: [], issues: [] },
    managerFact: knownFact(false), columns: ['open', 'inProgress', 'inReview', 'completed'].map(id => ({ id, tasks: id === 'open' ? [savedTask] : [] })) };
  state.projects = [state.project];
  state.getTaskActions = (task, project, now) => taskActionPolicy({ task, project, now, scope,
    authority: { scope, projectId: PID, executor: knownFact(false), creator: knownFact(false), permissionMask: knownFact('255') }, releasesSupported: true });
  state.refresh = vi.fn().mockResolvedValue(null);
  state.fetch = vi.fn().mockResolvedValue(base);
  state.pin = vi.fn().mockResolvedValue({ path: CID });
  state.addNotification = vi.fn().mockReturnValue('notification');
  state.updateNotification = vi.fn();
  state.emit = vi.fn();
  execute = vi.fn().mockResolvedValue({ success: true, receipt: { status: 1, logs: [] } });
  state.service = new TaskService({ createWritable: (address, abi) => ({ address, abi }) }, { execute }, { addToIpfs: state.pin });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('real TaskBoard action callbacks through core services with mocked transport', () => {
  it('supplies the verified complete metadata base and unchanged full deadlines for an edit', async () => {
    mount();
    await state.board.editTask({ ...savedTask, name: 'Updated task' }, 'open', 0);
    const published = JSON.parse(state.pin.mock.calls[0][0]);
    expect(published).toMatchObject({ ...base, name: 'Updated task' });
    expect(execute).toHaveBeenCalledTimes(1);
    const [, method, args] = execute.mock.calls[0];
    expect(method).toBe('updateTask');
    expect(args.slice(-2)).toEqual([2100000010, 1800]);
    expect(state.emit).toHaveBeenCalledWith('task:updated', { taskId: savedTask.id });
  });
  it('preserves submission/extensions on metadata-only editing and uses the metadata selector', async () => {
    mount();
    await state.board.editTaskMetadata({ ...savedTask, name: 'New description', dueDate: null }, 'open', 0);
    expect(JSON.parse(state.pin.mock.calls[0][0])).toMatchObject({ submission: base.submission, extensions: base.extensions });
    expect(JSON.parse(state.pin.mock.calls[0][0])).not.toHaveProperty('dueDate');
    expect(execute.mock.calls[0][1]).toBe('updateTaskMetadata');
  });
  it('uses canonical submission and rejection documents in actual host callbacks', async () => {
    savedTask.status = 'Assigned'; savedTask.claimedBy = ACCOUNT;
    mount();
    await state.board.moveTask(savedTask, 'inProgress', 'inReview', 0, 'Work delivered', ACCOUNT);
    expect(JSON.parse(state.pin.mock.calls[0][0])).toEqual({ ...base, submission: 'Work delivered', location: 'In Review' });
    expect(execute.mock.calls[0][1]).toBe('submitTask');
    expect(state.emit).toHaveBeenCalledWith('task:submitted', { taskId: savedTask.id });
    savedTask.status = 'Submitted';
    mount();
    await state.board.rejectTask(savedTask, '  Please add the missing detail.  ');
    expect(state.pin.mock.calls.at(-1)[0]).toBe('{"rejection":"Please add the missing detail."}');
    expect(execute.mock.calls.at(-1)[1]).toBe('rejectTask');
  });
  it.each([null, { name: 'Partial indexed fields' }])('does not upload/send or emit success when the full base is unavailable: %s', async metadata => {
    state.fetch.mockResolvedValue(metadata);
    mount();
    await state.board.editTask({ ...savedTask, name: 'Unsafe edit' }, 'open', 0);
    expect(state.pin).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(state.emit).not.toHaveBeenCalled();
    expect(state.updateNotification.mock.calls.at(-1)[1]).toContain('saved task details');
  });
  it('rejects a changed pointer after fetching and a terminal task after pinning before sending', async () => {
    state.fetch.mockImplementationOnce(async () => {
      state.project.columns[0].tasks[0] = { ...savedTask, metadataHash: `0x${'cd'.repeat(32)}` };
      return base;
    });
    mount();
    await state.board.editTaskMetadata({ ...savedTask, name: 'Unsafe edit' }, 'open', 0);
    expect(state.pin).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    state.project.columns[0].tasks[0] = savedTask;
    state.pin.mockImplementationOnce(async () => {
      state.getTaskActions = () => ({ editMetadata: { state: 'denied' } });
      // Replace the current row with a terminal task, which core rejects during the guard.
      state.project.columns[0].tasks[0] = { ...savedTask, status: 'Completed' };
      return { path: CID };
    });
    mount();
    await state.board.editTaskMetadata({ ...savedTask, name: 'Unsafe edit' }, 'open', 0);
    expect(execute).not.toHaveBeenCalled();
    expect(state.emit).not.toHaveBeenCalled();
  });
  it('blocks account hydration and partial permission evidence before storage or a transaction', async () => {
    state.auth.isAuthHydrated = false;
    mount();
    await state.board.addTask({ name: 'New work', difficulty: 'easy', estHours: 1 }, 'open');
    expect(state.pin).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(state.addNotification.mock.calls.at(-1)[1]).toBe('error');
  });
  it('provides exact named prepared creation evidence while preserving the raw service return object', async () => {
    const callback = vi.fn();
    const result = { success: true, receipt: { status: 1, logs: [] }, extraHostField: true };
    execute.mockResolvedValue(result);
    const data = { name: 'Exact task', projectId: state.project.id, payout: '1.000000000000000001' };
    await expect(state.service.createTask(TM, data, { onPreparedCreation: callback })).resolves.toBe(result);
    expect(callback).toHaveBeenCalledWith({ taskManagerAddress: TM, creations: [{ projectId: PID,
      payoutRaw: '1000000000000000001', title: 'Exact task', metadataHash: HASH,
      bountyToken: ethers.constants.AddressZero, bountyPayoutRaw: '0', requiresApplication: false }] });
  });
  it('reconciles the actual creation callback and RefreshEvent to an emitted ID above the safe integer limit', async () => {
    const iface = new ethers.utils.Interface(TaskManagerABI);
    const encoded = iface.encodeEventLog(iface.getEvent('TaskCreated'), ['9007199254740994', PID,
      '1000000000000000000', ethers.constants.AddressZero, '0', false, ethers.utils.toUtf8Bytes('Exact UI task'), HASH]);
    execute.mockResolvedValue({ success: true, receipt: { status: 1, logs: [{ address: TM, ...encoded }] } });
    const update = vi.fn();
    mount(update);
    await state.board.addTask({ name: 'Exact UI task', difficulty: 'easy', estHours: 1 }, 'open');
    const columns = update.mock.calls[0][0];
    expect(columns[0].tasks.at(-1)).toMatchObject({ id: `${TM}-9007199254740994`, taskId: '9007199254740994', isIndexing: false });
    expect(state.emit.mock.calls[0]).toEqual(['task:created', { task: expect.objectContaining({ taskId: '9007199254740994' }) }]);
  });
  it('leaves missing creation logs honestly pending in the actual callback, without a predicted ID', async () => {
    const update = vi.fn();
    mount(update);
    await state.board.addTask({ name: 'Await indexing', difficulty: 'easy', estHours: 1 }, 'open');
    const created = update.mock.calls[0][0][0].tasks.at(-1);
    expect(created.id).toMatch(/^pending-task-/);
    expect(created.taskId).toBeUndefined();
    expect(created.isIndexing).toBe(true);
  });
  it.each([false, true])('continues a successful bundled creation from scoped indexed rows (batch=%s)', async batch => {
    state.auth.isPasskeyUser = true;
    const iface = new ethers.utils.Interface(TaskManagerABI);
    const event = id => ({ address: TM, ...iface.encodeEventLog(iface.getEvent('TaskCreated'), [id, PID,
      '1000000000000000000', ethers.constants.AddressZero, '0', false, ethers.utils.toUtf8Bytes('Identical UI task'), HASH]) });
    const outer = { success: true, receipt: { status: 'success', blockNumber: 150n,
      logs: [event('9007199254740994'), event('9007199254740995'), event('9007199254740996')] } };
    execute.mockResolvedValue(outer);
    const actualIds = batch ? ['9007199254740995', '9007199254740994'] : ['9007199254740994'];
    const source = { chainId: 100, orgId: ORG, contract: TM, endpoint: state.po.subgraphUrl,
      indexed: true, snapshot: 'pinned', method: 'board', block: { number: '151' } };
    state.refresh.mockResolvedValue({ source,
      coverage: { status: 'complete', receivedKeys: actualIds, missingIds: [], failedIds: [], issues: [] },
      data: { organization: { id: ORG, taskManager: { id: TM, projects: [{ id: state.project.id,
        tasks: actualIds.map(taskId => ({ id: `${TM}-${taskId}`, taskId, title: 'Identical UI task', status: 'Open',
          payout: '1000000000000000000', bountyPayout: '0', metadataHash: HASH })) }] } } },
    });
    const update = vi.fn();
    mount(update);
    const draft = { name: 'Identical UI task', difficulty: 'easy', estHours: 1 };
    if (batch) await expect(state.board.addTaskBatch([draft, draft], state.project.id, 'open')).resolves.toMatchObject({ success: true });
    else await state.board.addTask(draft, 'open');
    expect(state.refresh).toHaveBeenCalledWith({ minimumBlock: '150' });
    expect(update.mock.calls[0][0][0].tasks.map(task => task.id)).toEqual(actualIds.map(id => `${TM}-${id}`));
    expect(update.mock.calls[0][0][0].tasks.every(task => !task.isIndexing && task.taskId)).toBe(true);
    expect(state.emit).toHaveBeenCalledWith('task:created', { source });
    expect(outer.receipt.logs).toHaveLength(3);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('keeps unindexed bundled IDs unknown and disabled when no complete continuation is available', async () => {
    state.auth.isPasskeyUser = true;
    execute.mockResolvedValue({ success: true, receipt: { status: 'success', blockNumber: 150n, logs: [] } });
    const update = vi.fn();
    mount(update);
    await state.board.addTask({ name: 'Await indexing', difficulty: 'easy', estHours: 1 }, 'open');
    const pending = update.mock.calls[0][0][0].tasks.at(-1);
    expect(pending.id).toMatch(/^pending-task-/);
    expect(pending.taskId).toBeUndefined();
    await state.board.assignTask(pending, ACCOUNT);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('keeps builder validation and parsed manager failures member-friendly without CLI flags', async () => {
    mount();
    await state.board.addTask({ name: 'Invalid bounty', difficulty: 'easy', estHours: 1,
      bountyToken: `0x${'56'.repeat(20)}`, bountyAmount: '1e3' }, 'open');
    expect(state.updateNotification.mock.calls.at(-1)[1]).toBe('The reward currency details are unavailable. Reload the task and try again.');
    expect(execute).not.toHaveBeenCalled();
    execute.mockResolvedValue({ success: false, error: { userMessage: 'This project needs a larger reward budget.' } });
    await state.board.addTask({ name: 'Valid draft', difficulty: 'easy', estHours: 1 }, 'open');
    expect(state.updateNotification.mock.calls.at(-1)[1]).toBe('This project needs a larger reward budget.');
  });
});
