import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { utils } from 'ethers';
import { resolveTokenLabel } from '@/util/tokenLabel';
import { TokenRequestService } from '@/services/web3/domain/TokenRequestService';
import PendingRequestsPanel from '@/components/tokenRequest/PendingRequestsPanel';
import ExecutiveMenuModal from '@/components/profileHub/ExecutiveMenuModal';

const host = vi.hoisted(() => ({
  poContext: null, authContext: null, po: null, auth: null, query: null, queryOptions: [],
  client: {}, actions: [], badges: [], refs: [], refCursor: 0,
  service: null, factory: null, manager: null, execute: null, toast: null, ready: true,
}));
vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return { ...actual, useRef: initial => {
    const index = host.refCursor++;
    return host.refs[index] ||= { current: initial };
  } };
});
vi.mock('@chakra-ui/react', async () => {
  const { createElement } = await import('react');
  const chakra = (await import('@/test/mockChakra')).mockChakra(host.actions);
  chakra.Badge = props => {
    host.badges.push(props);
    return createElement('span', { style: { textTransform: props.textTransform } }, props.children);
  };
  chakra.useToast = () => host.toast;
  return chakra;
});
vi.mock('@/context/POContext', async () => {
  const { useContext } = await import('react');
  return { usePOContext: () => useContext(host.poContext) };
});
vi.mock('@/context/authState', async () => {
  const { useContext } = await import('react');
  return { useAuth: () => useContext(host.authContext) };
});
vi.mock('@/hooks/useWeb3Services', () => ({ useWeb3: () => ({
  tokenRequest: host.service, executeWithNotification: host.execute, isReady: host.ready,
}) }));
vi.mock('@apollo/client', () => ({ useQuery: (_document, options) => {
  host.queryOptions.push(options);
  return host.query;
} }));
vi.mock('@/util/queries', () => ({ FETCH_PENDING_TOKEN_REQUESTS: 'pending-requests' }));
vi.mock('@/util/apolloClient', () => ({ useSubgraphClient: () => host.client }));
vi.mock('@/context/ipfsContext', () => ({ useIPFScontext: () => ({}) }));
vi.mock('@/context/RefreshContext', () => ({ useRefreshSubscription: () => {}, RefreshEvent: {
  TOKEN_REQUEST_CREATED: 'created', TOKEN_REQUEST_APPROVED: 'approved', TOKEN_REQUEST_CANCELLED: 'cancelled',
} }));
vi.mock('@/components/tokenRequest', async () => ({
  PendingRequestsPanel: (await import('@/components/tokenRequest/PendingRequestsPanel')).default,
}));
vi.mock('@/components/shared/PulseLoader', () => ({ default: () => null }));

host.poContext = React.createContext(null);
host.authContext = React.createContext(null);
const ACCOUNT = utils.getAddress(`0x${'ab'.repeat(20)}`);
const OTHER_MEMBER = `0x${'cd'.repeat(20)}`;
const TOKEN = `0x${'12'.repeat(20)}`;
const REQUEST_ID = '9007199254740993';
const request = requester => ({
  id: `${TOKEN}-${REQUEST_ID}`, requestId: REQUEST_ID, requester,
  amount: '10000000000000000000', status: 'Pending', createdAt: '1700000000',
  metadata: { reason: 'Community work' },
});

beforeEach(() => {
  host.actions.length = 0; host.badges.length = 0; host.refs = []; host.refCursor = 0;
  host.queryOptions = [];
  host.po = { orgId: `0x${'56'.repeat(32)}`, orgChainId: 100, participationTokenAddress: TOKEN, subgraphUrl: 'mock://selected-chain' };
  host.auth = { accountAddress: ACCOUNT, isAuthenticated: true, isAuthHydrated: true,
    isPasskeyUser: true, isSessionCurrent: () => true };
  host.query = { data: { tokenRequests: [request(OTHER_MEMBER)] }, loading: false, error: null, refetch: vi.fn() };
  host.factory = { createWritable: vi.fn((address, abi) => ({ address, interface: new utils.Interface(abi) })) };
  host.manager = { execute: vi.fn(async () => ({ success: true, receipt: { status: 1 } })) };
  host.service = new TokenRequestService(host.factory, host.manager);
  vi.spyOn(host.service, 'approveRequest'); vi.spyOn(host.service, 'cancelRequest');
  host.execute = vi.fn(operation => operation()); host.toast = vi.fn(); host.ready = true;
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
});
afterEach(() => vi.unstubAllGlobals());

