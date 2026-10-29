import { describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { executeCoreIntent } from '@/services/web3/core/coreIntent';
import { createScopeGuard, guardService, serviceScope } from '@/lib/services/runtimeScope';

const intent = {
  to: '0x1111111111111111111111111111111111111111',
  abi: ['function deposit() payable'],
  method: 'deposit',
  args: [],
  meta: { domain: 'treasury', action: 'deposit', value: '999', confirmations: 99 },
};

function host(execute = vi.fn().mockResolvedValue({ success: true })) {
  const contract = { interface: new ethers.utils.Interface(intent.abi) };
  return { factory: { createWritable: vi.fn(() => contract) }, manager: { execute }, contract };
}

describe('executeCoreIntent', () => {
  it('preserves exact native value, options, callback, promise and raw receipt', async () => {
    const receipt = { transactionHash: 'test-hash', logs: [{ data: '0x1234' }], status: 1 };
    const result = { success: true, receipt, txHash: receipt.transactionHash };
    const promise = Promise.resolve(result);
    const onStateChange = vi.fn();
    const { factory, manager, contract } = host(vi.fn(() => promise));
    const options = { value: 0, confirmations: 4, gasLimit: 7654321n, onStateChange, custom: { retained: true } };
    const value = '10000000000000000000000000000000000000001';
    const returned = executeCoreIntent(factory, manager, { ...intent, value }, options);
    expect(returned).toBe(promise);
    expect(await returned).toBe(result);
    expect(factory.createWritable).toHaveBeenCalledWith(intent.to, intent.abi);
    expect(manager.execute).toHaveBeenCalledWith(contract, intent.method, intent.args, { ...options, value });
    expect(options.value).toBe(0);
  });

  it('retains a host-supplied value on a zero-value intent and accepts an equal BigNumber', () => {
    const { factory, manager } = host();
    executeCoreIntent(factory, manager, intent, { value: ethers.BigNumber.from('12345678901234567890') });
    expect(manager.execute.mock.calls[0][3].value).toBe('12345678901234567890');
    executeCoreIntent(factory, manager, { ...intent, value: 7n }, { value: '0x07' });
    expect(manager.execute.mock.calls[1][3].value).toBe('7');
    expect(manager.execute.mock.calls[0][3].confirmations).toBeUndefined();
  });

  it.each([
    [{ ...intent, value: '7' }, { value: 8n }],
    [{ ...intent, value: '-1' }, {}],
    [{ ...intent, value: Number.MAX_SAFE_INTEGER + 1 }, {}],
    [intent, { value: '1.1' }],
  ])('rejects conflicting or malformed value before contract creation/send', (input, options) => {
    const { factory, manager } = host();
    expect(() => executeCoreIntent(factory, manager, input, options)).toThrow();
    expect(factory.createWritable).not.toHaveBeenCalled();
    expect(manager.execute).not.toHaveBeenCalled();
  });

  it('keeps the caller manager scope rejection and never substitutes a success result', async () => {
    let current = true;
    const staleError = new Error('The account or organization changed.');
    const execute = vi.fn(async (_contract, _method, _args, options) => {
      if (!current) throw staleError;
      options.onStateChange('pending');
      return { success: false, error: staleError };
    });
    const { factory, manager } = host(execute);
    const callback = vi.fn();
    const failed = await executeCoreIntent(factory, manager, intent, { onStateChange: callback });
    expect(failed).toEqual({ success: false, error: staleError });
    expect(callback).toHaveBeenCalledExactlyOnceWith('pending');
    current = false;
    await expect(executeCoreIntent(factory, manager, intent, { onStateChange: callback })).rejects.toBe(staleError);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it.each(['orgId', 'orgChainId', 'subgraphUrl', 'accountAddress'])('retains the actual runtime scope guard for a changed %s', key => {
    const initial = { orgId: 'org-a', orgChainId: 100, subgraphUrl: 'endpoint-a', accountAddress: intent.to, authType: 'passkey', isAuthenticated: true };
    const scope = serviceScope(initial);
    let current = scope;
    const { factory, manager } = host();
    const guarded = guardService(manager, createScopeGuard(scope, () => current));
    current = serviceScope({ ...initial, [key]: key === 'orgChainId' ? 42161 : 'changed' });
    expect(() => executeCoreIntent(factory, guarded, intent)).toThrow('Your account or organization changed');
    expect(manager.execute).not.toHaveBeenCalled();
  });
});
