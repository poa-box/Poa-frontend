import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ mode: 'account', cursor: 0, slots: [], effects: [], auth: {}, account: {}, memberships: {}, profile: {}, balanceRead: {},
  connected: true, nav: null, balancesProps: null, transferProps: null, cashOutProps: null, push: vi.fn(), refetch: vi.fn(), toast: vi.fn() }));
vi.mock('react', async original => ({ ...await original(), useState: initial => {
  const index = fixture.cursor++; fixture.slots[index] ||= { value: fixture.mode === 'account' && index === 0 ? false : initial };
  return [fixture.slots[index].value, value => { fixture.slots[index].value = value; }];
}, useEffect: fn => { fixture.effects.push(fn); } }));
vi.mock('@chakra-ui/react', async () => {
  const { mockChakra } = await import('@/test/mockChakra'); const chakra = mockChakra();
  chakra.useColorModeValue = light => light;
  chakra.useToast = () => fixture.toast;
  chakra.useDisclosure = () => ({ isOpen: true, onOpen: vi.fn(), onClose: vi.fn() });
  return chakra;
});
vi.mock('next/router', () => ({ useRouter: () => ({ push: fixture.push, isReady: true, query: { username: 'alice' } }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next/link', () => ({ default: ({ children }) => children }));
vi.mock('@apollo/client', () => ({ useQuery: () => ({ data: { paymasterHubContracts: [{ solidarityBalance: '1' }] } }), gql: value => value }));
vi.mock('@/util/passkeyQueries', () => ({ FETCH_SOLIDARITY_FUND_STATUS: {} }));
vi.mock('@/util/crossChainUsername', () => ({ findUserProfileByUsername: vi.fn(), findUserOrgsAcrossChains: vi.fn() }));
vi.mock('@/context/authState', () => ({ useAuth: () => fixture.auth }));
vi.mock('@/hooks/useGlobalAccount', () => ({ useGlobalAccount: () => fixture.account }));
vi.mock('@/context/WalletContext', () => ({ useAccount: () => ({ isConnected: fixture.connected }), useWalletUI: () => ({ openConnectModal: vi.fn(), preloadRuntime: async () => {} }) }));
vi.mock('@/components/marketing/LandingAccountContext', () => ({ useLandingAccount: () => ({ setAccountNav: value => { fixture.nav = value; }, isSignInOpen: false, setIsSignInOpen: vi.fn() }) }));
vi.mock('@/features/application/pages/publicProfileReads', async original => ({ ...await original(), useProfileMemberships: () => fixture.memberships, usePublicProfile: () => fixture.profile }));
vi.mock('@/hooks/useTokenBalances', () => ({ useTokenBalances: () => fixture.balanceRead }));
vi.mock('@/hooks/useIpfsImage', () => ({ default: () => null }));
vi.mock('@/components/common/AccountLoadingState', () => ({ default: () => <div>Restoring account</div> }));
vi.mock('@/components/common/SEOHead', () => ({ default: () => null }));
vi.mock('@/components/landing/Navbar', () => ({ default: () => null }));
vi.mock('@/components/profile/UserOrgCard', () => ({ default: ({ userOrg }) => <div>{userOrg.organization.name}</div> }));
vi.mock('@/components/account/GlobalAccountSettingsModal', () => ({ default: () => null }));
vi.mock('@/components/account/ProfileEditor', () => ({ default: () => <div>Edit profile</div> }));
vi.mock('@/components/account/TokenBalances', () => ({ default: props => { fixture.balancesProps = props; return <div>{props.balances.length ? 'Known balance' : props.coverage === 'complete' ? 'No token balances found' : 'Some balances are unavailable'}</div>; } }));
vi.mock('@/components/account/TransferModal', () => ({ default: props => { fixture.transferProps = props; return null; } }));
vi.mock('@/components/account/CashOutModal', () => ({ default: props => { fixture.cashOutProps = props; return null; } }));
vi.mock('@/components/account/PendingCashouts', () => ({ default: () => null }));
vi.mock('@/components/passkey/SignInModal', () => ({ default: () => null }));
vi.mock('@/components/common/AccountControl', () => ({ default: () => null }));
import AccountPage from '@/features/application/pages/AccountPage';
import PublicProfilePage from '@/features/application/pages/UPage';
import LandingAccountBridge from '@/components/marketing/LandingAccountBridge';
const account = '0x' + '1'.repeat(40), token = { address: '0x' + '2'.repeat(40), balance: '100', chainId: 100 };
const render = (component = <AccountPage />) => { fixture.cursor = 0; const html = renderToStaticMarkup(component); for (const effect of fixture.effects.splice(0)) effect(); return html; };
beforeEach(() => {
  vi.clearAllMocks(); fixture.mode = 'account'; fixture.slots = []; fixture.effects = []; fixture.nav = null; fixture.balancesProps = null; fixture.transferProps = null; fixture.connected = true;
  fixture.auth = { accountAddress: account, isAuthenticated: true, isAuthHydrated: true, isPasskeyUser: false };
  fixture.account = { globalUsername: 'alice', hasAccount: true, isUnavailable: false, isLoading: false, refetchAccount: fixture.refetch };
  fixture.memberships = { organizations: [], isLoading: false, isComplete: false, isUnavailable: true, refetch: fixture.refetch };
  fixture.profile = { profile: null, isLoading: false, isUnavailable: true, notFound: false, refetch: fixture.refetch };
  fixture.balanceRead = { balances: [], nativeBalances: { 100: null }, errors: [{ code: 'NATIVE_BALANCE_UNAVAILABLE' }], coverage: 'incomplete', isLoading: false, refetch: fixture.refetch };
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
});
afterEach(() => vi.unstubAllGlobals());
describe('account page unknown-state consumers', () => {
  it('keeps unavailable identity on the account page without redirecting, signing out or starting setup', () => {
    fixture.account = { ...fixture.account, hasAccount: null, isUnavailable: true };
    const html = render(); expect(html).toContain('account details are unavailable');
    expect(html).not.toContain('Sign In'); expect(html).not.toContain('Opening account setup'); expect(fixture.push).not.toHaveBeenCalled();
  });
  it('waits for auth restoration and redirects only after confirmed registration absence', () => {
    fixture.auth.isAuthHydrated = false; fixture.auth.accountAddress = undefined; fixture.account.hasAccount = false;
    expect(render()).toContain('Restoring account'); expect(fixture.push).not.toHaveBeenCalled();
    fixture.auth.isAuthHydrated = true; render(); expect(fixture.push).toHaveBeenCalledExactlyOnceWith('/');
  });
  it('renders partial membership/balance unavailability without false zero holdings or empty membership claims', () => {
    const html = render(); expect(html).toContain('Some organizations are unavailable'); expect(html).toContain('Some balances are unavailable');
    expect(html).not.toContain("haven&#x27;t joined"); expect(html).not.toContain('No token balances found'); expect(fixture.balancesProps.coverage).toBe('incomplete');
    fixture.balancesProps.onRetry(); expect(fixture.refetch).toHaveBeenCalledOnce();
  });
  it('forwards selected-chain financial evidence to cashout without inventing a native balance', () => {
    fixture.balanceRead = { ...fixture.balanceRead, balances: [token], nativeBalances: { 100: '1' }, errors: [{ chainId: 42161, token: null }] };
    render(); fixture.balancesProps.onCashOut(token); render();
    expect(fixture.cashOutProps).toMatchObject({ isOpen: true, token, nativeBalance: '1', coverage: 'incomplete', errors: [{ chainId: 42161, token: null }] });
    fixture.balanceRead.nativeBalances[100] = null; render();
    expect(fixture.cashOutProps).toMatchObject({ isOpen: false, nativeBalance: null });
    fixture.balanceRead.nativeBalances[100] = '0'; render();
    expect(fixture.cashOutProps.nativeBalance).toBe('0');
    fixture.auth.accountAddress = '0x' + '3'.repeat(40); render();
    expect(fixture.cashOutProps).toMatchObject({ isOpen: false, token: null, nativeBalance: null });
  });
  it('preserves known cards and holdings during partial outages and refuses opening transfer with an unknown native balance', () => {
    fixture.memberships.organizations = [{ id: 'one', sourceChainId: 100, organization: { id: '0x' + 'a'.repeat(64), name: 'Community', membershipAuthority: { id: account, isRouterBound: true, cutoverAt: '1' } } }]; fixture.balanceRead.balances = [token];
    const html = render(); expect(html).toContain('Community'); expect(html).toContain('Known balance');
    expect(fixture.balancesProps).toMatchObject({ nativeBalances: { 100: null }, coverage: 'incomplete', errors: [{ code: 'NATIVE_BALANCE_UNAVAILABLE' }] });
    fixture.balancesProps.onSend(token); render(); expect(fixture.transferProps.isOpen).toBe(false); expect(fixture.transferProps.nativeBalance).toBeNull();
    fixture.balanceRead.nativeBalances[100] = '0'; fixture.balancesProps.onSend(token); render();
    expect(fixture.transferProps.isOpen).toBe(true); expect(fixture.transferProps.nativeBalance).toBe('0');
    fixture.auth.accountAddress = '0x' + '3'.repeat(40); render(); expect(fixture.transferProps.isOpen).toBe(false);
  });
});
describe('public profile and landing identity consumers', () => {
  it('renders unavailable profile retry instead of not-found, and preserves a known partial profile', () => {
    fixture.mode = 'public'; let html = render(<PublicProfilePage />);
    expect(html).toContain('profile is unavailable'); expect(html).not.toContain('User not found');
    fixture.profile.profile = { address: account, username: 'alice', isComplete: false, metadata: { bio: 'Known profile' } };
    html = render(<PublicProfilePage />); expect(html).toContain('Known profile'); expect(html).toContain('Some profile details are unavailable');
    expect(html).not.toContain('Not a member of any organizations yet'); expect(html).toContain('Unavailable');
  });
  it.each([false, true])('never offers signup/onboarding for unresolved %s passkey identity', passkey => {
    fixture.mode = 'landing'; fixture.auth.isPasskeyUser = passkey; fixture.account.hasAccount = null; fixture.account.isUnavailable = true;
    render(<LandingAccountBridge />); expect(fixture.nav.accountMenuItem.text).toBe('Account unavailable · retry');
    fixture.nav.accountMenuItem.onClick(); expect(fixture.refetch).toHaveBeenCalledOnce();
    expect(fixture.push).not.toHaveBeenCalled();
  });
  it('allows signup after confirmed absence and retains pending hydration without false absence', () => {
    fixture.mode = 'landing'; fixture.account.hasAccount = false;
    render(<LandingAccountBridge />); expect(fixture.nav.accountMenuItem.text).toBe('Sign up');
    fixture.auth.isAuthHydrated = false; render(<LandingAccountBridge />); expect(fixture.nav.accountMenuItem.text).toBe('Account');
  });
});
