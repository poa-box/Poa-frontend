import { describe, expect, it, vi } from 'vitest';
import { createLazyBundler } from './lazyBundler';

describe('lazy bundler application interface', () => {
  it('stays truthy without loading and is not thenable or a general client proxy', async () => {
    const load = vi.fn();
    const client = createLazyBundler(load);
    expect(client).toBeTruthy();
    expect(await Promise.resolve(client)).toBe(client);
    expect(client.then).toBeUndefined();
    expect(client.request).toBeUndefined();
    expect(client.extend).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });

  it('initializes once for parallel operations and preserves arguments, results and this', async () => {
    let resolveClient;
    const realClient = { name: 'real client' };
    const methods = ['estimateUserOperationGas', 'getUserOperationGasPrice', 'sendUserOperation', 'waitForUserOperationReceipt'];
    methods.forEach((method) => {
      realClient[method] = vi.fn(function (...args) {
        expect(this).toBe(realClient);
        return { method, args, name: this.name };
      });
    });
    const load = vi.fn(() => new Promise((resolve) => { resolveClient = resolve; }));
    const client = createLazyBundler(load);
    const args = { chainId: 100, nonce: 2n, timeout: 120000 };
    const calls = methods.map((method) => client[method](args, 'extra'));
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    resolveClient(realClient);
    const results = await Promise.all(calls);
    expect(results.map((result) => result.method)).toEqual(methods);
    results.forEach((result) => expect(result.args).toEqual([args, 'extra']));
    await client.sendUserOperation(args);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('shares initialization rejection and retries on a later operation', async () => {
    const error = new Error('Chunk download failed');
    const realClient = { sendUserOperation: vi.fn(async () => '0xhash') };
    const load = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(realClient);
    const client = createLazyBundler(load);
    const attempts = await Promise.allSettled([client.sendUserOperation({}), client.getUserOperationGasPrice()]);
    expect(attempts).toEqual([{ status: 'rejected', reason: error }, { status: 'rejected', reason: error }]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(await client.sendUserOperation({})).toBe('0xhash');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('also retries synchronous initialization failures', async () => {
    const error = new Error('Client construction failed');
    const load = vi.fn().mockImplementationOnce(() => { throw error; }).mockReturnValue({ getUserOperationGasPrice: async () => 3n });
    const client = createLazyBundler(load);
    await expect(client.getUserOperationGasPrice()).rejects.toBe(error);
    expect(await client.getUserOperationGasPrice()).toBe(3n);
  });

  it('preserves operation rejection and timeout handling without recreating the client', async () => {
    const timeout = new Error('Timed out waiting for receipt');
    const realClient = { waitForUserOperationReceipt: vi.fn().mockRejectedValueOnce(timeout).mockResolvedValue({ success: true }) };
    const load = vi.fn(() => realClient);
    const client = createLazyBundler(load);
    const options = { hash: '0xhash', timeout: 120000 };
    await expect(client.waitForUserOperationReceipt(options)).rejects.toBe(timeout);
    expect(await client.waitForUserOperationReceipt(options)).toEqual({ success: true });
    expect(realClient.waitForUserOperationReceipt).toHaveBeenCalledWith(options);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
