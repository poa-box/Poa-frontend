import { describe, expect, it, vi } from 'vitest';
import { print } from 'graphql';
import { readBoardProjects, readBoardManagers, readBoardSnapshot } from '@/lib/tasks/projectReads';

const TM = `0x${'12'.repeat(20)}`;
const ORG = `0x${'ab'.repeat(32)}`;
const source = { chainId: 100, orgId: ORG, contract: TM, endpoint: 'https://example.test/gnosis',
  indexed: true, snapshot: 'latest', method: 'work-test' };
const pid = index => `0x${BigInt(index).toString(16).padStart(64, '0')}`;
const manager = { id: TM, organization: { id: ORG } };
const project = index => ({ id: `${TM}-${pid(index)}`, projectId: pid(index), title: `Project ${index}`,
  cap: '0', deleted: false, taskManager: manager });
const task = id => ({ id: `${TM}-${id}`, taskId: String(id), title: 'Work', metadataHash: null,
  taskManager: TM, project: project(1), status: 'Open', payout: '1', bountyToken: `0x${'0'.repeat(40)}`,
  bountyPayout: '0', requiresApplication: false });
const proof = { block: { number: 123, hash: `0x${'cd'.repeat(32)}` } };
function fixture({ projects = [project(1)], tasks = [], managers = [] } = {}) {
  return { query: vi.fn(async ({ query, variables }) => {
    const text = print(query);
    const key = text.includes('query TasksPage') ? 'tasks' : text.includes('query ProjectManagersPage') ? 'projectManagers' : 'projects';
    const rows = { projects, tasks, projectManagers: managers }[key];
    return { data: { _meta: proof, organization: { id: ORG, taskManager: manager },
      [key]: rows.filter(row => row.id > variables.cursor).slice(0, variables.first) } };
  }) };
}

