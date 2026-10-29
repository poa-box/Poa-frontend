import React from 'react';
import { cashoutGraph, cashoutCandidate } from '@/test/cashoutGraphFixture';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ slots: [], cursor: 0, effects: [], seed: [], buttons: [], auth: {}, toast: vi.fn(),
  apollo: { query: vi.fn() }, rpc: { getChainId: vi.fn(), getBlock: vi.fn(), multicall: vi.fn(), getTransactionReceipt: vi.fn() } }));
vi.mock('react', async original => {
  const actual = await original();
  const memo = (fn, deps) => {
    const index = f.cursor++, previous = f.slots[index];
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) f.slots[index] = { deps, value: fn() };
    return f.slots[index].value;
  };
  return { ...actual,
    useRef: initial => { const index = f.cursor++; return f.slots[index] ||= { current: initial }; },
    useState: initial => { const index = f.cursor++;
      f.slots[index] ||= { value: f.seed.length ? f.seed.shift() : typeof initial === 'function' ? initial() : initial };
      return [f.slots[index].value, next => { f.slots[index].value = typeof next === 'function' ? next(f.slots[index].value) : next; }];
    },
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect: (fn, deps) => { const index = f.cursor++, previous = f.slots[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) f.effects.push(() => {
        previous?.cleanup?.(); f.slots[index] = { deps, cleanup: fn() };
      });
    },
  };
});
vi.mock('@chakra-ui/react', async () => {
  const { mockChakra } = await import('@/test/mockChakra');
  const chakra = mockChakra(f.buttons); chakra.useToast = () => f.toast;
  return chakra;
});
vi.mock('viem', async original => ({ ...await original(), createPublicClient: () => f.rpc }));
vi.mock('@/util/apolloClient', () => ({ getClient: () => f.apollo }));
vi.mock('@/context/authState', () => ({ useAuth: () => f.auth }));
vi.mock('@/context/WalletContext', () => ({ useAccount: () => ({ chain: { id: 42161 } }), useConfig: () => ({}),
  useSwitchChain: () => ({ switchChainAsync: vi.fn() }), getConnectorClient: vi.fn(), clientToSigner: vi.fn() }));
import TokenBalances from '@/components/account/TokenBalances';
import PendingCashouts from '@/components/account/PendingCashouts';
import CashOutModal from '@/components/account/CashOutModal';
import { fetchOutstandingDeposits, USDC_BASE, USDC_ARBITRUM } from '@/services/web3/domain/CashOutService';

