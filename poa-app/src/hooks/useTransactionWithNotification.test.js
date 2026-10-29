import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { CliError, NetworkError } from '@poa-box/core/errors';
import { buildCreateModule } from '@poa-box/core/tx/education';
import { requireRawUint } from '@poa-box/core/amounts';
import { buildCreateTaskRaw } from '@poa-box/core/tx/task';

const fixture = vi.hoisted(() => ({ slots: [], cursor: 0, effects: [], auth: {}, po: {}, add: vi.fn(), update: vi.fn(), emit: vi.fn(), wait: vi.fn() }));
vi.mock('react', async original => {
  const actual = await original();
  const memo = (compute, deps) => {
    const index = fixture.cursor++;
    const previous = fixture.slots[index];
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) fixture.slots[index] = { deps, value: compute() };
    return fixture.slots[index].value;
  };
  return { ...actual, useRef: value => { const index = fixture.cursor++; return fixture.slots[index] ||= { current: value }; },
    useMemo: memo, useCallback: (callback, deps) => memo(() => callback, deps),
    useEffect: (effect, deps) => memo(() => { fixture.effects.push(effect); }, deps),
  };
});
vi.mock('@/context/authState', () => ({ useAuth: () => fixture.auth }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => fixture.po }));
vi.mock('@/context/NotificationContext', () => ({ useNotification: () => ({ addNotification: fixture.add, updateNotification: fixture.update }) }));
vi.mock('@/context/RefreshContext', () => ({ useRefreshEmit: () => ({ emit: fixture.emit }) }));
vi.mock('@/util/waitForSubgraph', () => ({ waitForSubgraphBlock: (...args) => fixture.wait(...args) }));
import { useTransactionWithNotification } from '@/hooks/useTransactionWithNotification';
import { transactionMemberMessage } from '@/hooks/transactionNotificationLifecycle';
const ACCOUNT = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const options = { pendingMessage: 'Saving...', successMessage: 'Saved!', refreshEvent: 'user:profile_updated' };
const raw = () => ({ success: true, blockNumber: 42, txHash: 'synthetic-hash', receipt: { logs: [] } });
const Harness = () => { fixture.cursor = 0; const hook = useTransactionWithNotification(); for (const effect of fixture.effects.splice(0)) effect(); return hook; };
const drain = async () => { await Promise.resolve(); await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => {
  vi.clearAllMocks(); fixture.slots = []; fixture.effects = [];
  fixture.auth = { accountAddress: ACCOUNT, authType: 'passkey', isAuthenticated: true, isAuthHydrated: true, sessionGeneration: 1 };
  fixture.po = { orgId: 'org-a', orgChainId: 100, subgraphUrl: 'https://org.test' };
  fixture.add.mockReturnValue('pending-1'); fixture.wait.mockResolvedValue();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
});
afterEach(() => vi.unstubAllGlobals());
describe('notification identity and source lifecycle', () => {
  it('returns the exact manager result before indexing; succeeds and emits once after the bounded wait', async () => {
    const wait = deferred(); fixture.wait.mockReturnValue(wait.promise);
    const result = raw();
    expect(await Harness().executeWithNotification(async () => result, options)).toBe(result);
    expect(fixture.wait).toHaveBeenCalledExactlyOnceWith('https://org.test', 42);
    expect(fixture.update).not.toHaveBeenCalled(); expect(fixture.emit).not.toHaveBeenCalled();
    wait.resolve(); await drain();
    expect(fixture.update).toHaveBeenCalledExactlyOnceWith('pending-1', 'Saved!', 'success');
    expect(fixture.emit).toHaveBeenCalledExactlyOnceWith(options.refreshEvent, { transactionHash: result.txHash });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['account', 'auth', 'org', 'chain', 'endpoint', 'generation'])('rejects a captured callback after %s changes before it starts', async mode => {
    const old = Harness();
    if (mode === 'account') fixture.auth = { ...fixture.auth, accountAddress: OTHER };
    if (mode === 'auth') fixture.auth = { ...fixture.auth, authType: 'eoa' };
    if (mode === 'generation') fixture.auth = { ...fixture.auth, sessionGeneration: 2 };
    if (mode === 'org') fixture.po = { ...fixture.po, orgId: 'org-b' };
    if (mode === 'chain') fixture.po = { ...fixture.po, orgChainId: 42161 };
    if (mode === 'endpoint') fixture.po = { ...fixture.po, subgraphUrl: 'https://other.test' };
    Harness(); const send = vi.fn(async () => raw());
    expect(await old.executeWithNotification(send, options)).toMatchObject({ success: false, error: { category: 'stale_scope' } });
    expect(send).not.toHaveBeenCalled(); expect(fixture.add).not.toHaveBeenCalled();
  });
  it.each(['during-send', 'during-indexing', 'synchronous-session-change'])('retains original status without refreshing the newly selected page after %s', async when => {
    const gate = deferred(); const result = raw(); let current = true;
    fixture.auth = { ...fixture.auth, isSessionCurrent: () => current };
    if (when === 'during-indexing') fixture.wait.mockReturnValue(gate.promise);
    const hook = Harness();
    const completion = hook.executeWithNotification(async () => {
      if (when === 'during-send') await gate.promise;
      if (when === 'synchronous-session-change') current = false;
      return result;
    }, options);
    if (when === 'during-indexing') await completion;
    fixture.auth = { ...fixture.auth, accountAddress: OTHER, sessionGeneration: 2 }; Harness();
    gate.resolve(); expect(await completion).toBe(result); await drain();
    expect(fixture.emit).not.toHaveBeenCalled();
    expect(fixture.update).toHaveBeenCalledWith('pending-1', expect.stringContaining('earlier action'), 'error');
    expect(fixture.update.mock.calls.some(call => call[2] === 'success')).toBe(false);
  });
  it('permits a callback from the unresolved island once actual identity is restored, ignoring account hints', async () => {
    const resolved = fixture.auth;
    fixture.auth = { isAuthHydrated: false, accountHint: { address: OTHER } };
    const initial = Harness();
    const send = vi.fn(async () => raw());
    expect(await initial.executeWithNotification(send, options)).toMatchObject({ success: false });
    fixture.auth = resolved; Harness();
    expect((await initial.executeWithNotification(send, options)).success).toBe(true);
    await drain(); expect(send).toHaveBeenCalledOnce(); expect(fixture.emit).toHaveBeenCalledOnce();
  });
  it('uses the selected registration endpoint/chain instead of wallet or organization source', async () => {
    let source;
    const result = raw();
    expect(await Harness().executeWithNotification(async () => { source = { endpoint: 'https://registered.test', chainId: 42161, account: ACCOUNT }; return result; },
      { ...options, writeSource: () => source, refreshData: { address: ACCOUNT, chainId: 100 } })).toBe(result);
    await drain();
    expect(fixture.wait).toHaveBeenCalledExactlyOnceWith('https://registered.test', 42);
    expect(fixture.emit).toHaveBeenCalledWith(options.refreshEvent, { address: ACCOUNT, transactionHash: result.txHash, chainId: 42161, subgraphUrl: 'https://registered.test' });
  });
  it('passes an explicit source through the existing handler convenience API', async () => {
    const service = vi.fn(async () => raw());
    const source = { endpoint: 'https://registered.test', chainId: 42161, account: ACCOUNT };
    const handler = Harness().createHandler(service, { ...options, writeSource: source });
    const result = await handler('member'); await drain();
    expect(result.success).toBe(true); expect(service).toHaveBeenCalledExactlyOnceWith('member');
    expect(fixture.wait).toHaveBeenCalledExactlyOnceWith(source.endpoint, 42);
    expect(fixture.emit).toHaveBeenCalledWith(options.refreshEvent, expect.objectContaining({ chainId: 42161, subgraphUrl: source.endpoint }));
  });
  it.each([undefined, { endpoint: 'https://registered.test' }, { endpoint: 'https://registered.test', chainId: 100, account: OTHER }])('keeps an invalid explicitly supplied source unresolved without polling a default', async source => {
    expect((await Harness().executeWithNotification(async () => raw(), { ...options, writeSource: () => source })).success).toBe(true);
    await drain(); expect(fixture.wait).not.toHaveBeenCalled(); expect(fixture.emit).not.toHaveBeenCalled();
    expect(fixture.update).toHaveBeenCalledWith('pending-1', expect.stringContaining('confirmed'), 'error');
  });
  it('preserves unknown submission errors and parsed contract reasons over generic caller copy', async () => {
    const unknown = { success: false, error: { category: 'submission_unknown', userMessage: 'Check its status before trying again.' } };
    expect(await Harness().executeWithNotification(async () => unknown, { ...options, errorMessage: 'Failed to save' })).toBe(unknown);
    expect(fixture.update).toHaveBeenLastCalledWith('pending-1', unknown.error.userMessage, 'error');
    const reason = { success: false, error: { category: 'contract_revert', userMessage: 'This task requires an application before claiming.' } };
    expect(await Harness().executeWithNotification(async () => reason, { ...options, errorMessage: 'Failed to save' })).toBe(reason);
    expect(fixture.update).toHaveBeenLastCalledWith('pending-1', reason.error.userMessage, 'error');
    expect(fixture.emit).not.toHaveBeenCalled();
  });
  it('maps real core pre-manager validation without invoking transport or losing developer error identity', async () => {
    let original;
    const send = vi.fn();
    const result = await Harness().executeWithNotification(async () => {
      try { buildCreateModule({ educationAddress: OTHER, payout: 0, correctAnswer: 0, module: 'details' }); }
      catch (error) { original = error; throw error; }
      await send();
    }, options);
    expect(result.error).toBe(original); expect(original).toBeInstanceOf(CliError);
    expect(fixture.update).toHaveBeenLastCalledWith('pending-1', 'Enter a reward amount greater than zero.', 'error');
    expect(send).not.toHaveBeenCalled(); expect(fixture.emit).not.toHaveBeenCalled();
  });
});
describe('member error boundary', () => {
  it('maps exact amount and quiz validations to actionable copy while preserving unrelated useful messages', () => {
    let error; try { requireRawUint(Number.MAX_SAFE_INTEGER + 1); } catch (cause) { error = cause; }
    expect(transactionMemberMessage(error)).toContain('valid amount');
    expect(transactionMemberMessage(new CliError('--correct-answer must be an integer 0-255 (uint8)'))).toBe('Choose a valid answer for each question.');
    expect(transactionMemberMessage(new Error('Choose at least one member.'))).toBe('Choose at least one member.');
    expect(transactionMemberMessage(new CliError('Unknown --new-root bytes32'))).not.toMatch(/--|bytes32/);
    expect(transactionMemberMessage(new NetworkError('RPC endpoint missing'))).toContain('network is unavailable');
    try { buildCreateTaskRaw({ features: { deadlines: false } }); } catch (cause) { error = cause; }
    expect(transactionMemberMessage(error)).not.toMatch(/TaskManager|signature/);
    expect(transactionMemberMessage(new TypeError("Cannot read properties of undefined (reading 'deadlines')"))).toContain('could not prepare this action');
  });
});
