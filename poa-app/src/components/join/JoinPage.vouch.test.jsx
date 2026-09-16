import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import JoinPage from '@/components/join/JoinPage';
import SubjectVouchPanel from '@/components/accessV2/SubjectVouchPanel';
import { PERM_KEYS } from '@/lib/accessV2/permKeys';

const state = vi.hoisted(() => ({
  viewer: '0x' + 'a'.repeat(40),
  query: {}, actions: [], vouch: null, revoke: null, viewerHasVouched: false, username: null,
  authenticated: true, hydrated: true, roles: [], authority: {}, states: {}, loading: false, error: null,
  claim: null, refetch: null, connect: null, share: null, push: null, quickJoin: null, ready: true,
  inviteStatus: 'absent', inviteRefresh: null, passkeyProps: null, solidarityProps: null,
}));
vi.mock('@chakra-ui/react', async () => (await import('@/test/mockChakra')).mockChakra(state.actions));
vi.mock('next/router', () => ({ useRouter: () => ({ query: state.query, push: state.push }) }));
vi.mock('next/link', () => ({ default: ({ children }) => children }));
vi.mock('@/context/authState', () => ({ useAuth: () => ({ isAuthenticated: state.authenticated, isAuthHydrated: state.hydrated, accountAddress: state.authenticated ? state.viewer : null }) }));
vi.mock('@/context/WalletContext', () => ({ useWalletUI: () => ({ openConnectModal: state.connect, preloadRuntime: vi.fn() }), useWalletRuntimeControl: () => ({ runtimeError: null }) }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => ({ orgName: 'Test6', quickJoinContractAddress: '0x' + '1'.repeat(40) }) }));
vi.mock('@/context/UserContext', () => ({ useUserContext: () => ({ graphUsername: 'alice' }) }));
vi.mock('@/context/IdentityContext', () => ({ useIdentity: () => ({ username: state.username }) }));
vi.mock('@/hooks/useIpfsImage', () => ({ default: () => null }));
vi.mock('@/hooks/useWeb3Services', () => ({ useWeb3: () => ({ organization: { quickJoinWithUser: state.quickJoin }, isReady: state.ready, executeWithNotification: fn => fn() }) }));
vi.mock('@/hooks/useZkEmailInviteSummary', () => ({ useZkEmailInviteSummary: () => ({ status: state.inviteStatus, refresh: state.inviteRefresh }) }));
vi.mock('@/util/shortLinks', () => ({ shareUrl: (...args) => state.share(...args) }));
vi.mock('@/components/shared/useOnboardingColors', () => ({ default: () => ({ ink: 'black', muted: 'gray', line: 'gray', primary: 'purple', surface: 'white' }) }));
vi.mock('@/hooks/useAuthorityJoinRoles', () => ({ useAuthorityJoinRoles: () => ({
  roles: state.roles, authority: state.authority, loading: state.loading, error: state.error,
  states: state.states, refetch: state.refetch,
}) }));
vi.mock('@/hooks/accessV2', () => ({
  useAuthorityActions: () => ({ claim: state.claim, vouch: state.vouch, revokeVouch: state.revoke, isBusy: () => false }),
  useSubjectVouches: () => ({
    config: { enabled: true, quorum: 1 }, records: [],
    progress: { count: 0, quorum: 1, met: false, stale: 0 }, progressCopy: '0 of 1 vouches',
    vouchGate: { can: true }, viewerHasVouched: state.viewerHasVouched, enabled: true,
    refetch: vi.fn(), subject: { name: 'Delegates' },
  }),
}));
vi.mock('@/components/shared/OrgDeadEnd', () => ({ useOrgGate: () => null }));
vi.mock('@/components/common/SEOHead', () => ({ default: () => null }));
vi.mock('@/templateComponents/studentOrgDAO/NavBar', () => ({ default: () => null }));
vi.mock('@/components/common/AccountControl', () => ({ default: () => 'Signed in as Alice' }));
vi.mock('@/components/passkey/SignInModal', () => ({ default: () => null }));
vi.mock('@/components/passkey/SolidarityOnboardingModal', () => ({ default: props => { state.solidarityProps = props; return null; } }));
vi.mock('@/components/passkey/PasskeyOnboardingModal', () => ({ default: props => { state.passkeyProps = props; return null; } }));
vi.mock('@/components/account/SignupModal', () => ({ default: () => null }));
vi.mock('@/components/zkEmail/EmailInviteCard', () => ({ default: () => null }));
vi.mock('@/components/shared/PulseLoader', () => ({ default: () => null }));

