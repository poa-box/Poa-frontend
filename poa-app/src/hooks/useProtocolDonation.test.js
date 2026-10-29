import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ slots: [], cursor: 0, effects: [], auth: {}, walletChain: 100,
  factory: vi.fn(), donate: vi.fn(), pending: vi.fn(), update: vi.fn(), remove: vi.fn(), emit: vi.fn(), switchChain: vi.fn(), client: vi.fn(), success: vi.fn() }));
vi.mock('react', async original => {
  const actual = await original();
  return { ...actual,
    useRef: value => { const index = fixture.cursor++; return fixture.slots[index] ||= { current: value }; },
    useState: value => { const index = fixture.cursor++; fixture.slots[index] ||= { value }; return [fixture.slots[index].value, next => { fixture.slots[index].value = next; }]; },
    useCallback: (fn, deps) => { const index = fixture.cursor++, previous = fixture.slots[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) fixture.slots[index] = { deps, fn };
      return fixture.slots[index].fn; },
    useEffect: (fn, deps) => { const index = fixture.cursor++, previous = fixture.slots[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) fixture.effects.push(() => {
        previous?.cleanup?.(); fixture.slots[index] = { deps, cleanup: fn() };
      }); },
  };
});
vi.mock('@/context/authState', () => ({ useAuth: () => fixture.auth }));
vi.mock('@/context/WalletContext', () => ({ useAccount: () => ({ chain: { id: fixture.walletChain } }), useSwitchChain: () => ({ switchChainAsync: fixture.switchChain }),
  useConfig: () => ({}), getConnectorClient: (...args) => fixture.client(...args), clientToSigner: client => client }));
vi.mock('@/context/NotificationContext', () => ({ useNotification: () => ({ addNotification: fixture.pending, updateNotification: fixture.update, removeNotification: fixture.remove }) }));
vi.mock('@/context/RefreshContext', () => ({ RefreshEvent: { SOLIDARITY_DONATED: 'protocol:solidarity_donated' }, useRefreshEmit: () => ({ emit: fixture.emit }) }));
vi.mock('@/services/web3/domain/ProtocolDonationService', () => ({ createProtocolDonationService: (...args) => fixture.factory(...args) }));
import { useProtocolDonation } from '@/hooks/useProtocolDonation';
const chain = { chainId: 100, infrastructure: { paymasterHubProxy: 'hub' }, source: { endpoint: 'https://donate.invalid', contract: 'hub' } };
const DonationHarness = (isOpen = true) => { fixture.cursor = 0; const result = useProtocolDonation(chain, isOpen, fixture.success); for (const effect of fixture.effects.splice(0)) effect(); return result; };
const pending = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => {
  vi.clearAllMocks(); fixture.slots = []; fixture.cursor = 0; fixture.effects = []; fixture.walletChain = 100;
  fixture.auth = { isAuthenticated: true, accountAddress: 'alice', isPasskeyUser: false, isAuthHydrated: true, sessionGeneration: 1, isSessionCurrent: () => true };
  fixture.factory.mockResolvedValue({ donate: fixture.donate }); fixture.pending.mockReturnValue('pending-id');
  fixture.donate.mockResolvedValue({ success: true }); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
});
afterEach(() => vi.unstubAllGlobals());
describe('donation action lifecycle and scoped notifications', () => {
  it('returns the manager result unchanged, notifies and closes only on confirmed success', async () => {
    const result = { success: true, txHash: 'mock-hash', receipt: { status: 1 } }; fixture.donate.mockResolvedValue(result);
    expect(await DonationHarness().donate('9007199254740993123456789')).toBe(result);
    expect(fixture.donate).toHaveBeenCalledExactlyOnceWith('9007199254740993123456789');
    expect(fixture.update).toHaveBeenCalledExactlyOnceWith('pending-id', 'Donation received. Thank you!', 'success');
    expect(fixture.emit).toHaveBeenCalledExactlyOnceWith('protocol:solidarity_donated', expect.objectContaining({ chainId: 100, endpoint: chain.source.endpoint, address: 'alice', transactionHash: 'mock-hash' }));
    expect(fixture.success).toHaveBeenCalledExactlyOnceWith(result); expect(DonationHarness().isSending).toBe(false); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['user_rejected', 'contract_revert', 'submission_unknown'])('preserves %s failure and keeps the draft open', async category => {
    const result = { success: false, error: { category, userMessage: 'Please try again.' } }; fixture.donate.mockResolvedValue(result);
    expect(await DonationHarness().donate('1')).toBe(result); expect(fixture.success).not.toHaveBeenCalled();
    expect(fixture.emit).not.toHaveBeenCalled();
    expect(fixture.update).toHaveBeenCalledWith('pending-id', 'Please try again.', 'error');
  });
  it('maps wallet cancellation without exposing raw exception text or closing', async () => {
    fixture.walletChain = 42161;
    fixture.switchChain.mockRejectedValue({ code: 4001, message: 'private transport internals' });
    fixture.factory.mockImplementation(async config => { await config.getSigner(); return { donate: fixture.donate }; });
    expect((await DonationHarness().donate('1')).success).toBe(false);
    expect(fixture.switchChain).toHaveBeenCalledWith({ chainId: 100 });
    expect(fixture.client).not.toHaveBeenCalled(); expect(fixture.donate).not.toHaveBeenCalled(); expect(fixture.success).not.toHaveBeenCalled();
    expect(fixture.update.mock.calls[0][1]).not.toContain('private');
  });
  it('suppresses stale completion/notification after account restoration and rejects saved callbacks before acquiring services', async () => {
    const request = pending(); fixture.donate.mockReturnValue(request.promise);
    const old = DonationHarness(); const sending = old.donate('1');
    await vi.waitFor(() => expect(fixture.donate).toHaveBeenCalledOnce());
    fixture.auth = { ...fixture.auth, accountAddress: 'bob', sessionGeneration: 2 }; expect(DonationHarness().isSending).toBe(false);
    expect(fixture.remove).toHaveBeenCalledExactlyOnceWith('pending-id');
    await expect(old.donate('1')).rejects.toThrow('changed');
    request.resolve({ success: true }); await sending;
    expect(fixture.update).not.toHaveBeenCalled(); expect(fixture.success).not.toHaveBeenCalled();
    expect(fixture.emit).not.toHaveBeenCalled();
    expect(fixture.factory).toHaveBeenCalledOnce();
  });
  it('prevents double submission, closes the EOA-only gate during hydration and invalidates closed modals', async () => {
    const request = pending(); fixture.donate.mockReturnValue(request.promise);
    const action = DonationHarness(), first = action.donate('1');
    await action.donate('1'); expect(fixture.pending).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(fixture.donate).toHaveBeenCalledOnce());
    DonationHarness(false); request.resolve({ success: true }); await first; expect(fixture.success).not.toHaveBeenCalled();
    fixture.auth.isPasskeyUser = true; expect(DonationHarness().canDonate).toBe(false);
    await expect(DonationHarness().donate('1')).rejects.toThrow();
    fixture.auth.isPasskeyUser = false; fixture.auth.isAuthHydrated = false; expect(DonationHarness().canDonate).toBe(false);
  });
});
