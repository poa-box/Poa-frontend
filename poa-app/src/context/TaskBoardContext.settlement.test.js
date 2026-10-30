import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { knownFact } from '@poa-box/core/data/facts';
import { TaskService } from '@/services/web3/domain/TaskService';
import { taskActionPolicy } from '@/lib/tasks/actionPolicy';
import { bytes32ToIpfsCid } from '@/services/web3/utils/encoding';
import TaskManagerABI from '../../abi/TaskManagerNew.json';

// Run the mounted provider and modal selector through render/effect cycles. Transport,
// storage and external contexts are mocked; action guards and core encoders are real.
const host = vi.hoisted(() => ({ slots: [], cursor: 0, effects: new Map(), dirty: false }));
vi.mock('react', async original => {
  const actual = await original();
  const changed = (previous, deps) => !previous || !deps || deps.some((value, i) => value !== previous.deps[i]);
  const memo = (fn, deps) => {
    const index = host.cursor++, previous = host.slots[index];
    if (changed(previous, deps)) host.slots[index] = { deps, value: fn() };
    return host.slots[index].value;
  };
  return { ...actual, useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
    useContext: () => host.board,
    useRef: value => host.slots[host.cursor++] ||= { current: value },
    useState: initial => {
      const index = host.cursor++;
      host.slots[index] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [host.slots[index].value, update => {
        const next = typeof update === 'function' ? update(host.slots[index].value) : update;
        if (!Object.is(next, host.slots[index].value)) { host.slots[index].value = next; host.dirty = true; }
      }];
    },
    useEffect: (fn, deps) => {
      const index = host.cursor++, previous = host.slots[index];
      if (changed(previous, deps)) host.effects.set(index, () => {
        previous?.cleanup?.(); host.slots[index] = { deps, cleanup: fn() };
      });
    },
  };
});
vi.mock('@/context/dataBaseContext', () => ({ useDataBaseContext: () => ({ selectedProject: host.selected }) }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => host.po }));
vi.mock('@/context/authState', () => ({ useAuth: () => host.auth }));
vi.mock('@/context/ProjectContext', () => ({ useProjectContext: () => ({ projectsData: host.projects,
  getTaskActions: host.decisions, refetchProjects: host.refresh }) }));
vi.mock('@/context/ipfsContext', () => ({ useIPFScontext: () => ({ fetchFromIpfs: host.fetch,
  safeFetchFromIpfs: host.fetch, addToIpfs: host.pin }) }));
vi.mock('@/context/RefreshContext', () => ({ useRefreshEmit: () => ({ emit: host.emit }),
  RefreshEvent: { TASK_UPDATED: 'updated', TASK_CLAIMED: 'claimed', TASK_UNCLAIMED: 'released', TASK_CREATED: 'created' } }));
vi.mock('@/context/NotificationContext', () => ({ useNotification: () => ({ addNotification: host.notify, updateNotification: host.update }) }));
vi.mock('@/hooks/useWeb3Services', () => ({ useWeb3Services: () => ({ task: host.service,
  isReady: true, getNotReadyMessage: () => 'Loading account' }) }));