describe('shared vouch links identify the authority action recipient', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    state.query = {};
    state.actions.length = 0;
    state.vouch = vi.fn().mockResolvedValue({ success: true });
    state.revoke = vi.fn().mockResolvedValue({ success: true });
    state.viewerHasVouched = false;
    state.username = null;
    state.authenticated = true;
    state.hydrated = true;
    state.roles = [{ subjectId: '123', name: 'Delegates', vouchConfig: { quorum: 1, enabled: true } }];
    state.authority = { enabled: true, paused: false, loading: false };
    state.states = { 123: { reason: 3 } };
    state.loading = false;
    state.error = null;
    state.ready = true;
    state.inviteStatus = 'absent';
    state.claim = vi.fn().mockResolvedValue({ success: true });
    state.refetch = vi.fn();
    state.connect = vi.fn().mockResolvedValue(undefined);
    state.share = vi.fn().mockResolvedValue('https://poa.box/join/?short-code&a=target&h=role');
    state.push = vi.fn();
    state.quickJoin = vi.fn().mockResolvedValue({ success: true });
    state.inviteRefresh = vi.fn();
    state.passkeyProps = null;
    state.solidarityProps = null;
  });
  const button = label => {
    const action = state.actions.find(candidate => (Array.isArray(candidate.children) ? candidate.children.join('') : candidate.children) === label);
    expect(action).toBeDefined();
    expect(action.isDisabled).toBeFalsy();
    return action;
  };

  it.each([
    ['subjectId', '0x' + 'b'.repeat(40), 'bob'],
    ['hatId', '0x' + 'Ab'.repeat(20), null],
  ])('shows the exact recipient before vouching through a %s link', async (key, target, username) => {
    state.query = { [key]: '123', vouch: target };
    state.username = username;
    const html = renderToStaticMarkup(React.createElement(JoinPage));
    expect(target.toLowerCase()).not.toBe(state.viewer);
    expect(html).toContain('Vouching for');
    expect(html).toContain(target);
    if (username) expect(html).toContain(username);
    expect(html.indexOf(target)).toBeLessThan(html.indexOf('Vouch for them'));
    await button('Vouch for them').onClick();
    expect(state.vouch).toHaveBeenCalledWith('123', target);
  });

  it('shows the viewer as recipient when checking their own vouches', () => {
    const html = renderToStaticMarkup(React.createElement(JoinPage));
    expect(html).toContain(state.viewer);
    expect(html).toContain('Vouching for');
  });

  it('keeps recipient identity on the shared panel when revoking from another caller', async () => {
    const target = '0x' + 'c'.repeat(40);
    state.viewerHasVouched = true;
    const html = renderToStaticMarkup(React.createElement(SubjectVouchPanel, { subjectId: '456', user: target }));
    expect(html).toContain(target);
    expect(html.indexOf(target)).toBeLessThan(html.indexOf('Take back my vouch'));
    await button('Take back my vouch').onClick();
    expect(state.revoke).toHaveBeenCalledWith('456', target);
    expect(state.vouch).not.toHaveBeenCalled();
  });

  it.each([true, false])('withholds account and membership actions until identity is hydrated (authenticated=%s)', authenticated => {
    state.hydrated = false;
    state.authenticated = authenticated;
    state.query = { subjectId: '123', vouch: '0x' + 'b'.repeat(40) };
    const html = renderToStaticMarkup(React.createElement(JoinPage));
    expect(html).toContain('Getting your account ready');
    expect(html).not.toContain('Create account');
    expect(html).not.toContain('Vouch for them');
    expect(html).not.toContain('Choose a role');
  });

  it.each(['loading', 'disabled', 'error'])('withholds membership controls when authority is %s', condition => {
    if (condition === 'loading') state.authority.loading = true;
    if (condition === 'disabled') state.authority.enabled = false;
    if (condition === 'error') state.error = new Error('Unavailable');
    const html = renderToStaticMarkup(React.createElement(JoinPage));
    expect(html).not.toContain('Choose a role');
    expect(html).not.toContain('Vouch for them');
    expect(html).toContain(condition === 'loading' ? 'Loading membership options' : 'Membership options unavailable');
  });

  it('claims a preflight-approved role through the authority callback', async () => {
    state.states = { 123: { reason: 0 } };
    renderToStaticMarkup(React.createElement(JoinPage));
    await button('Join Delegates').onClick();
    expect(state.claim).toHaveBeenCalledWith('123', 'Delegates');
    expect(state.refetch).toHaveBeenCalledOnce();
  });

  it.each(['paused', 'unknown', 'denied'])('does not submit a role claim when %s, even if its handler is invoked', async condition => {
    state.states = { 123: { reason: 0 } };
    if (condition === 'paused') state.authority.paused = true;
    if (condition === 'unknown') state.states = {};
    if (condition === 'denied') state.states = { 123: { reason: 1 } };
    renderToStaticMarkup(React.createElement(JoinPage));
    const action = state.actions.find(candidate => Array.isArray(candidate.children) && candidate.children.join('') === 'Join Delegates');
    expect(action.isDisabled).toBeTruthy();
    await action.onClick();
    expect(state.claim).not.toHaveBeenCalled();
  });

  it('keeps mixed auto-join and vouched roles available and uses configured authority ids for onboarding', async () => {
    state.roles.push({ subjectId: '456', name: 'Member', permEffective: key => key === PERM_KEYS.QJ_AUTOJOIN ? 1n : 0n });
    state.states[456] = { reason: 0 };
    const html = renderToStaticMarkup(React.createElement(JoinPage));
    expect(html).toContain('Delegates');
    expect(state.passkeyProps).toMatchObject({ variant: 'join', showWalletOption: true, paymasterHatId: '456' });
    expect(state.solidarityProps).toBeNull();
    await button('Join organization').onClick();
    expect(state.quickJoin).toHaveBeenCalledWith('0x' + '1'.repeat(40), { paymasterHatIds: ['456'] });
  });

  it('uses shared account creation for a native open role without auto-join configuration', async () => {
    state.authenticated = false;
    state.roles = [{ subjectId: '789', name: 'Open role', defaultAllow: true }];
    const html = renderToStaticMarkup(React.createElement(JoinPage));
    expect(html).toContain('Your community.');
    expect(html).toContain('Create account');
    expect(state.solidarityProps).not.toBeNull();
    expect(state.passkeyProps).toBeNull();
    await button('Use a wallet instead').onClick();
    expect(state.connect).toHaveBeenCalledOnce();
    expect(state.connect.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
  });

  it.each(['active', 'degraded'])('honors %s email invitations without advertising direct signup', async status => {
    state.authenticated = false;
    state.roles = [{ subjectId: '789', name: 'Invited role', defaultAllow: false }];
    state.inviteStatus = status;
    const html = renderToStaticMarkup(React.createElement(JoinPage));
    expect(html).toContain('Join Test6 by email');
    expect(html).not.toContain('Create account');
    await button('Continue with email').onClick();
    expect(state.push).toHaveBeenCalledWith('/claim/?org=Test6');
  });

  it.each(['absent', 'dormant', 'loading', 'unknown'])('does not advertise an email claim when invitations are %s', status => {
    state.authenticated = false;
    state.roles = [];
    state.inviteStatus = status;
    const html = renderToStaticMarkup(React.createElement(JoinPage));
    expect(html).not.toContain('Continue with email');
    expect(html).not.toContain('Create account');
  });

  it('copies a short vouch link with the same authority subject and resolved account', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    renderToStaticMarkup(React.createElement(JoinPage));
    await button('Copy your vouch link').onClick();
    expect(state.share).toHaveBeenCalledWith('/join/', { org: 'Test6', hatId: '123', vouch: state.viewer });
    expect(writeText).toHaveBeenCalledWith('https://poa.box/join/?short-code&a=target&h=role');
  });
});
