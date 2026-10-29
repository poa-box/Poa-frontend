import { describe, expect, it } from 'vitest';
import { composeSubjectId } from '@poa-box/core/authority/ids';
import { projectContext, permissionWord } from '@poa-box/core/tx/authority';
import { taskPolicyFromAuthority } from '@/lib/accessV2/taskPolicyProjection';
import { PERM_KEYS } from '@/lib/accessV2/permKeys';

const addr = digit => `0x${digit.repeat(40)}`;
const authority = addr('1'), taskManager = addr('2'), account = addr('3');
const orgId = `0x${'4'.repeat(64)}`, projectId = `0x${'0'.repeat(63)}9`;
const role = composeSubjectId(authority, '1'), group = composeSubjectId(authority, '2');
const scope = { chainId: 100, orgId, contract: authority, endpoint: 'https://index.example' };
const source = { ...scope, method: 'authority', indexed: true, snapshot: 'pinned', block: { number: '123' } };
const coverage = { status: 'complete', receivedKeys: [], failedIds: [], missingIds: [], issues: [] };
function snapshot() {
  return { source, coverage, data: {
    subjects: [{ subjectId: role, name: 'Members', kind: 'Role' }, { subjectId: group, name: 'Builders', kind: 'Group' }],
    groupEdges: [{ id: 'edge', roleSubjectId: role, groupSubjectId: group, isActive: true }],
    permissions: [{ id: 'p', subjectId: group, permKey: PERM_KEYS.TM_PERMS, ctx: `0x${'0'.repeat(64)}`, word: permissionWord('33', false).toString() }],
    memberships: [{ user: account, accepted: true, acceptedAt: '1', seededWhilePaused: false, ruleKind: 'None', rule: null,
      pendingAction: null, emailVerified: false, vouchEpoch: '0', vouchCount: '0',
      subject: { subjectId: role, kind: 'Role', defaultAllow: true, vouchConfig: null } }],
    taskModule: { source: { ...source, contract: taskManager, contracts: { membershipAuthority: authority, taskManager } }, executor: addr('9'), creatorSubjectIds: [group] },
  } };
}
describe('authority host task projection', () => {
  it('uses current group membership and exact project override without a role-id authorization fallback', () => {
    const observed = snapshot();
    const read = () => taskPolicyFromAuthority({ snapshot: observed, scope, account, projectId, taskManager });
    expect(read().permissionMask).toMatchObject({ state: 'known', value: '33', source: { account, contract: authority } });
    expect(read().creator.state).toBe('unknown');
    observed.data.permissions.push({ id: 'override', subjectId: group, permKey: PERM_KEYS.TM_PERMS,
      ctx: projectContext(projectId), word: permissionWord('0', false).toString() });
    expect(read().permissionMask).toMatchObject({ state: 'known', value: '0' });
    observed.data.permissions[1].word = permissionWord('0', true).toString();
    expect(read().permissionMask).toMatchObject({ state: 'known', value: '33' });
  });
  it('withholds grants for incomplete observations and keeps missing module facts unknown', () => {
    const observed = snapshot();
    observed.coverage = { ...coverage, status: 'incomplete' };
    expect(taskPolicyFromAuthority({ snapshot: observed, scope, account, projectId, taskManager }).permissionMask.state).toBe('unknown');
    observed.coverage = coverage; observed.data.taskModule = null;
    const result = taskPolicyFromAuthority({ snapshot: observed, scope, account, projectId, taskManager });
    expect(result.permissionMask.state).toBe('known');
    expect(result.creator.state).toBe('unknown');
    expect(result.executor.state).toBe('unknown');
  });
});
