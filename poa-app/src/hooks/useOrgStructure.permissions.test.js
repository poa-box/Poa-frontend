import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { composeSubjectId } from '@poa-box/core/authority/ids';
import { useOrgStructure } from '@/hooks/useOrgStructure';

const state = vi.hoisted(() => ({ context: {}, observation: {}, organization: null, client: {} }));
vi.mock('@apollo/client', async original => ({ ...await original(), useQuery: (_query, options) => {
  expect(options.client).toBe(state.client);
  return { data: { organization: state.organization }, loading: false, refetch: vi.fn() };
} }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => state.context }));
vi.mock('@/context/ipfsContext', () => ({ useIPFScontext: () => ({}) }));
vi.mock('@/context/RefreshContext', () => ({ RefreshEvent: {}, useRefreshSubscription() {} }));
vi.mock('@/util/apolloClient', () => ({ useSubgraphClient: endpoint => {
  expect(endpoint).toBe(state.context.subgraphUrl); return state.client;
} }));
vi.mock('@/hooks/accessV2/useAuthorityEvidence', () => ({ useAuthorityEvidence: () => state.observation }));

const authority = `0x${'11'.repeat(20)}`;
const role = composeSubjectId(authority, '1');
const orgId = `0x${'22'.repeat(32)}`;
const endpoint = 'https://offline.example';
const scope = { chainId: 100, orgId, contract: authority, endpoint };
function observe() {
  let value;
  function Consumer() { value = useOrgStructure(); return null; }
  renderToStaticMarkup(React.createElement(Consumer));
  return value;
}
function setup({ defaultAllow = true, vouchConfig = null, memberHatIds = [role] } = {}) {
  state.context = { orgId, orgChainId: 100, subgraphUrl: endpoint, roleHatIds: [role], tokenLabel: 'MiXeD' };
  state.organization = { id: orgId, quickJoin: { memberHatIds }, users: [], roles: [{ id: 'historical', hatId: role,
    name: 'Members', canVote: true, permissions: [{ permissionRole: 'Creator', allowed: true }],
    hat: { defaultEligible: !defaultAllow, vouchConfig: { enabled: false } } }],
    hatPermissions: [{ hatId: role, contractType: 'EducationHub', permissionRole: 'Creator', allowed: true }],
    taskManager: { creatorHatIds: [role], globalRolePermissions: [{ hatId: role, canCreate: true }] } };
  const subject = { subjectId: role, kind: 'Role', name: 'Members', defaultAllow, vouchConfig,
    raw: { id: 'native', defaultAllow, vouchConfig } };
  state.observation = { scope, complete: true, loading: false, error: null,
    snapshot: { source: { ...scope, method: 'authority-snapshot', indexed: true, snapshot: 'pinned', block: { number: '123' } },
      coverage: { status: 'complete', receivedKeys: [], missingIds: [], failedIds: [], issues: [] },
      data: { subjects: [subject], groupEdges: [], permissions: [], rules: [] } } };
}

describe('useOrgStructure current display integration', () => {
  it.each([null, 0, 11])('uses the shared complete member count %s instead of the role/user windows', count => {
    setup(); state.context.poMembers = count;
    expect(observe().totalMembers).toBe(count);
  });
  it('ignores cached historical grants and preserves native defaultAllow and configured QuickJoin membership', () => {
    setup();
    const value = observe();
    expect(value.permissionsMatrix[role].EducationHub_Creator).toBe(false);
    expect(value.permissionsMatrix[role].TaskManager_Create).toBe(false);
    expect(value.permissionsMatrix[role].TaskManager_CreateProject).toBeNull();
    expect(value.roles[0]).toMatchObject({ defaultEligible: true, openKnown: true, vouchingKnown: true,
      vouchingEnabled: false, isQuickJoinEligible: true, canVote: null, permissions: [] });
    expect(value.permissionColumns.find(column => column.key === 'ParticipationToken_Member').label).toBe('MiXeD - Hold');
  });

  it('keeps native vouching requirements and a missing QuickJoin list distinct from an open role', () => {
    setup({ defaultAllow: false, vouchConfig: { quorum: '3', voucherSubjectId: role } });
    expect(observe().roles[0]).toMatchObject({ defaultEligible: false, vouchingEnabled: true,
      vouchingQuorum: '3', isQuickJoinEligible: false });
    setup(); delete state.organization.quickJoin.memberHatIds;
    expect(observe().roles[0].isQuickJoinEligible).toBeNull();
  });

  it('revokes prior positive permission facts on an authority refresh failure', () => {
    setup(); state.observation.error = new Error('mock unavailable');
    const value = observe();
    expect(value.permissionsMatrix[role].EducationHub_Creator).toBeNull();
    expect(value.roles[0]).toMatchObject({ defaultEligible: null, openKnown: false, vouchingKnown: false, isQuickJoinEligible: null });
  });
});
