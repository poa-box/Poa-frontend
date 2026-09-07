import { describe, expect, it, vi } from 'vitest';
import { createScopeGuard, guardService, serviceScope } from './runtimeScope';

const account = { orgId: 'org-a', orgChainId: 100, subgraphUrl: 'https://org-a', accountAddress: '0xABC', authType: 'passkey', isAuthenticated: true };

describe('service runtime scope', () => {
  it('normalizes address case while isolating org, chain, endpoint and account identity', () => {
    const scope = serviceScope(account);
    expect(serviceScope({ ...account, accountAddress: '0xabc' })).toBe(scope);
    for (const change of [
      { orgId: 'org-b' }, { orgChainId: 42161 }, { subgraphUrl: 'https://org-b' },
      { accountAddress: '0xDEF' }, { authType: 'eoa' }, { isAuthenticated: false },
    ]) expect(serviceScope({ ...account, ...change })).not.toBe(scope);
  });

  it('rejects captured actions immediately when the scope changes, without waiting for publication', () => {
    const scope = serviceScope(account);
    let current = scope;
    const write = vi.fn(() => 'submitted');
    const service = guardService({ write }, createScopeGuard(scope, () => current));
    const captured = service.write;
    expect(captured()).toBe('submitted');
    current = serviceScope({ ...account, orgId: 'org-b' });
    expect(() => captured()).toThrow('Your account or organization changed');
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('allows an already submitted operation to finish after navigation', async () => {
    const scope = serviceScope(account);
    let current = scope;
    let finish;
    const pending = new Promise((resolve) => { finish = resolve; });
    const service = guardService({ write: () => pending }, createScopeGuard(scope, () => current));
    const submitted = service.write();
    current = serviceScope({ ...account, accountAddress: '0xDEF' });
    finish({ success: true, txHash: 'confirmed' });
    await expect(submitted).resolves.toEqual({ success: true, txHash: 'confirmed' });
  });

  it('retains class method receiver, stable callback identity, nulls and parsed user messages', () => {
    class Service { constructor() { this.value = 7; } read() { return this.value; } }
    let current = 'active';
    const guard = createScopeGuard('active', () => current);
    const service = guardService(new Service(), guard);
    expect(service.read()).toBe(7);
    expect(service.read).toBe(service.read);
    expect(guardService(null, guard)).toBeNull();
    current = null;
    try { service.read(); } catch (error) { expect(error.userMessage).toBe(error.message); }
  });
});