function render(menu = false, hasApproverRole = true) {
  host.actions.length = 0; host.badges.length = 0; host.refCursor = 0;
  return renderToStaticMarkup(
    <host.poContext.Provider value={host.po}>
      <host.authContext.Provider value={host.auth}>
        {menu ? <ExecutiveMenuModal isOpen onClose={() => {}} hasApproverRole={hasApproverRole} /> : <PendingRequestsPanel />}
      </host.authContext.Provider>
    </host.poContext.Provider>,
  );
}
const button = label => host.actions.find(action => action.children === label);
const expectNoExecution = () => {
  expect(host.execute).not.toHaveBeenCalled();
  expect(host.factory.createWritable).not.toHaveBeenCalled();
  expect(host.manager.execute).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
};

describe('rendered approval reward wording from organization context', () => {
  it.each([
    ['missing context label', null, 'Shares'],
    ['missing preference', { symbol: 'MiXeD' }, 'Shares'],
    ['disabled preference', { useTokenSymbol: false, symbol: 'MiXeD' }, 'Shares'],
    ['enabled preference', { useTokenSymbol: true, symbol: 'MiXeD' }, 'MiXeD'],
    ['enabled blank symbol', { useTokenSymbol: true, symbol: '  ' }, 'Shares'],
    ['enabled missing symbol', { useTokenSymbol: true }, 'Shares'],
  ])('uses %s in amounts, headings, footer, empty state and notifications', async (_name, config, label) => {
    if (config) host.po.tokenLabel = resolveTokenLabel(config);
    const html = render(true);
    expect(html).toContain(`10 ${label}`);
    expect(html).toContain(`Pending ${label} Requests`);
    expect(html).toContain(`${label} Request Approvals`);
    expect(html).toContain(`${label} Approvals`);
    expect(html).not.toContain(' tokens'); expect(html).not.toContain('Token Approvals');
    expect(host.badges.find(badge => Array.isArray(badge.children) && badge.children[0] === label)?.textTransform).toBe('none');
    await button('Approve').onClick();
    expect(host.execute.mock.calls[0][1]).toMatchObject({
      pendingMessage: `Approving ${label} request...`, successMessage: `${label} request approved!`,
      refreshEvent: 'approved', refreshData: { requestId: REQUEST_ID },
    });
    await button('Reject').onClick();
    expect(host.execute.mock.calls[1][1]).toMatchObject({
      pendingMessage: `Rejecting ${label} request...`, successMessage: `${label} request rejected`, refreshEvent: 'cancelled',
    });
    host.query.data = { tokenRequests: [request(ACCOUNT.toLowerCase())] };
    render();
    await button('Cancel').onClick();
    expect(host.execute.mock.calls[2][1]).toMatchObject({
      pendingMessage: `Cancelling ${label} request...`, successMessage: `${label} request cancelled`, refreshEvent: 'cancelled',
    });
    host.query.data = { tokenRequests: [] };
    expect(render()).toContain(`No pending ${label} requests to review`);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('rendered own and other request controls', () => {
  it('uses the actual passkey account, compares case-insensitively, blocks own approval and retains own cancellation', async () => {
    host.query.data = { tokenRequests: [request(ACCOUNT.toLowerCase())] };
    expect(ACCOUNT).not.toBe(ACCOUNT.toLowerCase());
    expect(render()).toContain('You cannot approve your own request. Another approver can review it.');
    expect(button('Approve')).toBeUndefined(); expect(button('Reject')).toBeUndefined();
    expectNoExecution();
    expect(button('Cancel')?.isDisabled).toBe(false);
    await button('Cancel').onClick();
    expect(host.service.approveRequest).not.toHaveBeenCalled();
    expect(host.service.cancelRequest).toHaveBeenCalledExactlyOnceWith(TOKEN, REQUEST_ID, { scopeGuard: expect.any(Function) });
    expect(host.manager.execute.mock.calls[0][1]).toBe('cancelRequest');
    expect(host.manager.execute.mock.calls[0][2].map(String)).toEqual([REQUEST_ID]);
    expect(host.toast).not.toHaveBeenCalled();
  });

  it('approves and rejects another member through the unchanged service/notification APIs with exact request IDs', async () => {
    render();
    expect(button('Cancel')).toBeUndefined();
    expect(button('Approve')?.isDisabled).toBe(false); expect(button('Reject')?.isDisabled).toBe(false);
    await button('Approve').onClick(); await button('Reject').onClick();
    expect(host.service.approveRequest).toHaveBeenCalledWith(TOKEN, REQUEST_ID, { scopeGuard: expect.any(Function) });
    expect(host.manager.execute.mock.calls.map(call => [call[1], call[2].map(String)])).toEqual([
      ['approveRequest', [REQUEST_ID]], ['cancelRequest', [REQUEST_ID]],
    ]);
    expect(host.queryOptions[0]).toMatchObject({ variables: { tokenAddress: TOKEN }, client: host.client, fetchPolicy: 'cache-first', skip: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['pending hydration with an address', { isAuthHydrated: false }, 'Checking your account'],
    ['pending hydration without an address', { isAuthHydrated: false, accountAddress: undefined }, 'Checking your account'],
    ['settled anonymous identity', { isAuthenticated: false, accountAddress: undefined }, 'Sign in'],
    ['unknown actual account despite a saved hint', { accountAddress: undefined, accountHint: { address: ACCOUNT } }, 'Sign in'],
  ])('offers no approval or cancellation for %s', (_name, auth, copy) => {
    host.auth = { ...host.auth, ...auth };
    expect(render()).toContain(copy);
    expect(button('Approve')).toBeUndefined(); expect(button('Reject')).toBeUndefined(); expect(button('Cancel')).toBeUndefined();
    expectNoExecution();
  });

  it('does not treat an unknown requester as another member', () => {
    host.query.data = { tokenRequests: [request(null)] };
    expect(render()).toContain('The member for this request is unavailable');
    expect(button('Approve')).toBeUndefined(); expect(button('Reject')).toBeUndefined();
    expectNoExecution();
  });

  it('blocks the approval callback itself when the request belongs to the current account', async () => {
    render(); const approve = button('Approve');
    host.query.data.tokenRequests[0].requester = ACCOUNT.toLowerCase();
    await approve.onClick();
    expectNoExecution();
    expect(host.service.approveRequest).not.toHaveBeenCalled();
  });

  it('blocks a callback when its authenticated session has expired', async () => {
    let current = true;
    host.auth.isSessionCurrent = () => current;
    render(); const approve = button('Approve');
    current = false;
    await approve.onClick();
    expectNoExecution();
  });

  it.each(['orgId', 'orgChainId', 'participationTokenAddress', 'subgraphUrl'])('does not show empty/allowed state for unknown %s', field => {
    host.po[field] = null;
    const html = render();
    expect(html).toContain('Requests are unavailable until the organization is ready');
    expect(html).not.toContain('No pending'); expect(button('Approve')).toBeUndefined();
    expect(host.queryOptions[0].skip).toBe(true);
    expectNoExecution();
  });

  it.each(['runtime', 'query loading', 'settled request'])('blocks even a manually invoked disabled callback for %s', async reason => {
    if (reason === 'runtime') host.ready = false;
    if (reason === 'query loading') host.query.loading = true;
    if (reason === 'settled request') host.query.data.tokenRequests[0].status = 'Approved';
    render();
    expect(button('Approve')?.isDisabled).toBe(true);
    await button('Approve').onClick(); await button('Reject').onClick();
    expectNoExecution();
  });

  it.each(['accountAddress', 'orgId', 'orgChainId', 'participationTokenAddress', 'subgraphUrl', 'hydration'])('blocks retained callbacks after %s changes', async field => {
    render(); const approve = button('Approve'), reject = button('Reject');
    if (field === 'accountAddress') host.auth.accountAddress = OTHER_MEMBER;
    else if (field === 'hydration') host.auth.isAuthHydrated = false;
    else host.po[field] = field === 'orgChainId' ? 42161 : `changed-${field}`;
    render();
    await approve.onClick(); await reject.onClick();
    expectNoExecution();
  });

  it('rechecks the selected scope if execution is deferred after the click', async () => {
    let resume;
    host.execute.mockImplementation(operation => new Promise(resolve => { resume = async () => {
      try { resolve(await operation()); } catch (error) { resolve({ success: false, error }); }
    }; }));
    render(); const pending = button('Approve').onClick();
    host.po.subgraphUrl = 'mock://other-chain'; render();
    await resume(); await pending;
    expect(host.service.approveRequest).not.toHaveBeenCalled();
    expect(host.factory.createWritable).not.toHaveBeenCalled(); expect(host.manager.execute).not.toHaveBeenCalled();
    expect(host.toast).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it('forwards a current scope guard through the real service to the transaction manager', async () => {
    render(); await button('Approve').onClick();
    const { scopeGuard } = host.manager.execute.mock.calls[0][3];
    expect(scopeGuard).toBeTypeOf('function'); expect(() => scopeGuard()).not.toThrow();
    host.auth.accountAddress = OTHER_MEMBER; render();
    expect(() => scopeGuard()).toThrow('organization or account changed');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not send a second request while a review is pending', async () => {
    let finish;
    host.manager.execute.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(); const approve = button('Approve');
    const pending = approve.onClick();
    await approve.onClick(); await button('Reject').onClick();
    expect(host.execute).toHaveBeenCalledOnce(); expect(host.manager.execute).toHaveBeenCalledOnce();
    finish({ success: true }); await pending;
  });

  it('keeps approval controls hidden without the host approver capability', () => {
    const html = render(true, false);
    expect(html).not.toContain('Request Approvals'); expect(button('Approve')).toBeUndefined();
    expectNoExecution();
  });
});
