import { describe, expect, it } from 'vitest';
import { composeSubjectId } from '@poa-box/core/authority/ids';
import { AUTHORITY_KEYS, projectContext, permissionWord } from '@poa-box/core/tx/authority';
import { projectTaskAuthorityFacts } from '@/lib/tasks/authorityPolicy';
import { taskPolicyFromAuthority } from '@/lib/accessV2/taskPolicyProjection';
import { taskActionPolicy } from '@/lib/tasks/actionPolicy';

const TM = `0x${'12'.repeat(20)}`;
const AUTH = `0x${'56'.repeat(20)}`;
const ACCOUNT = `0x${'34'.repeat(20)}`;
const OTHER = `0x${'78'.repeat(20)}`;
const PID = `0x${'01'.repeat(32)}`;
const GLOBAL = `0x${'0'.repeat(64)}`;
const scope = { chainId: 100, orgId: `0x${'ab'.repeat(32)}`, contract: TM, endpoint: 'https://example.test/gnosis',
  account: ACCOUNT, hydrated: true };
const authorityScope = { chainId: scope.chainId, orgId: scope.orgId, endpoint: scope.endpoint, contract: AUTH };
const source = { ...scope, indexed: true, snapshot: 'pinned', method: 'board', block: { number: '123', hash: `0x${'ef'.repeat(32)}` } };
const coverage = { status: 'complete', receivedKeys: ['subjects', 'permissions', 'memberships'], missingIds: [], failedIds: [], issues: [] };
const ROLE = composeSubjectId(AUTH, '1');
const GROUP = composeSubjectId(AUTH, '2');
const row = (subjectId, ctx, mask, inherit = false) => ({ id: `${subjectId}:${ctx}`, subjectId,
  permKey: AUTHORITY_KEYS.TM_PERMS, ctx, word: permissionWord(mask, inherit).toString() });
function evidence(rows = [row(ROLE, GLOBAL, '255')]) {
  const authoritySource = { ...source, ...authorityScope, method: 'authority-snapshot' };
  const snapshot = { source: authoritySource, coverage, data: {
    subjects: [{ subjectId: ROLE, kind: 'Role', name: 'Member' }, { subjectId: GROUP, kind: 'Group', name: 'Working group' }],
    groupEdges: [{ id: 'edge', roleSubjectId: ROLE, groupSubjectId: GROUP, isActive: true }], permissions: rows,
    memberships: [{ user: ACCOUNT, accepted: true, acceptedAt: '1', seededWhilePaused: false, ruleKind: 'None', rule: null,
      pendingAction: null, emailVerified: false, vouchEpoch: '0', vouchCount: '0',
      subject: { subjectId: ROLE, kind: 'Role', defaultAllow: true, vouchConfig: null } }],
    taskModule: { source: { ...source, contracts: { membershipAuthority: AUTH, taskManager: TM } }, executor: OTHER, creatorSubjectIds: [GROUP] },
  } };
  const authority = { enabled: true, scope: authorityScope, snapshot,
    taskPolicyForProject: (projectId, account) => taskPolicyFromAuthority({ snapshot: account === ACCOUNT ? snapshot : null,
      scope: authorityScope, projectId, account, taskManager: TM }) };
  return { authority, projectId: PID, scope, source };
}

describe('board policy uses the authority host projection at the same observed block', () => {
  it('adopts current groups, exact zero overrides and global inheritance through the actual core projection', () => {
    expect(projectTaskAuthorityFacts(evidence([row(GROUP, GLOBAL, '12')])).permissionMask).toMatchObject({ state: 'known', value: '12' });
    expect(projectTaskAuthorityFacts(evidence([row(ROLE, GLOBAL, '255'), row(ROLE, projectContext(PID), '0')])).permissionMask)
      .toMatchObject({ state: 'known', value: '0' });
    expect(projectTaskAuthorityFacts(evidence([row(ROLE, GLOBAL, '32'), row(ROLE, projectContext(PID), '4', true)])).permissionMask)
      .toMatchObject({ state: 'known', value: '36' });
  });
  it('preserves source identity into real task policy without pretending authority rows came from the TaskManager', () => {
    const authority = projectTaskAuthorityFacts(evidence());
    expect(authority.permissionMask.source.contract).toBe(AUTH);
    expect(authority.permissionMask.source.block).toEqual(source.block);
    const project = { id: `${TM}-${PID}`, taskSource: source, taskCoverage: coverage,
      managerFact: { state: 'known', value: false, source } };
    const task = { id: `${TM}-1`, projectId: project.id, status: 'Open', claimedBy: '',
      absoluteDeadline: null, claimDeadline: null, requiresApplication: false, applicants: [] };
    expect(taskActionPolicy({ scope, authority, project, task, now: 2000000, releasesSupported: true }).claim.state).toBe('allowed');
    expect(authority.creator.state).toBe('unknown');
  });
  it('withholds actions for independently observed blocks, foreign endpoints, partial coverage and unresolved identities', () => {
    for (const patch of [{ block: { ...source.block, number: '124' } },
      { block: { ...source.block, hash: `0x${'ed'.repeat(32)}` } }, { endpoint: 'https://other.test' }]) {
      const args = evidence();
      args.authority.snapshot.source = { ...args.authority.snapshot.source, ...patch };
      expect(projectTaskAuthorityFacts(args).permissionMask.state).toBe('unknown');
    }
    const partial = evidence(); partial.authority.snapshot.coverage = { ...coverage, status: 'incomplete' };
    expect(projectTaskAuthorityFacts(partial).permissionMask.state).toBe('unknown');
    const args = evidence();
    expect(projectTaskAuthorityFacts({ ...args, scope: { ...scope, account: OTHER } }).permissionMask.state).toBe('unknown');
    expect(projectTaskAuthorityFacts({ ...args, scope: { ...scope, hydrated: false } }).permissionMask.state).toBe('unknown');
    expect(projectTaskAuthorityFacts({ ...args, source: { ...source, snapshot: 'latest' } }).permissionMask.state).toBe('unknown');
  });
  it('keeps current creator adoption explicitly pending even when the older subject-only projection supplies true', () => {
    const args = evidence();
    expect(args.authority.taskPolicyForProject(PID, ACCOUNT).creator.state).toBe('unknown');
    expect(projectTaskAuthorityFacts(args).creator.state).toBe('unknown');
  });
});
