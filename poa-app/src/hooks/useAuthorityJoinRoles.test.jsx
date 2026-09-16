import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthorityJoinRoles } from '@/hooks/useAuthorityJoinRoles';
import { ALICE, AUTHORITY_ADDRESS, MEMBERS_ID, ORG_ID, authorityNode, membersSubject } from '@/lib/accessV2/fixtures';

const state = vi.hoisted(() => ({ authority: null, subjects: null, options: {}, value: null }));
vi.mock('@apollo/client', async importOriginal => ({
  ...await importOriginal(),
  useQuery: (document, options) => {
    const name = document.definitions.find(definition => definition.kind === 'OperationDefinition')?.name?.value;
    state.options[name] = options;
    if (name === 'FetchOrgAuthority') return state.authority;
    if (name === 'FetchAuthoritySubjects') return state.subjects;
    throw new Error(`Unexpected query: ${name}`);
  },
}));
vi.mock('@/context/POContext', () => ({ usePOContext: () => ({ orgId: ORG_ID, subgraphUrl: 'https://example.test' }) }));
vi.mock('@/context/authState', () => ({ useAuth: () => ({ accountAddress: ALICE, isAuthHydrated: true }) }));
vi.mock('@/util/apolloClient', () => ({ useSubgraphClient: () => ({}) }));
vi.mock('@/context/RefreshContext', () => ({ RefreshEvent: {}, useRefreshSubscription() {} }));
vi.mock('@/hooks/accessV2/useSubgraphCapability', () => ({ useSubgraphCapabilityState: () => ({ supported: true, loading: false }) }));
vi.mock('@/hooks/useWeb3Services', () => ({ useWeb3Services: () => ({ membershipAuthority: null }) }));

function Probe() {
  state.value = useAuthorityJoinRoles();
  return null;
}
const render = () => renderToStaticMarkup(<Probe />);

beforeEach(() => {
  state.options = {};
  state.authority = {
    data: { organization: { id: ORG_ID, membershipAuthority: authorityNode() } },
    loading: false,
    error: null,
    refetch: vi.fn(async () => { state.authority.error = null; }),
  };
  state.subjects = {
    data: { membershipAuthorityContract: { id: AUTHORITY_ADDRESS, subjects: [membersSubject()] } },
    loading: false,
    error: null,
    refetch: vi.fn(async () => { state.subjects.error = null; }),
  };
});

describe('Join retry refreshes the real authority and subject hooks', () => {
  it('recovers a failed subjects query through the returned retry callback', async () => {
    state.subjects.error = new Error('Subjects temporarily unavailable');
    render();
    expect(state.value.error).toBe(state.subjects.error);
    expect(state.value.roles).toEqual([]);

    await state.value.refetch();
    expect(state.authority.refetch).toHaveBeenCalledOnce();
    expect(state.subjects.refetch).toHaveBeenCalledOnce();
    render();
    expect(state.value.error).toBeNull();
    expect(state.value.roles.map(role => role.subjectId)).toEqual([MEMBERS_ID]);
  });

  it('recovers authority discovery without manually running its skipped subjects query', async () => {
    state.authority.error = new Error('Authority temporarily unavailable');
    render();
    expect(state.value.authority.error).toBe(state.authority.error);
    expect(state.value.authority.address).toBeNull();
    expect(state.options.FetchAuthoritySubjects.skip).toBe(true);

    await state.value.refetch();
    expect(state.authority.refetch).toHaveBeenCalledOnce();
    expect(state.subjects.refetch).not.toHaveBeenCalled();
    render();
    expect(state.value.authority.enabled).toBe(true);
    expect(state.value.authority.error).toBeNull();
    expect(state.options.FetchAuthoritySubjects).toMatchObject({ skip: false, variables: { authority: AUTHORITY_ADDRESS } });
    expect(state.value.roles.map(role => role.subjectId)).toEqual([MEMBERS_ID]);
  });

  it('keeps a not-yet-bound authority subject query skipped during retry', async () => {
    state.authority.data.organization.membershipAuthority = authorityNode({ isRouterBound: false });
    render();
    await state.value.refetch();
    expect(state.authority.refetch).toHaveBeenCalledOnce();
    expect(state.subjects.refetch).not.toHaveBeenCalled();
    expect(state.options.FetchAuthoritySubjects.skip).toBe(true);
    expect(state.value.roles).toEqual([]);
  });

  it('settles repeated network failures and leaves the join gate closed', async () => {
    state.subjects.error = new Error('Still offline');
    state.authority.refetch.mockRejectedValue(new Error('Authority offline'));
    state.subjects.refetch.mockRejectedValue(state.subjects.error);
    render();
    await expect(state.value.refetch()).resolves.toBeUndefined();
    expect(state.authority.refetch).toHaveBeenCalledOnce();
    expect(state.subjects.refetch).toHaveBeenCalledOnce();
    render();
    expect(state.value.error).toBe(state.subjects.error);
    expect(state.value.roles).toEqual([]);
  });
});
