import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeFunctionResult } from 'viem';
import { createPublicClientForChain } from '@/services/web3/utils/publicChainClient';
import { DEFAULT_DEPLOY_CHAIN_ID, DEFAULT_CHAIN_ID, getNetworkByChainId } from '@/config/networks';

const rpc = vi.hoisted(() => ({ request: vi.fn(), urls: [] }));
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    http: (url) => {
      rpc.urls.push(url);
      return actual.custom({ request: rpc.request }, { retryCount: 0 });
    },
  };
});
const address = '0x1111111111111111111111111111111111111111';
const abi = [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address', name: 'owner' }], outputs: [{ type: 'uint256' }] }];

beforeEach(() => { rpc.request.mockReset(); rpc.urls.length = 0; });

describe('minimal public chain client', () => {
  it.each([DEFAULT_DEPLOY_CHAIN_ID, DEFAULT_CHAIN_ID])('routes chain %s through its configured RPC and preserves client chain metadata', async (chainId) => {
    rpc.request.mockResolvedValue('0x2a');
    const client = createPublicClientForChain(chainId);
    expect(client.chain.id).toBe(chainId);
    expect(client.chain.nativeCurrency).toEqual(getNetworkByChainId(chainId).nativeCurrency);
    expect(rpc.urls).toEqual([getNetworkByChainId(chainId).rpcUrl]);
    expect(await client.getBalance({ address, blockNumber: 123n })).toBe(42n);
    expect(rpc.request.mock.calls[0][0]).toEqual({ method: 'eth_getBalance', params: [address, '0x7b'] });
  });

  it('encodes readContract arguments, forwards call options and decodes a bigint', async () => {
    rpc.request.mockResolvedValue(encodeFunctionResult({ abi, functionName: 'balanceOf', result: 1234567890123456789n }));
    const client = createPublicClientForChain(DEFAULT_DEPLOY_CHAIN_ID);
    expect(await client.readContract({ address, abi, functionName: 'balanceOf', args: [address], blockTag: 'pending' })).toBe(1234567890123456789n);
    const request = rpc.request.mock.calls[0][0];
    expect(request.method).toBe('eth_call');
    expect(request.params[0].to).toBe(address);
    expect(request.params[0].data).toBe(`0x70a08231${address.slice(2).padStart(64, '0')}`);
    expect(request.params[1]).toBe('pending');
  });

  it('preserves viem contract error wrapping instead of converting reverts to zero', async () => {
    rpc.request.mockRejectedValue({ code: 3, message: 'execution reverted', data: '0x' });
    const client = createPublicClientForChain(DEFAULT_DEPLOY_CHAIN_ID);
    await expect(client.readContract({ address, abi, functionName: 'balanceOf', args: [address] })).rejects.toMatchObject({ name: 'ContractFunctionExecutionError', functionName: 'balanceOf' });
  });

  it('reads a checkpoint block through the configured RPC using viem bigint conversion', async () => {
    rpc.request.mockResolvedValue('0x1234');
    const client = createPublicClientForChain(DEFAULT_DEPLOY_CHAIN_ID);
    expect(await client.getBlockNumber({ cacheTime: 0 })).toBe(4660n);
    expect(rpc.request.mock.calls[0][0]).toEqual({ method: 'eth_blockNumber' });
  });

  it('preserves null for an unknown chain without creating transport', () => {
    expect(createPublicClientForChain(-1)).toBeNull();
    expect(rpc.urls).toEqual([]);
    expect(rpc.request).not.toHaveBeenCalled();
  });
});
