import { expect, it, vi } from 'vitest';
import { projectTaskApplicant } from '@poa-box/core/reads/task';
import { readTaskApplications } from '@/lib/tasks/applications';
const tm = `0x${'1'.repeat(40)}`, orgId = `0x${'2'.repeat(64)}`, pid = `0x${'3'.repeat(64)}`;
const source = { chainId: 100, orgId, contract: tm, endpoint: 'https://graph.example', indexed: true, snapshot: 'pinned', method: 'board', block: { number: '123', hash: `0x${'a'.repeat(64)}` } };
const task = { id: `${tm}-9007199254740993`, taskId: '9007199254740993', taskManager: tm, project: { id: `${tm}-${pid}`, projectId: pid, deleted: false, taskManager: { id: tm, organization: { id: orgId } } } };
const account = n => `0x${n.toString(16).padStart(40, '0')}`;
const applications = Array.from({ length: 251 }, (_, i) => ({ id: `application-${String(i).padStart(5, '0')}`, applicant: account(i + 1), applicantUsername: null,
  applicationHash: `0x${'f'.repeat(64)}`, approved: false, approver: null, approverUsername: null, appliedAt: '9007199254740993', appliedAtBlock: '100', approvedAt: null,
  metadata: { id: `meta-${i}`, notes: `Notes ${i}`, experience: null, indexedAt: '120' }, task }));
function client(patch = data => data) { return { query: vi.fn(async ({ variables, context }) => {
  expect(variables.block).toEqual({ hash: source.block.hash });
  const data = patch({ organization: { id: orgId, taskManager: { id: tm, organization: { id: orgId } } }, _meta: { block: { number: 123, hash: source.block.hash } },
    tasks: [task], taskApplications: applications.filter(row => row.id > variables.cursor).slice(0, variables.first) });
  context.onCoreResponse({ data }); return { data };
}) }; }
it('enumerates beyond nested preview limits and preserves raw identities, metadata and approval fields', async () => {
  const transport = client();
  const result = await readTaskApplications({ client: transport, source, task: task.id });
  expect(transport.query).toHaveBeenCalledTimes(2);
  expect(result.applicants).toHaveLength(251);
  expect(result.applicants[250]).toMatchObject({ id: 'application-00250', notes: 'Notes 250', experience: null, appliedAt: '9007199254740993', approved: false, task });
  const project = account => projectTaskApplicant({ applications: result.snapshot, task: task.id, block: source.block, scope: { ...source, account } });
  expect(project(account(251))).toMatchObject({ state: 'known', value: true });
  expect(project(account(252))).toMatchObject({ state: 'known', value: false });
  expect(projectTaskApplicant({ applications: result.snapshot, task: `${tm}-1`, block: source.block, scope: { ...source, account: account(1) } }).state).toBe('unknown');
});
it('cannot certify absence from missing parents, foreign pages or block drift', async () => {
  for (const patch of [data => ({ ...data, tasks: [] }), data => ({ ...data, _meta: { block: { number: 124, hash: source.block.hash } } }), data => ({ ...data, organization: { id: orgId, taskManager: { id: account(88) } } })]) {
    await expect(readTaskApplications({ client: client(patch), source, task: task.id })).rejects.toThrow();
  }
});
