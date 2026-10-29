import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { knownFact } from '@poa-box/core/data/facts';
import { utils } from 'ethers';
import { createParityHost } from '@/test/parityHost';
import { readTaskApplications } from '@/lib/tasks/applications';
import { taskActionPolicy } from '@/lib/tasks/actionPolicy';
import { TaskService } from '@/services/web3/domain/TaskService';
const f = vi.hoisted(() => ({ read: null, project: null, actions: null, board: {}, push: vi.fn(), ensure: vi.fn(), toast: vi.fn() }));
vi.mock('@chakra-ui/react', async () => (await import('@/test/parityHost')).parityChakra(f.toast));
vi.mock('@/components/TaskManager/EditTaskModal', () => ({ default: () => null }));
vi.mock('@/components/TaskManager/TaskApplicationModal', () => ({ default: () => null }));
vi.mock('@/components/common', () => ({ UserSearchInput: ({ onSelect }) => <button onClick={() => onSelect({ address: APPLICANT, username: 'applicant' })}>Choose applicant</button> }));
vi.mock('@/components/common/UserIdentity', () => ({ default: () => null }));
vi.mock('@/components/common/UsernameLink', () => ({ default: ({ username }) => <span>{username}</span> }));
vi.mock('@/context/TaskBoardContext', () => ({ useTaskBoard: () => f.board }));
vi.mock('@/context/UserContext', () => ({ useUserContext: () => ({ userData: { username: 'reviewer' }, fetchUserDetails: vi.fn() }) }));
vi.mock('@/context/authState', () => ({ useAuth: () => ({ accountAddress: ACCOUNT }) }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => ({ orgId: ORG, orgChainId: 100, subgraphUrl: source.endpoint, tokenLabel: 'Shares' }) }));
vi.mock('@/context/dataBaseContext', () => ({ useDataBaseContext: () => ({ projects: [] }) }));
vi.mock('@/context/ipfsContext', () => ({ useIPFScontext: () => ({ safeFetchFromIpfs: vi.fn() }) }));
vi.mock('@/context/ProjectContext', () => ({ useProjectContext: () => ({ projectsData: [f.project], releasesSupported: true,
  getTaskActions: f.actions, ensureTaskApplications: f.ensure, getTaskApplicationRead: () => f.read }) }));
vi.mock('next/router', () => ({ useRouter: () => ({ query: { task: task.id, projectId: task.projectId, view: 'list', q: 'saved' }, push: f.push }) }));
vi.mock('@/hooks/useOrgName', () => ({ useOrgName: () => 'Test6' }));
vi.mock('@/hooks/useNow', () => ({ useNow: () => 2000000 }));
vi.mock('@/hooks/useShareLink', () => ({ useShareLink: () => '/task' }));
import TaskCardModal from '@/components/TaskManager/TaskCardModal';
const TM = `0x${'12'.repeat(20)}`, ACCOUNT = `0x${'34'.repeat(20)}`, APPLICANT = `0x${'56'.repeat(20)}`, ORG = `0x${'ab'.repeat(32)}`, PID = `0x${'01'.repeat(32)}`, HASH = `0x${'cd'.repeat(32)}`;
const source = { chainId: 100, orgId: ORG, contract: TM, endpoint: 'https://applications.invalid/graphql', indexed: true, snapshot: 'pinned', method: 'board', block: { number: '123', hash: HASH } };
const task = { id: `${TM}-9007199254740993`, projectId: `${TM}-${PID}`, status: 'Open', name: 'Application task', requiresApplication: true,
  claimedBy: null, absoluteDeadline: null, claimDeadline: null, completionWindow: 0, payout: '1', Payout: '1', description: '', applicants: [] };