const USER = `0x${'1'.repeat(40)}`, HASH = `0x${'3'.repeat(64)}`, REQUEST = `0x${'4'.repeat(64)}`;
const token = { chainId: 42161, address: USDC_ARBITRUM, balance: '9007199254740993', decimals: 6, symbol: 'USDC', name: 'USD Coin' };
const request = { requestHash: REQUEST, amount: '9007199254740993', createdAtTimestamp: '100' };
function render(element) { f.cursor = 0; f.buttons.length = 0; return renderToStaticMarkup(element); }
function effects() { for (const effect of f.effects.splice(0)) effect(); }
function cleanup() { for (const slot of f.slots) slot?.cleanup?.(); f.slots = []; f.effects = []; f.seed = []; }
beforeEach(() => {
  cleanup(); vi.clearAllMocks();
  f.auth = { accountAddress: USER, isAuthHydrated: true, isPasskeyUser: false, isSessionCurrent: () => true };
  f.rpc.getChainId.mockResolvedValue(8453); f.rpc.getBlock.mockResolvedValue({ number: 100n, hash: HASH });
  f.rpc.multicall.mockResolvedValue([{ status: 'success', result: USER }, { status: 'success', result: 9007199254740993n }, { status: 'success', result: USDC_BASE }]);
  f.apollo.query.mockImplementation(cashoutGraph({ failed: [cashoutCandidate(request, 'FAILED')] }));
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('rendered account balances and action gates', () => {
  it('shows known empty separately from partial and unknown empty holdings', () => {
    expect(render(<TokenBalances balances={[]} coverage="complete" />)).toContain('No balances found');
    for (const coverage of ['incomplete', undefined]) {
      const html = render(<TokenBalances balances={[]} coverage={coverage} />);
      expect(html).toContain('Some balances are unavailable'); expect(html).not.toContain('No balances found');
    }
  });
  it('offers a real retry for unavailable empty holdings without a false empty claim', async () => {
    const onRetry = vi.fn();
    const html = render(<TokenBalances balances={[]} coverage="incomplete" onRetry={onRetry} />);
    expect(html).not.toContain('No balances found');
    await f.buttons.find(button => button.children === 'Refresh balances').onClick();
    expect(onRetry).toHaveBeenCalledOnce();
  });
  it.each([null, undefined, '0'])('disables transfer and cashout with native amount %s', async native => {
    const send = vi.fn(), cashout = vi.fn();
    const html = render(<TokenBalances balances={[token]} nativeBalances={{ 42161: native }} coverage="complete" onSend={send} onCashOut={cashout} />);
    expect(f.buttons.every(button => button.isDisabled)).toBe(true);
    for (const button of f.buttons) await button.onClick();
    expect(send).not.toHaveBeenCalled(); expect(cashout).not.toHaveBeenCalled();
    if (native == null) expect(html).toContain('Network fee balance unavailable');
  });
  it('keeps an observed asset usable during unrelated partial reads and blocks an affected asset', () => {
    const props = { balances: [token], nativeBalances: { 42161: '1' }, coverage: 'incomplete', onSend: vi.fn(), onCashOut: vi.fn() };
    render(<TokenBalances {...props} errors={[{ chainId: 100, token: null }]} />);
    expect(f.buttons.every(button => !button.isDisabled)).toBe(true);
    render(<TokenBalances {...props} errors={[{ chainId: 42161, token: token.address }]} />);
    expect(f.buttons.every(button => button.isDisabled)).toBe(true);
    const html = render(<TokenBalances {...props} balances={[{ ...token, balance: null }]} />);
    expect(html).toContain('Unavailable'); expect(f.buttons.every(button => button.isDisabled)).toBe(true);
  });
});

describe('rendered current cashout service evidence', () => {
  it('preserves a recoverable known row in partial history from the actual source adapter', async () => {
    f.apollo.query.mockImplementation(cashoutGraph({ failed: [cashoutCandidate(request, 'FAILED')], deposited: [cashoutCandidate({ ...request, requestHash: `0x${'5'.repeat(64)}`, createdTxHash: HASH }, 'DEPOSITED')] }));
    f.rpc.getTransactionReceipt.mockRejectedValue(new Error('receipt unavailable'));
    const rows = await fetchOutstandingDeposits(USER);
    expect(rows.coverage.status).toBe('incomplete'); expect(rows[0].recoveryFacts.state).toBe('known');
    f.seed = [{ account: USER, scope: [USER, USER, f.auth.isPasskeyUser, f.auth.isAuthHydrated, f.auth.sessionGeneration].join(':'), rows, coverage: rows.coverage }, null];
    const html = render(<PendingCashouts accountAddress={USER} />);
    expect(html).toContain('Some cashout details are unavailable'); expect(html).toContain('USDC awaiting recovery');
    expect(f.buttons.find(button => button.children === 'Recover USDC').isDisabled).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('shows an unknown row without an invented zero or a recovery action', async () => {
    f.rpc.multicall.mockResolvedValue([{ status: 'failure' }]);
    const rows = await fetchOutstandingDeposits(USER);
    f.seed = [{ account: USER, scope: [USER, USER, f.auth.isPasskeyUser, f.auth.isAuthHydrated, f.auth.sessionGeneration].join(':'), rows, coverage: rows.coverage }, null];
    const html = render(<PendingCashouts accountAddress={USER} />);
    expect(html).toContain('Amount unavailable'); expect(html).not.toContain('0.00 USDC');
    expect(f.buttons.find(button => button.children === 'Recover USDC').isDisabled).toBe(true);
  });
  it('hides only a complete known-empty history, including authoritative zero recovery', async () => {
    f.rpc.multicall.mockResolvedValue([{ status: 'success', result: USER }, { status: 'success', result: 0n }, { status: 'success', result: USDC_BASE }]);
    const rows = await fetchOutstandingDeposits(USER);
    expect(rows).toHaveLength(0); expect(rows.coverage.status).toBe('complete');
    f.seed = [{ account: USER, scope: [USER, USER, f.auth.isPasskeyUser, f.auth.isAuthHydrated, f.auth.sessionGeneration].join(':'), rows, coverage: rows.coverage }, null];
    expect(render(<PendingCashouts accountAddress={USER} />)).toBe('');
  });
  it('retains last known records and marks them unavailable after a failed refresh', async () => {
    const element = <PendingCashouts accountAddress={USER} />;
    render(element); effects();
    await vi.waitFor(() => expect(render(element)).toContain('USDC awaiting recovery'));
    f.apollo.query.mockRejectedValue(new Error('source unavailable'));
    await f.buttons.find(button => button.children === 'Refresh cashouts').onClick();
    const html = render(element);
    expect(html).toContain('Some cashout details are unavailable');
    expect(html).toContain('Amount unavailable');
    expect(html).toContain('request 0x4444');
    expect(f.buttons.find(button => button.children === 'Recover USDC').isDisabled).toBe(true);
  });
  it('retains omitted prior records as unknown during partial reads, then removes them only after complete observation', async () => {
    const rows = await fetchOutstandingDeposits(USER);
    f.seed = [{ account: USER, scope: [USER, USER, f.auth.isPasskeyUser, f.auth.isAuthHydrated, f.auth.sessionGeneration].join(':'), rows, coverage: rows.coverage }, null];
    const element = <PendingCashouts accountAddress={USER} />; render(element);
    f.apollo.query.mockImplementation(cashoutGraph({ deposited: [cashoutCandidate({ ...request, createdTxHash: HASH }, 'DEPOSITED')] }));
    f.rpc.getTransactionReceipt.mockRejectedValue(new Error('receipt unavailable'));
    await f.buttons.find(button => button.children === 'Refresh cashouts').onClick();
    const partial = render(element);
    expect(partial).toContain('Some cashout details are unavailable'); expect(partial).toContain('request 0x4444');
    expect(partial).toContain('Amount unavailable');
    expect(f.buttons.find(button => button.children === 'Recover USDC').isDisabled).toBe(true);
    f.apollo.query.mockImplementation(cashoutGraph());
    await f.buttons.find(button => button.children === 'Refresh cashouts').onClick();
    expect(render(element)).toBe('');
  });
  it('suppresses an old poll callback and a late response after switching the selected account', async () => {
    const element = <PendingCashouts accountAddress={USER} />;
    render(element); effects();
    await vi.waitFor(() => expect(render(element)).toContain('USDC awaiting recovery'));
    const oldRefresh = f.buttons.find(button => button.children === 'Refresh cashouts').onClick;
    let finish;
    f.apollo.query.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = oldRefresh();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const other = `0x${'2'.repeat(40)}`;
    f.auth = { ...f.auth, accountAddress: other };
    expect(render(<PendingCashouts accountAddress={other} />)).not.toContain('USDC awaiting recovery');
    const calls = f.apollo.query.mock.calls.length;
    await oldRefresh(); expect(f.apollo.query).toHaveBeenCalledTimes(calls);
    finish({ data: { wallet: { pendingCashouts: [request], cashoutRequests: [] } } }); await pending;
    expect(render(<PendingCashouts accountAddress={other} />)).not.toContain('USDC awaiting recovery');
  });
  it('refuses a saved refresh callback after unmount without starting another source read', async () => {
    const element = <PendingCashouts accountAddress={USER} />;
    render(element); effects();
    await vi.waitFor(() => expect(render(element)).toContain('USDC awaiting recovery'));
    const refresh = f.buttons.find(button => button.children === 'Refresh cashouts').onClick;
    cleanup(); const calls = f.apollo.query.mock.calls.length;
    await refresh(); expect(f.apollo.query).toHaveBeenCalledTimes(calls);
  });
  it('renders initial loading and failed empty history as unavailable, and disables passkey recovery', async () => {
    const element = <PendingCashouts accountAddress={USER} />;
    expect(render(element)).toContain('Checking cashouts');
    f.apollo.query.mockRejectedValue(new Error('source unavailable')); effects();
    await vi.waitFor(() => expect(render(element)).toContain('Some cashout details are unavailable'));
    expect(render(element)).not.toContain('No cashouts');
    cleanup(); f.apollo.query.mockImplementation(cashoutGraph({ failed: [cashoutCandidate(request, 'FAILED')] }));
    const rows = await fetchOutstandingDeposits(USER);
    f.seed = [{ account: USER, scope: [USER, USER, f.auth.isPasskeyUser, f.auth.isAuthHydrated, f.auth.sessionGeneration].join(':'), rows, coverage: rows.coverage }, null]; f.auth.isPasskeyUser = true; f.seed[0].scope = [USER, USER, true, true, undefined].join(':');
    expect(render(element)).toContain('Recover unavailable');
    expect(f.buttons.some(button => button.children === 'Recover USDC')).toBe(false);
  });
});

describe('rendered cashout initiation balance evidence', () => {
  function modal(extra = {}) {
    f.seed = ['1', 'venmo', 'offline-payee', 'form', '', 0, null];
    return render(<CashOutModal isOpen token={token} accountAddress={USER} nativeBalance="1" coverage="complete" {...extra} />);
  }
  it('enables a valid observed amount and blocks unavailable or known-zero balances without falsezero', () => {
    modal(); expect(f.buttons.find(button => button.children === 'Cash Out').isDisabled).toBe(false);
    for (const extra of [{ token: { ...token, balance: null } }, { nativeBalance: null }, { nativeBalance: '0' }, { coverage: 'loading' }, { token: { ...token, balance: '0' } }]) {
      cleanup(); const html = modal(extra);
      expect(f.buttons.find(button => button.children === 'Cash Out').isDisabled).toBe(true);
      if (extra.token?.balance === null) { expect(html).toContain('Balance: Unavailable'); expect(html).not.toContain('Balance: 0'); }
    }
  });
  it('blocks unresolved or passkey identities before any external preparation', async () => {
    for (const auth of [{ isPasskeyUser: true }, { isAuthHydrated: false }, { accountAddress: `0x${'2'.repeat(40)}` }]) {
      cleanup(); f.auth = { ...f.auth, ...auth }; modal();
      const button = f.buttons.find(button => button.children === 'Cash Out');
      expect(button.isDisabled).toBe(true); await button.onClick();
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
