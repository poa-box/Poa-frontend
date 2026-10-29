import { describe, expect, it } from 'vitest';
import { composeSubjectId } from '@poa-box/core/authority/ids';
import { permissionWord, AUTHORITY_KEYS } from '@poa-box/core/tx/authority';
import { orgStructurePermissions } from '@/hooks/orgStructurePermissions';

const authority = `0x${'11'.repeat(20)}`;
const manager = `0x${'22'.repeat(20)}`;
const orgId = `0x${'33'.repeat(32)}`;
const role = composeSubjectId(authority, '1');
const other = composeSubjectId(authority, '2');
const group = composeSubjectId(authority, '3');
const ctx = `0x${'00'.repeat(32)}`;
const scope = { chainId: 100, orgId, endpoint: 'https://offline.example', contract: authority };
const source = { ...scope, method: 'authority-snapshot', indexed: true, snapshot: 'pinned', block: { number: '123' } };
const roles = [{ hatId: role }, { hatId: other }];
const permission = (subjectId, key, value) => ({ id: `${subjectId}:${key}`, subjectId,
  permKey: AUTHORITY_KEYS[key], ctx, word: permissionWord(value).toString() });
function snapshot() {
  return { source, coverage: { status: 'complete', receivedKeys: [], failedIds: [], missingIds: [], issues: [] }, data: {
    subjects: [{ subjectId: role, kind: 'Role', name: 'Members' }, { subjectId: other, kind: 'Role', name: 'Other' },
      { subjectId: group, kind: 'Group', name: 'Everyone' }],
    groupEdges: [{ id: 'edge', roleSubjectId: role, groupSubjectId: group, isActive: true }],
    permissions: [permission(role, 'TM_PERMS', (2n ** 200n + 129n).toString()),
      permission(group, 'TM_PERMS', '32'), permission(group, 'PT_MEMBER', '1')], rules: [],
    taskModule: { creatorSubjectIds: [group], source: { ...source, contract: manager,
      contracts: { membershipAuthority: authority, taskManager: manager } } },
  } };
}
describe('organization structure display from current authority evidence', () => {
  it('preserves own and inherited grants, exact mask bits, proven absence and current project creators', () => {
    const { permissionsMatrix: matrix } = orgStructurePermissions({ snapshot: snapshot(), scope, roles });
    expect(matrix[role].TaskManager_Create).toBe(true);
    expect(matrix[role].TaskManager_EditFull).toBe(true);
    expect(matrix[role].TaskManager_Budget).toBe('inherited');
    expect(matrix[role].TaskManager_Review).toBe(false);
    expect(matrix[role].ParticipationToken_Member).toBe('inherited');
    expect(matrix[other].ParticipationToken_Member).toBe(false);
    expect(matrix[role].TaskManager_CreateProject).toBe('inherited');
    expect(matrix[other].TaskManager_CreateProject).toBe(false);
  });

  it.each(['absent', 'incomplete rules', 'another chain', 'another organization', 'another endpoint', 'another authority'])('retains unknown cells for %s evidence', failure => {
    const observed = snapshot();
    const expected = { ...scope };
    if (failure === 'incomplete rules') observed.coverage = { ...observed.coverage, status: 'incomplete', failedIds: ['rules'], issues: [{ code: 'PAGE_FAILED' }] };
    if (failure === 'another chain') expected.chainId = 42161;
    if (failure === 'another organization') expected.orgId = `0x${'aa'.repeat(32)}`;
    if (failure === 'another endpoint') expected.endpoint = 'https://another.example';
    if (failure === 'another authority') expected.contract = manager;
    const result = orgStructurePermissions({ snapshot: failure === 'absent' ? null : observed, scope: expected, roles });
    expect(Object.values(result.permissionsMatrix).flatMap(Object.values).every(value => value === null)).toBe(true);
    expect(result.permissionColumns.length).toBeGreaterThan(10);
  });

  it('does not convert invalid current permission words into denied grants', () => {
    const observed = snapshot(); observed.data.permissions[0].word = 'malformed';
    expect(orgStructurePermissions({ snapshot: observed, scope, roles }).permissionsMatrix[role].TaskManager_Create).toBeNull();
  });

  it('revokes inherited grants when the current group edge is inactive', () => {
    const observed = snapshot(); observed.data.groupEdges[0].isActive = false;
    const matrix = orgStructurePermissions({ snapshot: observed, scope, roles }).permissionsMatrix;
    expect(matrix[role].ParticipationToken_Member).toBe(false);
    expect(matrix[role].TaskManager_Budget).toBe(false);
    expect(matrix[role].TaskManager_CreateProject).toBe(false);
  });

  it('leaves only project creation unknown for missing or differently pinned auxiliary bindings', () => {
    for (const binding of [null, { ...snapshot().data.taskModule, source: { ...snapshot().data.taskModule.source, block: { number: '124' } } }]) {
      const observed = snapshot(); observed.data.taskModule = binding;
      const matrix = orgStructurePermissions({ snapshot: observed, scope, roles }).permissionsMatrix;
      expect(matrix[role].TaskManager_Create).toBe(true);
      expect(matrix[role].TaskManager_CreateProject).toBeNull();
    }
  });
});