let host, execute;
beforeEach(async () => {
  vi.clearAllMocks();
  const indexedTask = { id: task.id, taskId: '9007199254740993', taskManager: TM,
    project: { id: task.projectId, projectId: PID, deleted: false, taskManager: { id: TM, organization: { id: ORG } } } };
  const app = { id: 'application-1', applicant: APPLICANT, applicantUsername: 'applicant', applicationHash: HASH,
    approved: false, approver: null, approverUsername: null, appliedAt: '1000', appliedAtBlock: '100', approvedAt: null,
    metadata: { id: 'metadata-1', notes: 'I can help', experience: 'Shared work', indexedAt: '120' }, task: indexedTask };
  f.read = await readTaskApplications({ source, task: task.id, client: { query: vi.fn(async ({ context }) => {
    const data = { organization: { id: ORG, taskManager: { id: TM, organization: { id: ORG } } }, _meta: { block: { number: 123, hash: HASH } },
      tasks: [indexedTask], taskApplications: [app] };
    context.onCoreResponse({ data }); return { data };
  }) } });
  f.project = { id: task.projectId, taskSource: source, taskCoverage: { status: 'complete', receivedKeys: [task.id], missingIds: [], failedIds: [], issues: [] }, managerFact: knownFact(false) };
  const scope = { ...source, account: ACCOUNT, hydrated: true };
  const authority = { scope, projectId: PID, executor: knownFact(false), creator: knownFact(false), permissionMask: knownFact('8') };
  f.actions = value => taskActionPolicy({ scope, project: f.project, task: { ...value, applicationsEvidence: f.read?.snapshot }, authority, now: 2000000, releasesSupported: true });
  execute = vi.fn(async () => ({ success: true }));
  const service = new TaskService({ createWritable: (address, abi) => ({ address, abi }) }, { execute });
  f.board = { approveApplication: (id, address) => service.approveApplication(TM, id, address), assignTask: (id, address) => service.assignTask(TM, id, address),
    getTaskMetadata: async () => ({ name: task.name, description: '', difficulty: '', estHours: '', submission: '' }) };
  f.push.mockResolvedValue(true); f.ensure.mockResolvedValue(undefined);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); })); host = createParityHost();
});
afterEach(async () => { await host.unmount(); expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
describe('mounted application review and assignment parity', () => {
  it('renders the actual indexed application and approves it with the exact raw ID and core ABI', async () => {
    await host.render(<TaskCardModal task={task} columnId="open" />);
    expect(host.container.textContent).toContain('I can help'); expect(host.container.textContent).toContain('Shared work');
    expect(host.button('Approve').disabled).toBe(false);
    await host.click(host.button('Approve'));
    const [contract, method, args] = execute.mock.calls[0];
    expect(method).toBe('approveApplication'); expect(args.map(String)).toEqual(['9007199254740993', APPLICANT]);
    const decoded = new utils.Interface(contract.abi).decodeFunctionData(method, new utils.Interface(contract.abi).encodeFunctionData(method, args));
    expect(decoded[0].toString()).toBe('9007199254740993');
    expect(f.push.mock.calls[0][0].query).toMatchObject({ org: 'Test6', view: 'list', q: 'saved' });
    expect(f.push.mock.calls[0][0].query).not.toHaveProperty('task');
    expect(host.button('Reject application')).toBeUndefined();
  });
  it('keeps direct assignment reachable with real core assignment permission', async () => {
    await host.render(<TaskCardModal task={task} columnId="open" />);
    await host.click(host.button('Assign')); await host.click(host.button('Choose applicant')); await host.click(host.button('Assign Task'));
    expect(execute.mock.calls[0][1]).toBe('assignTask'); expect(execute.mock.calls[0][2].map(String)).toEqual(['9007199254740993', APPLICANT]);
  });
  it('refuses approval from an incomplete application read and retries the actual detail demand', async () => {
    f.read = { applicants: f.read.applicants, error: 'Applications unavailable' };
    await host.render(<TaskCardModal task={task} columnId="open" />);
    expect(host.button('Approve').disabled).toBe(true);
    await act(() => host.props(host.button('Approve')).onClick()); expect(execute).not.toHaveBeenCalled();
    await host.click(host.button('Try again')); expect(f.ensure).toHaveBeenCalledWith(task, true);
  });
});
