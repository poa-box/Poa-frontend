import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertWalletIdentity, createWalletRuntimeGate, walletIdentity } from './runtimeGate';
afterEach(() => vi.useRealTimers());
const account = (address = '0xabc', uid = 'wallet-a') => ({ account: { address, connector: { uid } } });
describe('wallet runtime readiness gate', () => {
  it('settles concurrent intents with the actual snapshot', async () => {
    let current; const request = vi.fn();
    const gate = createWalletRuntimeGate({ readCurrent: () => current, request });
    const first = gate.wait(); const second = gate.wait();
    current = account(); gate.publish(current);
    expect(await first).toBe(current); expect(await second).toBe(current);
    expect(await gate.wait()).toBe(current); expect(request).toHaveBeenCalledTimes(2);
  });
  it('registers before requesting so synchronous publication cannot strand a click', async () => {
    const snapshot = account();
    const gate = createWalletRuntimeGate({ readCurrent: () => null, request: () => gate.publish(snapshot) });
    expect(await gate.wait()).toBe(snapshot);
  });
  it('rejects failures promptly and permits retry without replaying failed intents', async () => {
    const gate = createWalletRuntimeGate({ readCurrent: () => null, request() {} });
    const failure = new Error('download failed');
    const old = expect(gate.wait()).rejects.toBe(failure); gate.fail(failure); await old;
    await expect(gate.wait()).rejects.toBe(failure);
    gate.reset(); const retry = gate.wait(); gate.publish(account()); expect(await retry).toEqual(account());
  });
  it('cancels an intent without cancelling other readers', async () => {
    const gate = createWalletRuntimeGate({ readCurrent: () => null, request() {} });
    const controller = new AbortController();
    const cancelled = expect(gate.wait({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    const other = gate.wait(); controller.abort(); await cancelled;
    gate.publish(account()); expect(await other).toEqual(account());
    await expect(gate.wait({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('times out a missing island and allows a later fresh attempt', async () => {
    vi.useFakeTimers();
    const gate = createWalletRuntimeGate({ readCurrent: () => null, request() {}, timeoutMs: 50 });
    const failed = expect(gate.wait()).rejects.toThrow('still loading');
    await vi.advanceTimersByTimeAsync(50); await failed;
    const fresh = gate.wait(); gate.publish(account()); expect(await fresh).toEqual(account());
  });
  it('rejects another account/connector while permitting chain changes', () => {
    const scope = walletIdentity(account());
    expect(() => assertWalletIdentity(scope, account('0xABC'))).not.toThrow();
    expect(() => assertWalletIdentity(scope, { ...account(), chainId: 100 })).not.toThrow();
    expect(() => assertWalletIdentity(scope, account('0xdef'))).toThrow('account changed');
    expect(() => assertWalletIdentity(scope, account('0xabc', 'wallet-b'))).toThrow('account changed');
    expect(() => assertWalletIdentity(scope, null)).toThrow('account changed');
  });
});