vi.mock('@/util/apolloClient', () => ({ useSubgraphClient: () => null }));
vi.mock('@chakra-ui/react', () => ({ useToast: () => () => {} }));
vi.mock('next/router', () => ({ useRouter: () => ({ query: host.query }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
import { TaskBoardProvider } from '@/context/TaskBoardContext';
import TaskModalMount from '@/components/TaskManager/views/TaskModalMount';

const TM = `0x${'12'.repeat(20)}`, ACCOUNT = `0x${'34'.repeat(20)}`, ORG = `0x${'ab'.repeat(32)}`;
const PID = `0x${'01'.repeat(32)}`, PROJECT = `${TM}-${PID}`, ID = `${TM}-9007199254740993`;
const HASH = `0x${'ab'.repeat(32)}`, EDITED = `0x${'cd'.repeat(32)}`;
const base = { name: 'Saved task', description: 'Care', difficulty: 'hard', estHours: 2,
  location: 'Remote', submission: '', extensions: { links: ['https://example.test'] } };
const columns = tasks => ['open', 'inProgress', 'inReview', 'completed'].map(id => ({ id,
  tasks: tasks.filter(task => ({ Open: 'open', Assigned: 'inProgress', Submitted: 'inReview', Completed: 'completed' })[task.status] === id) }));
const deferred = () => { let resolve; return { promise: new Promise(done => { resolve = done; }), resolve: value => resolve(value) }; };
const success = blockNumber => ({ success: true, receipt: { status: 1, blockNumber, logs: [] } });
let saved;
function index(tasks, block = '100', overrides = {}) {
  host.projects = [{ id: PROJECT, columns: columns(tasks), managerFact: knownFact(false),
    taskSource: { chainId: 100, orgId: ORG, contract: TM, endpoint: host.po.subgraphUrl,
      indexed: true, snapshot: 'pinned', block: { number: block }, method: 'board' },
    taskCoverage: { status: 'complete', receivedKeys: tasks.map(task => task.id), missingIds: [], failedIds: [], issues: [] }, ...overrides }];
  host.initial = host.projects[0].columns;
}
function render(effects = true) {
  let turns = 0;
  do {
    host.dirty = false; host.cursor = 0;
    host.board = TaskBoardProvider({ initialColumns: host.initial, onUpdateColumns: host.onUpdate }).props.value;
    host.modal = TaskModalMount();
    if (!effects) break;
    const pending = [...host.effects.values()]; host.effects.clear();
    for (const effect of pending) effect();
    if (++turns > 15) throw new Error('Render did not settle');
  } while (host.dirty);
  return host.board;
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(2100000000000);
  host.slots = []; host.effects = new Map(); host.dirty = false;
  host.po = { taskManagerContractAddress: TM, orgId: ORG, orgChainId: 100,
    subgraphUrl: 'https://board.invalid', taskPayoutHoursOnly: true, taskPayoutHourlyRate: 1 };
  host.auth = { accountAddress: ACCOUNT, isAuthHydrated: true, isAuthenticated: true, isPasskeyUser: false };
  host.selected = { id: PROJECT }; host.query = { projectId: PROJECT, task: ID };
  saved = { ...base, id: ID, taskId: '9007199254740993', projectId: PROJECT, metadataHash: HASH,
    status: 'Open', claimedBy: '', requiresApplication: false, applicants: [],
    payoutRaw: '2000000000000000000', bountyPayoutRaw: '0', absoluteDeadline: 2100000010, completionWindow: 1800, claimDeadline: null };
  index([saved]);
  host.decisions = (task, project, now) => {
    const scope = { chainId: host.po.orgChainId, orgId: host.po.orgId, contract: TM,
      endpoint: host.po.subgraphUrl, account: host.auth.accountAddress, hydrated: host.auth.isAuthHydrated };
    return taskActionPolicy({ task, project, scope, now, releasesSupported: true,
      authority: { scope, projectId: PID, executor: knownFact(false), creator: knownFact(false), permissionMask: knownFact('255') } });
  };
  host.fetch = vi.fn(async () => base); host.pin = vi.fn(async () => ({ path: bytes32ToIpfsCid(EDITED) }));
  host.notify = vi.fn(() => 'notification'); host.update = vi.fn(); host.emit = vi.fn(); host.onUpdate = vi.fn();
  host.refresh = vi.fn(async () => null);
  host.nextResult = success(101n);
  host.execute = vi.fn(async (_contract, _method, _args, options) => { options.assertCurrent?.(); return host.nextResult; });
  host.service = new TaskService({ createWritable: (address, abi) => ({ address, abi }) }, { execute: host.execute }, { addToIpfs: host.pin });
  vi.stubGlobal('fetch', () => { throw new Error('Unexpected network'); });
});
afterEach(() => {
  host.slots.forEach(slot => slot?.cleanup?.()); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('mounted task board settlement with real core-backed services', () => {
  it('edits, claims and releases on the same mounted board as delayed indexed pointers and rows arrive', async () => {
    render();
    await host.modal.props.onEditTask({ ...saved, name: 'Edited task' });
    render();
    expect(host.execute.mock.calls[0][1]).toBe('updateTask');
    index([saved]); render();
    expect(host.modal.props.task).toMatchObject({ name: 'Edited task', metadataHash: HASH });
    const edited = { ...saved, name: 'Edited task', metadataHash: EDITED };
    index([edited], '101'); render();
    expect(host.modal.props.task).toBe(edited);
    const pending = deferred(); host.nextResult = pending.promise;
    const claim = host.board.moveTask(host.modal.props.task, 'open', 'inProgress', 0, null, ACCOUNT);
    render();
    index([edited], '101'); render();
    expect(host.modal.props.columnId).toBe('inProgress'); // old index cannot undo the pending claim
    pending.resolve(success(102n)); await claim; render();
    expect(host.execute.mock.calls[1][1]).toBe('claimTask');
    const claimed = { ...edited, status: 'Assigned', claimedBy: ACCOUNT, claimDeadline: 2100001000 };
    index([claimed], '102'); render();
    expect(host.modal.props.task).toBe(claimed);
    host.nextResult = success(103n);
    await expect(host.board.releaseTask(host.modal.props.task)).resolves.toEqual({ success: true });
    render();
    index([claimed], '102'); render();
    expect(host.modal.props.columnId).toBe('open'); // keep release while the index is still assigned
    const released = { ...edited, claimedBy: '', claimDeadline: null };
    index([released], '103'); render();
    expect(host.modal.props.task).toBe(released);
    expect(host.execute.mock.calls.map(call => call[1])).toEqual(['updateTask', 'claimTask', 'unclaimTask']);
    expect(host.execute.mock.calls.every(call => call[2][0] === '9007199254740993')).toBe(true);
    expect(host.update.mock.calls.every(call => call[2] !== 'error')).toBe(true);
  });

  it('keeps the full 65-second grace when snapshots have not reached the write block', async () => {
    render(); await host.board.editTaskMetadata({ ...saved, name: 'Keep optimism' }, 'open', 0); render();
    index([saved], '100'); render();
    await vi.advanceTimersByTimeAsync(64999); render();
    expect(host.modal.props.task.name).toBe('Keep optimism');
    await vi.advanceTimersByTimeAsync(1); render();
    expect(host.modal.props.task).toBe(saved);
  });

  it.each(['chain', 'org', 'account'])('drops late write settlement after a %s switch', async field => {
    render(); const pending = deferred(); host.nextResult = pending.promise;
    const edit = host.board.editTaskMetadata({ ...saved, name: 'Old scope edit' }, 'open', 0);
    await vi.waitFor(() => expect(host.execute).toHaveBeenCalledTimes(1));
    if (field === 'chain') host.po = { ...host.po, orgChainId: 42161 };
    if (field === 'org') host.po = { ...host.po, orgId: `0x${'ef'.repeat(32)}` };
    if (field === 'account') host.auth = { ...host.auth, accountAddress: TM };
    index([{ ...saved, name: 'Current scope' }]); render();
    pending.resolve(success(101n)); await edit; render();
    expect(host.modal.props.task.name).toBe('Current scope');
    expect(host.onUpdate).not.toHaveBeenCalled(); expect(host.emit).not.toHaveBeenCalled();
  });

  it('still rejects an old modal pointer when external details change, then uses the reconciled row', async () => {
    render(); const old = host.modal.props.task;
    const external = { ...saved, metadataHash: EDITED, name: 'Externally edited' };
    index([external], '105'); render(false); // current ProjectContext, before the display effect commits
    await host.board.moveTask(old, 'open', 'inProgress', 0, null, ACCOUNT);
    expect(host.execute).not.toHaveBeenCalled();
    expect(host.notify.mock.calls.at(-1)[0]).toContain('saved task details changed');
    render(); expect(host.modal.props.task).toBe(external);
    await host.board.moveTask(host.modal.props.task, 'open', 'inProgress', 0, null, ACCOUNT);
    expect(host.execute).toHaveBeenCalledTimes(1);
  });

  it.each(['incomplete', 'endpoint', 'old-block'])('does not settle a confirmed edit from %s evidence', async failure => {
    render(); await host.board.editTaskMetadata({ ...saved, name: 'Keep optimism' }, 'open', 0); render();
    const row = { ...saved, name: 'Wrong snapshot', metadataHash: EDITED };
    index([row], failure === 'old-block' ? '100' : '101');
    if (failure === 'incomplete') host.projects[0].taskCoverage = { ...host.projects[0].taskCoverage, status: 'incomplete' };
    if (failure === 'endpoint') host.projects[0].taskSource = { ...host.projects[0].taskSource, endpoint: 'https://other.invalid' };
    render(); expect(host.modal.props.task).toMatchObject({ name: 'Keep optimism', metadataHash: HASH });
  });

  it('resolves bundled creation from a later complete project without guessing a draft-to-ID match or reloading', async () => {
    host.auth.isPasskeyUser = true; host.nextResult = success(150n); render();
    await host.board.addTask({ name: 'New task', difficulty: 'easy', estHours: 1 }, 'open'); render();
    const draft = host.board.taskColumns[0].tasks.find(task => task.id.startsWith('pending-task-'));
    expect(draft).toMatchObject({ isIndexing: true, taskId: undefined });
    await host.board.assignTask(draft, ACCOUNT); expect(host.execute).toHaveBeenCalledTimes(1);
    const created = { ...saved, id: `${TM}-9007199254740994`, taskId: '9007199254740994', name: 'New task' };
    index([saved, created], '149'); render();
    expect(host.board.taskColumns[0].tasks.some(task => task.id === draft.id)).toBe(true);
    index([saved, created], '150'); render();
    expect(host.board.taskColumns[0].tasks.map(task => task.id)).toEqual([saved.id, created.id]);
    host.query = { projectId: PROJECT, task: created.id }; render();
    expect(host.modal.props.task).toBe(created);
    host.nextResult = success(151n);
    await host.board.moveTask(host.modal.props.task, 'open', 'inProgress', 0, null, ACCOUNT);
    expect(host.execute.mock.calls.at(-1)[1]).toBe('claimTask');
    expect(host.execute.mock.calls.at(-1)[2][0]).toBe('9007199254740994');
  });

  it('keeps an unrelated pending edit while a bundled creation resumes from complete indexed rows', async () => {
    host.auth.isPasskeyUser = true;
    const pending = deferred();
    host.execute.mockImplementationOnce(async (_contract, _method, _args, options) => {
      options.assertCurrent(); return pending.promise;
    });
    render();
    const edit = host.board.editTaskMetadata({ ...saved, name: 'Pending edit' }, 'open', 0);
    await vi.waitFor(() => expect(host.execute).toHaveBeenCalledTimes(1)); render();
    host.nextResult = success(150n);
    const createdId = `${TM}-9007199254740994`;
    host.refresh.mockResolvedValue({ source: { ...host.projects[0].taskSource, block: { number: '150' } },
      coverage: host.projects[0].taskCoverage,
      data: { organization: { id: ORG, taskManager: { id: TM, projects: [{ id: PROJECT, tasks: [
        { ...saved, title: saved.name, payout: saved.payoutRaw, bountyPayout: '0' },
        { ...saved, id: createdId, taskId: '9007199254740994', title: 'New task', payout: '1', bountyPayout: '0' },
      ] }] } } },
    });
    await host.board.addTask({ name: 'New task', difficulty: 'easy', estHours: 1 }, 'open'); render();
    expect(host.board.taskColumns[0].tasks.map(task => [task.id, task.name])).toEqual([[ID, 'Pending edit'], [createdId, 'New task']]);
    pending.resolve(success(151n)); await edit; render();
    expect(host.modal.props.task.name).toBe('Pending edit');
  });

  it('does not regress an already settled pointer when an older snapshot arrives during the grace period', async () => {
    render(); await host.board.editTaskMetadata({ ...saved, name: 'Edited task' }, 'open', 0); render();
    const edited = { ...saved, name: 'Edited task', metadataHash: EDITED };
    index([edited], '101'); render(); expect(host.modal.props.task).toBe(edited);
    index([saved], '100'); render(); expect(host.modal.props.task).toBe(edited);
  });

  it('drops an indexed creation continuation after the account changes during its refresh', async () => {
    host.auth.isPasskeyUser = true; host.nextResult = success(150n);
    const pending = deferred(); host.refresh.mockReturnValue(pending.promise); render();
    const create = host.board.addTask({ name: 'New task', difficulty: 'easy', estHours: 1 }, 'open');
    await vi.waitFor(() => expect(host.refresh).toHaveBeenCalledTimes(1));
    host.auth = { ...host.auth, accountAddress: TM }; render();
    pending.resolve({ source: { ...host.projects[0].taskSource, block: { number: '150' } },
      coverage: host.projects[0].taskCoverage,
      data: { organization: { id: ORG, taskManager: { id: TM, projects: [{ id: PROJECT, tasks: [] }] } } } });
    await create; render();
    expect(host.board.taskColumns[0].tasks).toEqual([saved]);
    expect(host.emit).not.toHaveBeenCalled(); expect(host.onUpdate).not.toHaveBeenCalled();
  });

  it('fills a receipt-proven creation pointer before the lock expires and makes its modal actionable', async () => {
    const iface = new ethers.utils.Interface(TaskManagerABI);
    const event = iface.encodeEventLog(iface.getEvent('TaskCreated'), ['9007199254740994', PID,
      '1000000000000000000', ethers.constants.AddressZero, '0', false, ethers.utils.toUtf8Bytes('New task'), EDITED]);
    host.nextResult = { success: true, receipt: { status: 1, blockNumber: 101n, logs: [{ address: TM, ...event }] } };
    render(); await host.board.addTask({ name: 'New task', difficulty: 'easy', estHours: 1 }, 'open'); render();
    const created = { ...saved, id: `${TM}-9007199254740994`, taskId: '9007199254740994', metadataHash: EDITED, name: 'New task' };
    expect(host.board.taskColumns[0].tasks.map(task => task.id)).toContain(created.id);
    host.query = { projectId: PROJECT, task: created.id }; render();
    expect(host.modal.props.task.metadataHash).toBeUndefined();
    index([saved, created], '101'); render();
    expect(host.modal.props.task).toBe(created);
    expect(host.modal.props.task.isIndexing).toBeFalsy();
    host.nextResult = success(102n);
    await host.board.moveTask(host.modal.props.task, 'open', 'inProgress', 0, null, ACCOUNT);
    expect(host.execute.mock.calls.at(-1)[1]).toBe('claimTask');
  });
});
