import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useMyMemberships } from '@/hooks/accessV2/useAuthorityMemberships';
import { useAuthorityPermission } from '@/hooks/useAuthorityPermission';
import { ALICE, BOB, AUTHORITY_ADDRESS, MEMBERS_ID, aliceMembership, carolOffer } from '@/lib/accessV2/fixtures';
import { PERM_KEYS } from '@/lib/accessV2/permKeys';

const state = vi.hoisted(() => ({ auth: null, authority: null, result: null, queryOptions: null, value: null, permission: null, override: undefined }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => ({ subgraphUrl: 'https://example.test' }) }));
vi.mock('@/context/authState', () => ({ useAuth: () => state.auth }));
vi.mock('@/util/apolloClient', () => ({ useSubgraphClient: () => ({}) }));
vi.mock('@/context/RefreshContext', () => ({ RefreshEvent: {}, useRefreshSubscription() {} }));
vi.mock('@/hooks/accessV2/useOrgAuthority', () => ({ useOrgAuthority: () => state.authority }));
vi.mock('@/hooks/accessV2/useAuthorityEvidence', () => ({ useAuthorityEvidence: () => {
  const scope = { chainId: 100, orgId: 'org', endpoint: 'https://example.test', contract: state.authority.address };
  const source = { ...scope, contract: state.result.variables.authority, account: state.result.variables.user,
    method: 'authority-snapshot', indexed: true, snapshot: 'pinned', block: { number: '1' } };
  state.queryOptions = { skip: !state.authority.enabled || state.authority.loading || !!state.authority.error };
  return { scope, authority: state.authority, enabled: state.authority.enabled,
    error: state.result.error, loading: state.result.loading, refetch() {},
    snapshot: { source, coverage: { status: 'complete', receivedKeys: [], failedIds: [], missingIds: [], issues: [] },
      data: { memberships: state.result.data.subjectMemberships.map(row => ({ ...row, subject: { ...row.subject, vouchConfig: null } })), subjects: [{ subjectId: MEMBERS_ID, kind: 'Role' }], groupEdges: [], permissions: [] } } };
} }));
vi.mock('@/hooks/accessV2/useAuthoritySubjects', () => ({ useAuthoritySubjects: () => ({
  authority: state.authority, enabled: state.authority.enabled,
  roles: [{ subjectId: MEMBERS_ID, permEffective: () => '1' }],
}) }));

function Probe() {
  state.value = useMyMemberships(state.override);
  state.permission = useAuthorityPermission(PERM_KEYS.PT_APPROVE);
  return null;
}
const render = () => renderToStaticMarkup(<Probe />);

beforeEach(() => {
  state.auth = { accountAddress: ALICE, isAuthenticated: true, isAuthHydrated: true };
  state.authority = { address: AUTHORITY_ADDRESS, enabled: true, loading: false, error: null };
  state.result = {
    variables: { authority: AUTHORITY_ADDRESS, user: ALICE }, loading: false, error: null,
    data: { subjectMemberships: [aliceMembership({ authority: { id: AUTHORITY_ADDRESS } })] },
  };
  state.override = undefined;
});

describe('current membership scope across account runtime changes', () => {
  it('keeps current accepted history and permission grants intact', () => {
    render();
    expect(state.value.myRoles.map(row => row.subjectId)).toEqual([MEMBERS_ID]);
    expect(state.value.rows[0].acceptedAt).toBe(1750000100);
    expect(state.permission.allowed).toBe(true);
  });

  it.each([
    ['unresolved identity', () => { state.auth.isAuthHydrated = false; }],
    ['disconnect', () => { state.auth.accountAddress = null; state.auth.isAuthenticated = false; }],
    ['disabled authority', () => { state.authority.enabled = false; }],
    ['authority loading', () => { state.authority.loading = true; }],
    ['authority error', () => { state.authority.error = new Error('offline'); }],
    ['membership error', () => { state.result.error = new Error('offline'); }],
    ['account switch with old query variables', () => { state.auth.accountAddress = BOB; }],
    ['account switch with updated query variables but old rows', () => { state.auth.accountAddress = BOB; state.result.variables.user = BOB; }],
    ['authority switch with old query variables', () => { state.authority.address = '0x' + '2'.repeat(40); }],
    ['authority switch with updated query variables but old rows', () => { state.authority.address = '0x' + '2'.repeat(40); state.result.variables.authority = state.authority.address; }],
    ['unverified old cache without source authority', () => { state.result.variables.authority = undefined; }],
  ])('discards retained grants on %s', (_label, change) => {
    change(); render();
    if (!state.authority.enabled || state.authority.loading || state.authority.error) {
      expect(state.queryOptions.skip).toBe(true);
    }
    expect(state.value.rows).toEqual([]);
    expect(state.value.myRoles).toEqual([]);
    expect(state.value.claimable).toEqual([]);
    expect(state.value.isMemberOf(MEMBERS_ID)).toBe(false);
    expect(state.permission.allowed).toBe(false);
  });

  it('does not retain claimable actions while identity is unresolved', () => {
    state.result.data.subjectMemberships = [carolOffer({ user: ALICE, authority: { id: AUTHORITY_ADDRESS } })];
    state.auth.isAuthHydrated = false;
    render();
    expect(state.value.claimable).toEqual([]);
    expect(state.value.loading).toBe(true);
    expect(state.value.activationEvidence).toBeNull();
  });

  it('keeps an invalid public account separate from the connected viewer’s current grants', () => {
    state.override = 'not-an-address';
    render();
    expect(state.value.rows).toEqual([]);
    expect(state.value.activationEvidence).toBeNull();
    expect(state.permission.allowed).toBe(true);
  });

  it('allows explicit public membership reads without granting the disconnected viewer permissions', () => {
    state.override = ALICE;
    state.auth = { accountAddress: null, isAuthenticated: false, isAuthHydrated: true };
    render();
    expect(state.value.myRoles.map(row => row.subjectId)).toEqual([MEMBERS_ID]);
    expect(state.permission.allowed).toBe(false);
  });
});
