import { describe, expect, it } from 'vitest';
import { knownFact, unknownFact } from '@poa-box/core/data/facts';
import { normalizeAuthoritySubjects } from '@/lib/accessV2/normalize';
import { normalizeMembership } from '@/lib/accessV2/memberships';
import { projectMembershipLifecycle, projectPendingAction, electorateActivationFacts, permissionSnapshotFromSubjects } from '@/lib/accessV2/coreProjection';
import { predictSubjectIdsFromSnapshot, composeSubjectId, toSubjectId } from '@/lib/accessV2/ids';
import { PERM_KEYS, GLOBAL_CTX, encodePermWord } from '@/lib/accessV2/permKeys';
import { projectTaskPermissions, effectiveTaskPermissionMask } from '@/util/permissions';
import { buildProjectPermissionsMatrix } from '@/util/projectPermissions';
import { membersSubject, execsSubject, everyoneGroup, aliceMembership, MEMBERS_ID, EVERYONE_GROUP_ID, AUTHORITY_ADDRESS, ALICE, ORG_ID } from '@/lib/accessV2/fixtures';

const scope = { chainId: 100, orgId: ORG_ID, contract: AUTHORITY_ADDRESS, account: ALICE };
const source = { ...scope, endpoint: 'https://offline.test/authority', method: 'mock-graph', indexed: true, snapshot: 'latest', block: { number: '123' } };
const coverage = { status: 'complete', receivedKeys: [], missingIds: [], failedIds: [], issues: [] };
const evidence = { scope, snapshot: { source, coverage } };
const snap = data => ({ source, coverage, data });
const perm = (key, value, ctx = GLOBAL_CTX, inheritGlobal = false) => ({ id: `${key}:${ctx}`, permKey: key, ctx, word: encodePermWord({ value, inheritGlobal }) });
const rawSubjects = () => [
  membersSubject({ perms: [perm(PERM_KEYS.TM_PERMS, '1'), perm(PERM_KEYS.TM_PERMS, '0', `0x${'0'.repeat(63)}1`)] }),
  execsSubject({ perms: [] }),
  everyoneGroup({ perms: [perm(PERM_KEYS.PT_MEMBER, '1'), perm(PERM_KEYS.PT_APPROVE, '1'), perm(PERM_KEYS.TM_PERMS, '32')] }),
];

describe('source-qualified authority subject adapters', () => {
  it('projects group-only Shares capabilities and independent project overrides', () => {
    const { roles, groups } = normalizeAuthoritySubjects(rawSubjects(), evidence);
    const role = roles[0];
    expect(role.permEffective(PERM_KEYS.PT_MEMBER)).toBe('1');
    expect(role.permEffective(PERM_KEYS.PT_APPROVE)).toBe('1');
    expect(role.permViaGroup(PERM_KEYS.PT_MEMBER)).toBe(true);
    expect(role.permSources(PERM_KEYS.PT_MEMBER)).toEqual([EVERYONE_GROUP_ID]);
    expect(role.permEffective(PERM_KEYS.TM_PERMS)).toBe('33');
    expect(role.permEffective(PERM_KEYS.TM_PERMS, `0x${'0'.repeat(63)}1`)).toBe('32');
    expect(role.groups[0]).toBe(groups[0]);
  });

  it.each([
    { ...evidence, scope: { ...scope, chainId: 42161 } },
    { ...evidence, scope: { ...scope, orgId: `0x${'99'.repeat(32)}` } },
    { ...evidence, snapshot: { source, coverage: { ...coverage, status: 'incomplete' } } },
  ])('never authorizes a stale or incomplete scope', badEvidence => {
    const role = normalizeAuthoritySubjects(rawSubjects(), badEvidence).roles[0];
    expect(role.permFacts(PERM_KEYS.PT_MEMBER).value.state).toBe('unknown');
    expect(role.permEffective(PERM_KEYS.PT_MEMBER)).toBe('0');
    expect(role.canVote).toBe(false);
  });

  it('retains unknown field population rather than certifying missing permissions as a complete result', () => {
    const rows = rawSubjects(); delete rows[0].perms;
    const role = normalizeAuthoritySubjects(rows, evidence).roles[0];
    expect(role.permFacts(PERM_KEYS.PT_MEMBER).value.state).toBe('unknown');
  });

  it('rejects malformed permission words even when legacy presentation decodes them to zero', () => {
    const rows = rawSubjects(); rows[0].perms[0].word = 'malformed';
    const role = normalizeAuthoritySubjects(rows, evidence).roles[0];
    expect(role.permFacts(PERM_KEYS.PT_MEMBER).value.state).toBe('unknown');
  });
});

