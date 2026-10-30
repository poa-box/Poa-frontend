import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { knownFact, unknownFact } from '@poa-box/core/data/facts';
import { projectManagerFact } from '@poa-box/core/reads/project';
import { taskActionPolicy, projectHasReviewCapability } from '@/lib/tasks/actionPolicy';
const fixture = vi.hoisted(() => ({ slots: [], cursor: 0, effects: [], auth: {}, po: {}, board: {}, authority: null, subjectRead: null, client: null }));
vi.mock('react', async original => {
  const actual = await original();
  const memo = (fn, deps) => {
    const index = fixture.cursor++, previous = fixture.slots[index];
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) fixture.slots[index] = { deps, value: fn() };
    return fixture.slots[index].value;
  };
  return { ...actual,
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
    useRef: initial => { const index = fixture.cursor++; return fixture.slots[index] ||= { current: initial }; },
    useState: initial => { const index = fixture.cursor++; fixture.slots[index] ||= { value: initial };
      return [fixture.slots[index].value, next => { fixture.slots[index].value = typeof next === 'function' ? next(fixture.slots[index].value) : next; }]; },
    useEffect: (fn, deps) => { const index = fixture.cursor++, previous = fixture.slots[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) fixture.effects.push(() => {
        previous?.cleanup?.(); fixture.slots[index] = { deps, cleanup: fn() };
      }); },
  };
});
vi.mock('@/hooks/accessV2/useAuthoritySubjects', () => ({ useAuthoritySubjects: options => fixture.subjectRead(options) }));
vi.mock('@/hooks/useBoardProjectReads', () => ({ useBoardProjectReads: () => fixture.board }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => fixture.po }));
vi.mock('@/context/authState', () => ({ useAuth: () => fixture.auth }));
vi.mock('@/context/RefreshContext', () => ({ useRefreshSubscription() {}, RefreshEvent: {} }));
vi.mock('@/hooks/useUserActive', () => ({ useUserActive: () => true }));
vi.mock('@/hooks/useSubgraphCapability', () => ({ useSubgraphCapability: () => true }));
vi.mock('@/util/apolloClient', () => ({ useSubgraphClient: () => fixture.client, getClient: () => fixture.client }));
import { ProjectProvider } from '@/context/ProjectContext';

const TM = `0x${'12'.repeat(20)}`, AUTH = `0x${'56'.repeat(20)}`, ACCOUNT = `0x${'34'.repeat(20)}`;
const ORG = `0x${'ab'.repeat(32)}`, PID = `0x${'01'.repeat(32)}`, HASH = `0x${'cd'.repeat(32)}`;
const coverage = { status: 'complete', receivedKeys: [], missingIds: [], failedIds: [], issues: [] };
function ProjectHostHarness() {
  fixture.cursor = 0;
  const result = ProjectProvider({ children: null }).props.value;
  for (const effect of fixture.effects.splice(0)) effect();
  return result;
}
function view() { ProjectHostHarness(); return ProjectHostHarness(); }
beforeEach(() => {
  fixture.slots = []; fixture.cursor = 0; fixture.effects = []; fixture.client = { query: vi.fn() };
  fixture.po = { orgId: ORG, orgChainId: 100, taskManagerContractAddress: TM, subgraphUrl: 'https://board.invalid' };
  fixture.auth = { accountAddress: ACCOUNT, isAuthHydrated: true, isAuthenticated: true };
  const source = { chainId: 100, orgId: ORG, contract: TM, endpoint: fixture.po.subgraphUrl,
    indexed: true, snapshot: 'pinned', block: { number: '123', hash: HASH }, method: 'task-board' };
  const tasks = ['Open', 'Cancelled', 'Completed'].map((status, index) => ({ id: `${TM}-${9007199254740993n + BigInt(index)}`,
    taskId: String(9007199254740993n + BigInt(index)), title: 'Historical task', status, payout: '1', bountyPayout: '0',
    absoluteDeadline: null, completionWindow: null, claimDeadline: null, requiresApplication: false, assignee: '', applications: [] }));
  fixture.board = { loading: false, refetch: vi.fn(), result: { source, coverage, taskActionPolicy, projectHasReviewCapability,
    projectManagerFact, hasReleaseData: true, data: { organization: { id: ORG, taskManager: { id: TM,
      projects: [{ id: `${TM}-${PID}`, title: 'Shared work', cap: '0', tasks }] } } } },
    managers: { source, coverage, data: [] } };
  fixture.authority = { enabled: true, subjects: [], scope: { chainId: 100, orgId: ORG, endpoint: source.endpoint, contract: AUTH },
    snapshot: { source: { ...source, contract: AUTH, method: 'authority-snapshot' }, coverage, data: {} },
    taskPolicyForProject: (projectId, account) => {
      const authoritySource = { ...fixture.authority.snapshot.source, account };
      const taskSource = { ...authoritySource, contract: TM };
      return { scope: { ...taskSource, contracts: { membershipAuthority: AUTH } }, projectId,
        permissionMask: knownFact('6', authoritySource), executor: knownFact(false, taskSource), creator: unknownFact('Unavailable') };
    } };
  fixture.subjectRead = vi.fn(() => fixture.authority);
  vi.stubGlobal('fetch', () => { throw new Error('Unexpected network'); });
});
afterEach(() => { fixture.slots.forEach(slot => slot?.cleanup?.()); vi.unstubAllGlobals(); });