describe('canonical complete board collections at one actually observed block', () => {
  it('keeps projects/tasks beyond old caps, cancelled history, exact IDs and existing presentation selections', async () => {
    const high = 9007199254742999n;
    const tasks = Array.from({ length: 1001 }, (_, index) => task(high - BigInt(index))).sort((a, b) => a.id.localeCompare(b.id));
    tasks[5].status = 'Cancelled';
    const tail = tasks.at(-1);
    tail.metadata = { submission: 'Saved work' }; tail.releases = [{ id: 'release' }];
    tail.claimExpiries = [{ id: 'expiry' }]; tail.applications = [{ applicant: TM }];
    const client = fixture({ projects: Array.from({ length: 1001 }, (_, index) => project(index)), tasks });
    const { result, managers } = await readBoardSnapshot({ client, source, releasesSupported: true });
    const projects = result.data.organization.taskManager.projects;
    expect(projects).toHaveLength(1001);
    expect(projects[1].tasks).toHaveLength(1001);
    expect(projects[1].tasks.find(row => row.id === tail.id)).toEqual(tail);
    expect(projects[1].tasks.some(row => row.status === 'Cancelled')).toBe(true);
    expect(result.coverage.status).toBe('complete');
    expect(result.source).toMatchObject({ snapshot: 'pinned', block: { number: '123', hash: proof.block.hash } });
    expect(managers.source.block).toEqual(result.source.block);
    expect(client.query.mock.calls.length).toBe(6);
    for (const [request] of client.query.mock.calls.slice(1)) {
      expect(request.variables.block).toEqual({ hash: proof.block.hash });
      expect(print(request.query)).toContain('_meta(block: $block)');
      expect(print(request.query)).toContain('block: $block');
      expect(request.fetchPolicy).toBe('network-only');
    }
    const taskQuery = client.query.mock.calls.find(([request]) => print(request.query).includes('query TasksPage'))[0];
    expect(print(taskQuery.query)).toContain('applications');
    expect(print(taskQuery.query)).toContain('submissionHash');
    expect(print(taskQuery.query)).toContain('claimExpiries');
    expect(print(taskQuery.query)).toContain('releases');
    expect(print(taskQuery.query)).not.toMatch(/createdAt_gte|status_not/);
  });
  it('rejects a failed, omitted-proof or advanced terminal page instead of certifying a partial board', async () => {
    for (const failure of ['throw', 'missing', 'advanced']) {
      const client = fixture({ tasks: Array.from({ length: 1000 }, (_, index) => task(1000 + index)) });
      const query = client.query.getMockImplementation();
      client.query.mockImplementation(async request => {
        if (print(request.query).includes('query TasksPage') && request.variables.cursor) {
          if (failure === 'throw') throw new Error('Mock unavailable');
          return { data: { organization: { id: ORG, taskManager: manager }, tasks: [],
            ...(failure === 'advanced' ? { _meta: { block: { ...proof.block, number: 124 } } } : {}) } };
        }
        return query(request);
      });
      await expect(readBoardProjects({ client, source, releasesSupported: true })).rejects.toThrow();
    }
  });
  it('refuses malformed, foreign-module, orphan and duplicate rows', async () => {
    for (const data of [
      { projects: [{ ...project(1), id: `0x${'56'.repeat(20)}-${pid(1)}` }] },
      { tasks: [{ ...task('1'), id: `${TM}-2` }] },
      { tasks: [{ ...task('1'), project: project(2) }] },
      { projects: [project(1), project(1)] },
      { tasks: [{ ...task('1'), taskManager: `0x${'56'.repeat(20)}` }] },
    ]) await expect(readBoardProjects({ client: fixture(data), source, releasesSupported: true })).rejects.toThrow();
  });
  it('supports core deadline fallback and the release veto without retrying network outages as schema failures', async () => {
    const client = fixture();
    const query = client.query.getMockImplementation();
    client.query.mockImplementation(request => {
      if (print(request.query).includes('query TasksPage(') && print(request.query).includes('completionWindow')) throw new Error('Type `Task` has no field `completionWindow`');
      return query(request);
    });
    const result = await readBoardProjects({ client, source, releasesSupported: false });
    expect(result.hasDeadlineData).toBe(false);
    expect(result.hasReleaseData).toBe(false);
    expect(client.query.mock.calls.every(([request]) => !print(request.query).includes('releaseCount'))).toBe(true);
    const outage = { query: vi.fn().mockRejectedValue(new Error('Mock network unavailable')) };
    await expect(readBoardProjects({ client: outage, source, releasesSupported: true })).rejects.toThrow();
    expect(outage.query).toHaveBeenCalledTimes(1);
  });
  it('requires manager binding and block evidence even for an empty collection', async () => {
    const pinned = { ...source, snapshot: 'pinned', block: { number: '123', hash: proof.block.hash } };
    for (const patch of [{ organization: null }, { _meta: null }, { organization: { id: ORG, taskManager: { ...manager, id: `0x${'56'.repeat(20)}` } } }]) {
      const result = await readBoardManagers({ client: { query: async () => ({ data: { _meta: proof,
        organization: { id: ORG, taskManager: manager }, projectManagers: [], ...patch } }) }, source: pinned });
      expect(result.coverage.status !== 'complete' || result.coverage.issues.length > 0).toBe(true);
    }
  });
  it('does not continue a confirmed write from a head older than its receipt', async () => {
    const client = fixture();
    await expect(readBoardSnapshot({ client, source, releasesSupported: true, minimumBlock: '124' })).rejects.toThrow(/indexing/);
    expect(client.query).toHaveBeenCalledTimes(1);
  });
  it('does not borrow cached metadata when the current raw response omits proof', async () => {
    const pinned = { ...source, snapshot: 'pinned', block: { number: '123' } };
    const client = fixture();
    const read = client.query.getMockImplementation();
    client.query.mockImplementation(async request => {
      request.context.onCoreResponse({ data: { organization: { id: ORG, taskManager: manager }, projects: [], tasks: [] } });
      return read(request);
    });
    await expect(readBoardProjects({ client, source: pinned, releasesSupported: true })).rejects.toThrow();
  });
});