describe('canonical lifecycle evidence', () => {
  it('recomputes an unaccepted seat after current default and vouch config change', () => {
    const raw = aliceMembership({ accepted: false, eligible: true, isMember: false, claimable: true,
      ruleKind: 'None', rule: null, emailVerified: false, vouchEpoch: '0', vouchCount: '0',
      subject: { subjectId: MEMBERS_ID, kind: 'Role', defaultAllow: false, vouchConfig: null }, pendingAction: null });
    const normalized = normalizeMembership(raw);
    expect(normalized.membershipProjection).toBe('current-authority-inputs');
    expect(normalized.claimable).toBe(false);
    const lifecycle = projectMembershipLifecycle({ snapshot: snap(raw), scope });
    expect(lifecycle.claimable).toMatchObject({ state: 'known', value: false });
    expect(lifecycle.claimAuthorized.state).toBe('unknown');
    expect(projectMembershipLifecycle({ snapshot: snap(raw), scope: { ...scope, account: `0x${'bb'.repeat(20)}` } }).isMember.state).toBe('unknown');
  });

  it('preserves group electorate activation, seeded backdating and missing timestamps as unknown', () => {
    const subjects = normalizeAuthoritySubjects(rawSubjects()).subjects;
    const authority = permissionSnapshotFromSubjects(subjects, snap(null));
    const memberships = snap([{ subjectId: MEMBERS_ID, isMember: knownFact(true), acceptedAt: unknownFact('missing'), seededWhilePaused: knownFact(true) }]);
    const gate = electorateActivationFacts({ memberships, authority, scope,
      restrictions: knownFact([EVERYONE_GROUP_ID]), proposalCreatedAt: knownFact('100') });
    // Group also contains Executives. A missing role membership fact stays unknown.
    expect(gate.canVote.state).toBe('unknown');
    const ownGate = electorateActivationFacts({ memberships, authority, scope,
      restrictions: knownFact([MEMBERS_ID]), proposalCreatedAt: knownFact('100') });
    expect(ownGate.canVote).toMatchObject({ state: 'known', value: true });
    expect(ownGate.activeSince.value).toBe('1');
    memberships.data[0].seededWhilePaused = knownFact(false);
    expect(electorateActivationFacts({ memberships, authority, scope,
      restrictions: knownFact([MEMBERS_ID]), proposalCreatedAt: knownFact('100') }).canVote.state).toBe('unknown');
  });

  it('does not confuse a matured offer with authorization to finalize it', () => {
    const pending = knownFact({ id: 'p', pendingId: '9', action: 'Offer', status: 'Pending', actor: ALICE, user: ALICE, activatesAt: '10' });
    const facts = projectPendingAction({ pending, now: '20', paused: knownFact(false),
      viewerIsExecutor: knownFact(false), viewerIsCurrentManager: knownFact(true), actorAuthorized: knownFact(true) });
    expect(facts.operation.value).toBe('claim');
    expect(facts.matured.value).toBe(true);
    expect(facts.canComplete.state).toBe('unknown');
  });
});

describe('integer IDs and task context', () => {
  it('uses complete scoped allocation evidence and refuses sequence overflow/incomplete history', () => {
    const id = composeSubjectId(AUTHORITY_ADDRESS, 2n ** 63n + 4n);
    const result = predictSubjectIdsFromSnapshot({ authority: AUTHORITY_ADDRESS, history: snap([{ subjectId: id }]), scope, count: 2 });
    expect(result.status).toBe('ready');
    expect(result.data.subjectIds[0]).toBe(composeSubjectId(AUTHORITY_ADDRESS, 2n ** 63n + 5n));
    expect(result.data.executionStable).toBe(false);
    expect(predictSubjectIdsFromSnapshot({ authority: AUTHORITY_ADDRESS, history: { ...snap([]), coverage: { ...coverage, status: 'incomplete' } }, scope }).status).toBe('blocked');
    expect(() => composeSubjectId(AUTHORITY_ADDRESS, 2n ** 64n)).toThrow();
    expect(toSubjectId(Number.MAX_SAFE_INTEGER + 1)).toBeNull();
  });

  it('uses a present zero project override and explicit inheritance in rights and matrix', () => {
    const global = { hatId: MEMBERS_ID, mask: 255 };
    const local = { hatId: MEMBERS_ID, mask: 0 };
    expect(effectiveTaskPermissionMask(global, local)).toBe('0');
    expect(effectiveTaskPermissionMask(global, { ...local, inheritGlobal: true })).toBe('255');
    const rights = projectTaskPermissions({ managers: [ALICE], rolePermissions: [local], globalRolePermissions: [global] }, [MEMBERS_ID], ALICE);
    expect(rights.canCreate).toBe(true); expect(rights.canBudget).toBe(false);
    const matrix = buildProjectPermissionsMatrix({ roles: [{ hatId: MEMBERS_ID }], rolePermissions: [local], globalRolePermissions: [global] });
    expect(matrix.hasAnyGrant).toBe(false); expect(matrix.overrideHatIds.has(MEMBERS_ID)).toBe(true);
  });
});