describe('actual ProjectProvider board/authority caller wiring', () => {
  it('counts complete current tasks with the original active/completed/cancelled definitions', () => {
    const project = fixture.board.result.data.organization.taskManager.projects[0];
    project.tasks.push({ ...project.tasks[0], id: `${TM}-7`, taskId: '7', status: 'Assigned' },
      { ...project.tasks[0], id: `${TM}-8`, taskId: '8', status: 'Submitted' });
    expect(view().taskTotals).toEqual({ active: 3, completed: 1 });
    project.tasks = [];
    fixture.board.result = { ...fixture.board.result };
    expect(view().taskTotals).toEqual({ active: 0, completed: 0 });
    fixture.board.result = { ...fixture.board.result, data: { organization: { taskManager: { projects: [] } } } };
    expect(view().taskTotals).toEqual({ active: 0, completed: 0 });
  });
  it.each(['loading', 'error', 'incomplete', 'chain', 'org', 'contract', 'endpoint'])(
    'withholds task totals for %s even while old cards remain visible', failure => {
      expect(view().taskTotals).toEqual({ active: 1, completed: 1 });
      if (failure === 'loading') fixture.board = { ...fixture.board, loading: true };
      else if (failure === 'error') fixture.board = { ...fixture.board, error: new Error('Unavailable') };
      else if (failure === 'incomplete') fixture.board.result = { ...fixture.board.result, coverage: { ...coverage, status: 'incomplete' } };
      else {
        const fields = { chain: ['orgChainId', 42161], org: ['orgId', `0x${'ef'.repeat(32)}`],
          contract: ['taskManagerContractAddress', `0x${'ef'.repeat(20)}`], endpoint: ['subgraphUrl', 'https://other.invalid'] };
        const [field, value] = fields[failure]; fixture.po = { ...fixture.po, [field]: value };
      }
      expect(ProjectHostHarness().taskTotals).toEqual({ active: null, completed: null });
    });
  it('selects the actual board block for authority, preserves raw historical rows and enables only qualified actions', () => {
    const host = view();
    expect(fixture.subjectRead.mock.calls.at(-1)[0]).toEqual({ block: fixture.board.result.source.block });
    const project = host.projectsData[0], task = project.columns[0].tasks[0];
    expect(host.taskCount).toBe(2);
    expect(fixture.board.result.data.organization.taskManager.projects[0].tasks).toHaveLength(3);
    expect(task).toMatchObject({ taskId: '9007199254740993', payoutRaw: '1' });
    expect(project.taskSource).toBe(fixture.board.result.source);
    expect(host.getTaskActions(task, project).claim.state).toBe('allowed');
    expect(host.hasReviewCapability(project)).toBe(true);
    expect(host.releasesSupported).toBe(true);
  });
  it('withdraws positive task permissions while authority is at a different block or the restored identity is unresolved', () => {
    view();
    fixture.authority = { ...fixture.authority, snapshot: { ...fixture.authority.snapshot,
      source: { ...fixture.authority.snapshot.source, block: { number: '124', hash: HASH } } } };
    let host = view(), project = host.projectsData[0];
    expect(host.getTaskActions(project.columns[0].tasks[0], project).claim.state).toBe('unknown');
    expect(host.hasReviewCapability(project)).toBe(false);
    fixture.authority.snapshot = { ...fixture.authority.snapshot, source: { ...fixture.authority.snapshot.source, block: fixture.board.result.source.block } };
    fixture.auth = { ...fixture.auth, isAuthHydrated: false, accountHint: ACCOUNT };
    host = view(); project = host.projectsData[0];
    expect(host.getTaskActions(project.columns[0].tasks[0], project).claim.state).toBe('unknown');
  });
  it('withdraws an old manager bypass in the refresh render before the new project view commits', () => {
    fixture.board.managers.data = [{ id: 'manager', manager: ACCOUNT, isActive: true,
      project: { id: `${TM}-${PID}`, projectId: PID, deleted: false, taskManager: { id: TM, organization: { id: ORG } } } }];
    const old = view();
    expect(old.projectsData[0].managerFact).toMatchObject({ state: 'known', value: true });
    fixture.board = { ...fixture.board, result: { ...fixture.board.result,
      source: { ...fixture.board.result.source, block: { number: '124', hash: HASH } } },
      managers: { ...fixture.board.managers, data: [], source: { ...fixture.board.managers.source, block: { number: '124', hash: HASH } } } };
    const immediate = ProjectHostHarness(), oldProject = immediate.projectsData[0];
    expect(oldProject.taskSource.block.number).toBe('123');
    expect(immediate.getTaskActions(oldProject.columns[0].tasks[0], oldProject).claim.state).toBe('unknown');
    expect(immediate.hasReviewCapability(oldProject)).toBe(false);
  });
  it('keeps visible known data after a failed refresh while withholding actions and unsupported release indexing', () => {
    view();
    fixture.board = { ...fixture.board, error: new Error('Mock unavailable'), managers: undefined,
      result: { ...fixture.board.result, hasReleaseData: false } };
    const host = view(), project = host.projectsData[0];
    expect(host.taskCount).toBe(2); expect(host.projectsError).toBeInstanceOf(Error);
    expect(host.getTaskActions(project.columns[0].tasks[0], project).claim.state).toBe('unknown');
    expect(host.releasesSupported).toBe(false);
  });
});

