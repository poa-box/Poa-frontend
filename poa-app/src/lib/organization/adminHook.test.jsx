import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIsOrgAdmin } from '@/hooks/useIsOrgAdmin';

const fixture = vi.hoisted(() => ({ user: null, org: null, hydrated: true, result: null }));
vi.mock('@/context/UserContext', () => ({ useUserContext: () => fixture.user }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => fixture.org }));
vi.mock('@/context/authState', () => ({ useAuth: () => ({ isAuthHydrated: fixture.hydrated }) }));
const account = '0x1111111111111111111111111111111111111111';
function Viewer({ orgId = 'current-org', address = account }) {
  fixture.result = useIsOrgAdmin(orgId, address);
  return null;
}
beforeEach(() => {
  fixture.hydrated = true;
  fixture.org = { orgId: 'current-org', topHatId: '9007199254740993', metadataAdminHatId: '0', poContextLoading: false };
  fixture.user = { address: account, userDataLoading: false, userData: { id: 'current-user', hatIds: ['0x20000000000001'] }, error: null };
});

describe('metadata admin context boundary', () => {
  it('uses current exact subject IDs for an explicit zero override', () => {
    renderToStaticMarkup(<Viewer />);
    expect(fixture.result).toEqual({ isAdmin: true, loading: false, error: null });
  });
  it.each([
    ['pending auth', () => { fixture.hydrated = false; }],
    ['pending member state', () => { fixture.user.userDataLoading = true; }],
    ['unknown admin subject', () => { fixture.org.metadataAdminHatIdKnown = false; }],
    ['unknown current memberships', () => { fixture.user.userData.hatIdsKnown = false; }],
    ['previous account', () => { fixture.user.address = '0x2222222222222222222222222222222222222222'; }],
    ['previous organization', () => { fixture.org.orgId = 'old-org'; }],
  ])('withholds access while %s is unresolved', (_label, mutate) => {
    mutate(); renderToStaticMarkup(<Viewer />);
    expect(fixture.result).toEqual({ isAdmin: false, loading: true, error: null });
  });
  it('shows a resolved nonmember result and retains upstream read errors', () => {
    fixture.user.userData = {};
    renderToStaticMarkup(<Viewer />);
    expect(fixture.result).toEqual({ isAdmin: false, loading: false, error: null });
    fixture.user.error = { message: 'Read unavailable' };
    renderToStaticMarkup(<Viewer />);
    expect(fixture.result.error).toBe(fixture.user.error);
    expect(fixture.result.isAdmin).toBe(false);
  });
});
