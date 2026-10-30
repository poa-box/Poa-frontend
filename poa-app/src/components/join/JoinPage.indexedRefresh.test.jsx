import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createParityHost } from '@/test/parityHost';

const f = vi.hoisted(() => ({
  auth: null, po: null, authority: null, client: null, roles: null,
  read: vi.fn(), send: vi.fn(), canClaim: vi.fn(), wait: vi.fn(), add: vi.fn(), update: vi.fn(),
  events: [], indexedCount: 0, initialCount: 0,
}));
vi.mock('@chakra-ui/react', async () => (await import('@/test/parityHost')).parityChakra());
vi.mock('next/router', () => ({ useRouter: () => ({ query: { subjectId: '123', vouch: `0x${'bb'.repeat(20)}` } }) }));
vi.mock('@/context/authState', () => ({ useAuth: () => f.auth }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => f.po }));
vi.mock('@/context/UserContext', () => ({ useUserContext: () => ({ graphUsername: 'voucher' }) }));
vi.mock('@/context/NotificationContext', () => ({ useNotification: () => ({ addNotification: f.add, updateNotification: f.update }) }));
vi.mock('@/context/RefreshContext', async () => {
  // Vitest's JSX-in-.js transform covers components only. Compile the unchanged
  // provider here so the regression uses its real subscriptions and event bus.
  const { readFileSync } = await import('node:fs');
  const { createRequire } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  const { transformWithOxc } = await import('vite');
  const require = createRequire(import.meta.url);
  const source = readFileSync(new URL('../../context/RefreshContext.js', import.meta.url), 'utf8');
  const { code } = await transformWithOxc(source, 'RefreshContext.jsx', { lang: 'jsx' });
  const resolved = code.replace(/from (["'])(react(?:\/jsx-runtime)?)\1/g,
    (_match, _quote, name) => `from ${JSON.stringify(pathToFileURL(require.resolve(name)).href)}`);
  return import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`);
});
vi.mock('@/util/waitForSubgraph', () => ({ waitForSubgraphBlock: (...args) => f.wait(...args) }));
vi.mock('@/util/apolloClient', () => ({ useSubgraphClient: () => f.client }));
vi.mock('@/hooks/accessV2/useOrgAuthority', () => ({ useOrgAuthority: () => f.authority }));
vi.mock('@/lib/accessV2/authorityEvidence', async original => ({
  ...await original(), observeAuthority: (...args) => f.read(...args),
}));
vi.mock('@/hooks/useWeb3Services', async () => {
  const { useTransactionWithNotification } = await import('@/hooks/useTransactionWithNotification');
  const services = { membershipAuthority: {
    vouch: (...args) => f.send(...args), revokeVouch: (...args) => f.send(...args),
    claim: (...args) => f.send(...args), canClaim: (...args) => f.canClaim(...args),
  }, organization: { quickJoinWithUser: (...args) => f.send(...args) }, isReady: true };
  return { useWeb3Services: () => services, useTransactionWithNotification,
    useWeb3: () => ({ ...services, ...useTransactionWithNotification() }) };
});
vi.mock('@/hooks/accessV2', async () => {
  const { useAuthorityActions } = await import('@/hooks/accessV2/useAuthorityActions');
  const { useAuthorityEvidence } = await import('@/hooks/accessV2/useAuthorityEvidence');
  return {
    useAuthorityActions,
    // Protocol projections are fixtures; the shared observation store, refresh
    // subscriptions, action/notification hooks and mounted components are real.
    useAuthoritySubjects: () => ({ ...useAuthorityEvidence(), roles: f.roles }),
    useSubjectVouches: () => {
      const evidence = useAuthorityEvidence();
      const count = evidence.snapshot?.data.count ?? f.initialCount;
      return { ...evidence, config: { enabled: true, quorum: 1 }, records: [],
        subject: { name: 'Delegates' }, progress: { count, quorum: 1, met: count >= 1, stale: 0 },
        progressCopy: `${count} of 1 vouches`, vouchGate: { can: true }, viewerHasVouched: count > 0 };
    },
  };
});
vi.mock('@/hooks/useIpfsImage', () => ({ default: () => null }));
vi.mock('@/hooks/useZkEmailInviteSummary', () => ({ useZkEmailInviteSummary: () => ({ status: 'absent' }) }));
vi.mock('@/components/shared/useOnboardingColors', () => ({ default: () => ({}) }));
vi.mock('@/components/shared/OrgDeadEnd', () => ({ useOrgGate: () => null }));
vi.mock('@/components/common/SEOHead', () => ({ default: () => null }));
vi.mock('@/templateComponents/studentOrgDAO/NavBar', () => ({ default: () => null }));
vi.mock('@/components/common/AccountControl', () => ({ default: () => null }));
vi.mock('@/components/common/UserIdentity', () => ({ default: ({ address }) => <span>{address}</span> }));
vi.mock('@/components/passkey/SignInModal', () => ({ default: () => null }));
vi.mock('@/components/passkey/SolidarityOnboardingModal', () => ({ default: () => null }));
vi.mock('@/components/passkey/PasskeyOnboardingModal', () => ({ default: () => null }));
vi.mock('@/components/account/SignupModal', () => ({ default: () => null }));
vi.mock('@/components/zkEmail/EmailInviteCard', () => ({ default: () => null }));
vi.mock('@/components/shared/PulseLoader', () => ({ default: () => null }));

import JoinPage from '@/components/join/JoinPage';
import { RefreshProvider, RefreshEvent, useRefreshSubscription } from '@/context/RefreshContext';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function Events() {
  useRefreshSubscription([RefreshEvent.VOUCH_CHANGED, RefreshEvent.ROLE_CLAIMED, RefreshEvent.MEMBER_JOINED],
    event => f.events.push(event), []);
  return null;
}
function Page() { return <RefreshProvider><Events /><JoinPage /></RefreshProvider>; }
let host;
beforeEach(() => {
  vi.clearAllMocks(); f.events = []; f.indexedCount = 0; f.initialCount = 0;
  f.auth = { accountAddress: `0x${'aa'.repeat(20)}`, authType: 'eoa', isAuthenticated: true,
    isAuthHydrated: true, sessionGeneration: 1 };
  f.po = { orgId: 'org-a', orgName: 'Test6', orgChainId: 100, subgraphUrl: 'https://indexed.example',
    quickJoinContractAddress: `0x${'11'.repeat(20)}` };
  f.authority = { enabled: true, address: `0x${'22'.repeat(20)}`, paused: false, loading: false, refetch: vi.fn() };
  f.client = {};
  f.roles = [{ subjectId: '123', name: 'Delegates', vouchConfig: { quorum: 1 }, permEffective: () => 1n }];
  f.read.mockImplementation(async () => ({ coverage: { status: 'complete' },
    data: { count: f.indexedCount, subjects: [{ subjectId: '123', defaultAllow: true }] } }));
  f.send.mockResolvedValue({ success: true, blockNumber: 42, txHash: 'confirmed-hash' });
  f.canClaim.mockResolvedValue({ reason: 0 });
  f.add.mockReturnValue('pending-1');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('No live network in mounted regression'); }));
  host = createParityHost();
});
afterEach(async () => { await host.unmount(); expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe('confirmed Join actions refresh only after their indexed notification event', () => {
  it.each([
    ['vouch', 'Vouch for them', RefreshEvent.VOUCH_CHANGED, 'Vouch recorded', 0, 1],
    ['revoke', 'Take back my vouch', RefreshEvent.VOUCH_CHANGED, 'Vouch revoked', 1, 0],
    ['claim', 'Join Delegates', RefreshEvent.ROLE_CLAIMED, 'You’re now in Delegates', 0, 1],
    ['quickJoin', 'Join organization', RefreshEvent.MEMBER_JOINED, 'You joined the organization.', 0, 1],
  ])('keeps the initiating panel mounted while %s waits for indexing', async (action, label, event, message, before, after) => {
    f.initialCount = before; f.indexedCount = before;
    const indexed = deferred(); f.wait.mockReturnValue(indexed.promise);
    const refreshed = deferred();
    f.read.mockImplementationOnce(async () => ({ coverage: { status: 'complete' },
      data: { count: before, subjects: [{ subjectId: '123', defaultAllow: true }] } }))
      .mockImplementation(() => refreshed.promise);
    await host.render(<Page />);
    expect(f.read).toHaveBeenCalledOnce();
    expect(host.container.textContent).toContain(`${before} of 1 vouches`);
    const preflights = f.canClaim.mock.calls.length;
    await host.click(host.button(label));
    expect(f.send).toHaveBeenCalledOnce();
    expect(f.wait).toHaveBeenCalledExactlyOnceWith('https://indexed.example', 42);
    // An eager refetch clears shared evidence and makes Join replace the panel
    // with its loader. Its unmount then cancels the delayed notification refresh.
    expect(f.read).toHaveBeenCalledOnce();
    expect(f.authority.refetch).not.toHaveBeenCalled();
    expect(f.canClaim).toHaveBeenCalledTimes(preflights);
    expect(host.container.textContent).not.toContain('Loading membership options');
    expect(f.update).not.toHaveBeenCalled(); expect(f.events).toEqual([]);
    f.indexedCount = after;
    if (action === 'claim' || action === 'quickJoin') f.canClaim.mockResolvedValue({ reason: 3 });
    await act(async () => { indexed.resolve(); });
    expect(f.update).toHaveBeenCalledExactlyOnceWith('pending-1', message, 'success');
    expect(f.events.map(row => row.event)).toEqual([event]);
    expect(f.read.mock.calls.length).toBeGreaterThan(1);
    await act(async () => { refreshed.resolve({ coverage: { status: 'complete' },
      data: { count: after, subjects: [{ subjectId: '123', defaultAllow: true }] } }); });
    expect(host.container.textContent).toContain(`${after} of 1 vouches`);
    expect(host.container.textContent.includes('Qualified')).toBe(after > 0);
    expect(f.authority.refetch).toHaveBeenCalledOnce();
    expect(f.canClaim.mock.calls.length).toBeGreaterThan(preflights);
    if (action === 'claim' || action === 'quickJoin') {
      expect(host.container.textContent).toContain('You hold this role.');
      expect(host.button('Join Delegates')).toBeUndefined();
      expect(host.props(host.button('Join organization')).disabled).toBe(true);
    }
    expect(f.send).toHaveBeenCalledOnce();
  });

  it.each(['account', 'organization'])('still suppresses late refresh after an actual %s change', async changed => {
    const indexed = deferred(); f.wait.mockReturnValue(indexed.promise);
    await host.render(<Page />); await host.click(host.button('Vouch for them'));
    if (changed === 'account') f.auth = { ...f.auth, accountAddress: `0x${'cc'.repeat(20)}`, sessionGeneration: 2 };
    else f.po = { ...f.po, orgId: 'org-b' };
    await host.render(<Page />);
    const reads = f.read.mock.calls.length;
    await act(async () => { indexed.resolve(); });
    expect(f.update).toHaveBeenCalledExactlyOnceWith('pending-1', expect.stringContaining('earlier action'), 'error');
    expect(f.events).toEqual([]); expect(f.read).toHaveBeenCalledTimes(reads);
    expect(f.send).toHaveBeenCalledOnce();
  });

  it('preserves the explicit Refresh eligibility control', async () => {
    await host.render(<Page />); expect(f.read).toHaveBeenCalledOnce();
    f.indexedCount = 1;
    await host.click(host.button('Refresh eligibility'));
    expect(f.read.mock.calls.length).toBeGreaterThan(1);
    expect(host.container.textContent).toContain('1 of 1 vouches');
    expect(f.send).not.toHaveBeenCalled(); expect(f.events).toEqual([]);
  });
});
