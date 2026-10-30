import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createParityHost } from '@/test/parityHost';
const f = vi.hoisted(() => ({ roles: [], snapshot: null, authenticated: false, states: {}, refetch: vi.fn(), claim: vi.fn(), quickJoin: vi.fn(), share: vi.fn(), push: vi.fn(), account: `0x${'33'.repeat(20)}`, solidarity: null, atomic: null }));
vi.mock('@chakra-ui/react', async () => (await import('@/test/parityHost')).parityChakra());
vi.mock('@/components/shared/useOnboardingColors', () => ({ default: () => ({ ink: 'black', muted: 'gray', line: 'gray', primary: 'purple', surface: 'white' }) }));
vi.mock('next/router', () => ({ useRouter: () => ({ query: {}, push: f.push }) }));
vi.mock('@/context/authState', () => ({ useAuth: () => ({ isAuthHydrated: true, isAuthenticated: f.authenticated, accountAddress: f.authenticated ? f.account : null }) }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => ({ orgName: 'Any community', quickJoinContractAddress: `0x${'11'.repeat(20)}` }) }));
vi.mock('@/context/UserContext', () => ({ useUserContext: () => ({ graphUsername: f.authenticated ? 'fresh_user' : null }) }));
vi.mock('@/context/WalletContext', () => ({ useWalletUI: () => ({ openConnectModal: vi.fn() }) }));
vi.mock('@/hooks/useIpfsImage', () => ({ default: () => null }));
vi.mock('@/hooks/useWeb3Services', () => ({ useWeb3: () => ({ organization: { quickJoinWithUser: f.quickJoin }, isReady: true, executeWithNotification: fn => fn() }) }));
vi.mock('@/hooks/useZkEmailInviteSummary', () => ({ useZkEmailInviteSummary: () => ({ status: 'absent' }) }));
vi.mock('@/hooks/useAuthorityJoinRoles', () => ({ useAuthorityJoinRoles: () => ({ roles: f.roles, snapshot: f.snapshot, states: f.states, authority: { enabled: true, paused: false }, refetch: f.refetch }) }));
vi.mock('@/hooks/accessV2', () => ({ useAuthorityActions: () => ({ claim: f.claim, isBusy: () => false }) }));
vi.mock('@/components/accessV2/SubjectVouchPanel', () => ({ default: ({ user }) => <span>Vouch target: {user}</span> }));
vi.mock('@/components/shared/OrgDeadEnd', () => ({ useOrgGate: () => null }));
vi.mock('@/components/common/SEOHead', () => ({ default: () => null }));
vi.mock('@/templateComponents/studentOrgDAO/NavBar', () => ({ default: () => null }));
vi.mock('@/components/common/AccountControl', () => ({ default: () => <span>Account</span> }));
vi.mock('@/components/common/WalletActionButton', () => ({ default: ({ children }) => <button>{children}</button> }));
vi.mock('@/components/passkey/SignInModal', () => ({ default: () => null }));
vi.mock('@/components/passkey/SolidarityOnboardingModal', () => ({ default: props => { f.solidarity = props; return props.isOpen ? <span>Account-only creation</span> : null; } }));
vi.mock('@/components/passkey/PasskeyOnboardingModal', () => ({ default: props => { f.atomic = props; return props.isOpen ? <span>Atomic account and membership</span> : null; } }));
vi.mock('@/components/account/SignupModal', () => ({ default: () => null }));
vi.mock('@/components/zkEmail/EmailInviteCard', () => ({ default: () => null }));
vi.mock('@/components/shared/PulseLoader', () => ({ default: () => null }));
vi.mock('@/util/shortLinks', () => ({ shareUrl: (...args) => f.share(...args) }));
import JoinPage from '@/components/join/JoinPage';
const role = (id, defaultAllow, quorum = 0) => ({ subjectId: id, name: `Role ${id}`, defaultAllow, vouchConfig: quorum ? { quorum, voucherSubjectId: '9' } : null, permEffective: () => '1' });
const configure = configs => { f.roles = configs; f.snapshot = { coverage: { status: 'complete' }, data: { subjects: configs } }; };
let host;
const render = () => act(async () => { await host.render(<JoinPage />); });
beforeEach(() => { vi.clearAllMocks(); f.authenticated = false; f.states = { 7: { reason: 3 } }; f.solidarity = null; f.atomic = null; configure([role('7', false, 1)]); f.refetch.mockResolvedValue(); f.quickJoin.mockResolvedValue({ success: true }); f.share.mockResolvedValue('https://public.invalid/vouch'); vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() } }); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('No network in mounted test'); })); host = createParityHost(); });
afterEach(async () => { await host.unmount(); expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
describe('newcomer account creation before vouching', () => {
 it('routes a known closed vouch-gated autojoin role through account-only creation', async () => {
  await render(); expect(host.container.textContent).toContain('Create your account first');
  expect(host.container.textContent).not.toContain('Join as Role 7');
  await host.click(host.button('Create account'));
  expect(f.solidarity).toMatchObject({ isOpen: true, variant: 'join', needsVouch: true }); expect(f.atomic).toBeNull();
  expect(host.container.textContent).toContain('Account-only creation'); expect(f.quickJoin).not.toHaveBeenCalled();
 });
 it('preserves atomic creation for every explicitly observed open autojoin role', async () => {
  configure([role('7', true)]); await render(); await host.click(host.button('Create account'));
  expect(f.atomic).toMatchObject({ isOpen: true, variant: 'join', paymasterHatId: '7' }); expect(f.solidarity).toBeNull();
  expect(host.container.textContent).toContain('Atomic account and membership');
 });
 it('requires account-first for a mixture of open and known vouch-gated roles', async () => {
  configure([role('7', true), role('8', false, 1)]); await render(); await host.click(host.button('Create account'));
  expect(f.solidarity.needsVouch).toBe(true); expect(f.atomic).toBeNull();
 });
 it.each(['missing-default','open-plus-unknown','vouch-plus-unknown','closed-no-quorum','incomplete'])('withholds signup when configuration is %s', async state => {
  const unknown = role('8', undefined);
  if (state === 'missing-default') { configure([role('7', false, 1)]); f.snapshot.data.subjects = [{ ...f.roles[0], defaultAllow: undefined }]; }
  if (state === 'open-plus-unknown') configure([role('7', true), unknown]);
  if (state === 'vouch-plus-unknown') configure([role('7', false, 1), unknown]);
  if (state === 'closed-no-quorum') configure([role('7', false)]);
  if (state === 'incomplete') f.snapshot.coverage.status = 'incomplete';
  await render(); expect(host.button('Create account')).toBeUndefined(); expect(host.container.textContent).toContain('Membership options unavailable');
  expect(f.atomic).toBeNull(); expect(f.solidarity).toBeNull(); await host.click(host.button('Try again')); expect(f.refetch).toHaveBeenCalledOnce();
 });
 it('keeps the new account on Join for a real vouch link and waits for current eligibility before joining', async () => {
  await render(); await host.click(host.button('Create account'));
  f.authenticated = true; await act(async () => { f.solidarity.onSuccess({ accountAddress: f.account }); }); await render();
  expect(f.push).not.toHaveBeenCalled(); expect(host.container.textContent).toContain('Your membership');
  expect(host.container.textContent).toContain(f.account); expect(host.props(host.button('Join organization')).disabled).toBe(true);
  await host.click(host.button('Copy your vouch link')); expect(f.share).toHaveBeenCalledWith('/join/', { org: 'Any community', hatId: '7', vouch: f.account });
  expect(f.quickJoin).not.toHaveBeenCalled(); f.states = { 7: { reason: 0 } }; await render();
  await host.click(host.button('Join organization')); expect(f.quickJoin).toHaveBeenCalledExactlyOnceWith(`0x${'11'.repeat(20)}`, { paymasterHatIds: ['7'] });
 });
});
