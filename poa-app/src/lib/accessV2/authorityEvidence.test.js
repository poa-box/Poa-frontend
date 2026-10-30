import { describe, expect, it, vi } from 'vitest';
import { composeSubjectId } from '@poa-box/core/authority/ids';
import { authorityAccountActivationMemberships } from '@poa-box/core/reads/authority';
import { electorateActivationFacts } from '@poa-box/core/authority/activation';
import { knownFact } from '@poa-box/core/data/facts';
import { authoritySubjectRows, observeAuthority, createAuthorityObservationStore } from '@/lib/accessV2/authorityEvidence';
import { normalizeAuthoritySubjects } from '@/lib/accessV2/normalize';

const authority = `0x${'11'.repeat(20)}`;
const user = `0x${'22'.repeat(20)}`;
const orgId = `0x${'33'.repeat(32)}`;
const scope = { chainId: 100, orgId, endpoint: 'https://indexed.example', contract: authority };
const block = { number: 123, hash: `0x${'44'.repeat(32)}` };
const role = composeSubjectId(authority, '1');
const group = composeSubjectId(authority, '2');
const subject = (id, kind) => ({ id, subjectId: id, kind, name: kind, defaultAllow: true,
  maxMembers: '0', memberCount: kind === 'Role' ? '1' : '0', activeMemberCount: kind === 'Role' ? '1' : '0',
  vouchConfig: null, managerConfig: null, createdAt: '1' });
function clientFixture({ signedCap = false, missingMeta = false, pageFailure = false } = {}) {
  const collections = {
    subjects: [subject(role, 'Role'), subject(group, 'Group')],
    groupCompositions: [{ id: 'edge', roleSubjectId: role, groupSubjectId: group, isActive: true }],
    subjectMemberships: [{ id: 'membership', user, accepted: true, acceptedAt: '1000', seededWhilePaused: true,
      ruleKind: 'None', rule: null, pendingAction: null, emailVerified: false, vouchCount: '0', vouchEpoch: '0',
      subject: { subjectId: role } }],
    permRows: [], pendingActions: [], subjectVouchRecords: [], accessRules: [],
  };
  if (signedCap) collections.subjects[0].maxMembers = '-1';
  for (const rows of Object.values(collections)) rows.sort((a, b) => a.id < b.id ? -1 : 1);
  return { query: vi.fn(async ({ query, variables }) => {
    const name = query.definitions.find(def => def.kind === 'OperationDefinition').name.value;
    if (name === 'AuthorityObservationHead') return { data: { _meta: { block } } };
    if (name === 'AuthorityTaskBindings') return { data: { _meta: { block }, organization: { id: orgId,
      executorContract: { id: authority }, taskManager: { id: `0x${'55'.repeat(20)}`, creatorHatIds: [role] } } } };
    if (name === 'AuthorityState') return { data: { _meta: { block }, organization: { id: orgId,
      membershipAuthority: { id: authority, isRouterBound: true, cutoverAt: '1', paused: false,
        subjectCount: 2, roleSubjectCount: 1, groupSubjectCount: 1, acceptedMembershipCount: 1 } } } };
    const field = query.definitions[0].selectionSet.selections.find(node => node.name.value !== '_meta').name.value;
    if (pageFailure && field === 'subjectMemberships') throw new Error('mock outage');
    const rows = collections[field].filter(row => row.id > variables.lastId).slice(0, variables.first);
    return { data: { ...(missingMeta ? {} : { _meta: { block } }), [field]: rows } };
  }) };
}

describe('host authority observation with actual core reader', () => {
  it('paginates every flat collection including terminal pages, keeping groups and seeded activation', async () => {
    const client = clientFixture();
    const snapshot = await observeAuthority({ client, scope, pageSize: 1, now: () => 2000 });
    expect(snapshot.coverage.status).toBe('complete');
    expect(snapshot.source.block).toEqual({ number: '123', hash: block.hash });
    expect(snapshot.data.collections.subjects.coverage.pages).toBe(3);
    const normalized = normalizeAuthoritySubjects(authoritySubjectRows(snapshot), { snapshot, scope });
    expect(normalized.groups[0].memberRoleIds).toEqual([role]);
    const facts = electorateActivationFacts({ scope: { ...scope, account: user }, authority: snapshot,
      memberships: authorityAccountActivationMemberships(snapshot, user), restrictions: knownFact([group]), proposalCreatedAt: knownFact('2') });
    expect(facts.canVote).toMatchObject({ state: 'known', value: true });
    expect(facts.activeSince).toMatchObject({ state: 'known', value: '1' });
    expect(client.query.mock.calls.every(([request]) => request.fetchPolicy === 'network-only')).toBe(true);
  });
  it.each([{ missingMeta: true }, { pageFailure: true }])('retains incomplete evidence for %j', async options => {
    const snapshot = await observeAuthority({ client: clientFixture(options), scope, pageSize: 1 });
    expect(snapshot.coverage.status).not.toBe('complete');
    const facts = electorateActivationFacts({ scope: { ...scope, account: user }, authority: snapshot,
      memberships: authorityAccountActivationMemberships(snapshot, user), restrictions: knownFact([group]), proposalCreatedAt: knownFact('2') });
    expect(facts.canVote.state).toBe('unknown');
  });
  it('decodes adopted signed unlimited caps without losing complete authority coverage', async () => {
    const snapshot = await observeAuthority({ client: clientFixture({ signedCap: true }), scope, pageSize: 1 });
    expect(snapshot.coverage.status).toBe('complete');
    expect(snapshot.data.subjects.find(row => row.subjectId === role).maxMembers).toBe('4294967295');
    expect(snapshot.data.collections.subjects.data.find(row => row.subjectId === role).maxMembers).toBe('-1');
  });
  it('can join a caller-selected indexed block only when every response proves it', async () => {
    const client = clientFixture();
    const snapshot = await observeAuthority({ client, scope, block: { number: '123', hash: block.hash } });
    expect(snapshot.coverage.status).toBe('complete');
    expect(client.query.mock.calls.some(([request]) => request.query.definitions[0].name.value === 'AuthorityObservationHead')).toBe(false);
    const mismatched = await observeAuthority({ client, scope, block: { number: '124', hash: block.hash } });
    expect(mismatched.coverage.status).not.toBe('complete');
  });
  it('shares an in-flight observation and withdraws prior evidence during refresh or outage', async () => {
    let resolve;
    const read = vi.fn(() => new Promise(done => { resolve = done; }));
    const store = createAuthorityObservationStore(read);
    const first = store.refresh();
    expect(store.refresh()).toBe(first);
    await Promise.resolve();
    resolve({ coverage: { status: 'complete' }, data: {} });
    await first;
    expect(store.getSnapshot().snapshot).toBeTruthy();
    read.mockRejectedValueOnce(new Error('mock transport detail'));
    const next = store.refresh();
    expect(store.getSnapshot().snapshot).toBeNull();
    await expect(next).rejects.toThrow('Membership information could not be verified');
    expect(store.getSnapshot().snapshot).toBeNull();
    expect(store.getSnapshot().error.message).not.toContain('transport detail');
  });
});