it('loads complete applications only on detail demand, enables exact absence, and rejects old-account completions/retries', async () => {
  const project = fixture.board.result.data.organization.taskManager.projects[0];
  const raw = project.tasks[0]; raw.requiresApplication = true;
  const parent = { id: raw.id, taskId: raw.taskId, taskManager: TM, project: { id: project.id, projectId: PID, deleted: false,
    taskManager: { id: TM, organization: { id: ORG } } } };
  const response = () => ({ data: { _meta: { block: { number: 123, hash: HASH } }, organization: { id: ORG, taskManager: { id: TM, organization: { id: ORG } } }, tasks: [parent], taskApplications: [] } });
  fixture.client.query.mockImplementation(async () => response());
  let host = view(), currentProject = host.projectsData[0], task = currentProject.columns[0].tasks[0];
  expect(fixture.client.query).not.toHaveBeenCalled();
  expect(host.getTaskActions(task, currentProject).apply.state).toBe('unknown');
  await host.ensureTaskApplications(task);
  host = view();
  expect(host.getTaskApplicationRead(task).snapshot.coverage.status).toBe('complete');
  expect(host.getTaskActions(task, host.projectsData[0]).apply.state).toBe('allowed');
  let resolve;
  fixture.client.query.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const saved = host.ensureTaskApplications;
  const late = saved(task, true);
  await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
  fixture.auth = { ...fixture.auth, accountAddress: `0x${'9'.repeat(40)}` };
  host = view();
  expect(host.getTaskApplicationRead(task)).toBeNull();
  resolve(response()); expect(await late).toBeNull();
  const count = fixture.client.query.mock.calls.length;
  expect(await saved(task, true)).toBeNull(); expect(fixture.client.query).toHaveBeenCalledTimes(count);
  const retry = host.ensureTaskApplications;
  fixture.slots.forEach(slot => slot?.cleanup?.());
  expect(await retry(task, true)).toBeNull(); expect(fixture.client.query).toHaveBeenCalledTimes(count);
});
