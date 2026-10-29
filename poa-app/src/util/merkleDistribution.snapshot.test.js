import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient, custom, decodeFunctionData, encodeFunctionResult, multicall3Abi } from 'viem';
import { gnosis } from 'viem/chains';
import { PaymentManagerAbi } from '@poa-box/core/abis/PaymentManager';
import { buildDistributionTree, prepareDistributionSnapshot } from '@/util/merkleDistribution';

const address = n => `0x${n.toString(16).padStart(40, '0')}`;
const ORG = `0x${'ab'.repeat(32)}`, PM = address(2000), PT = address(2001), HASH = `0x${'cd'.repeat(32)}`;
const height = 60000000n;
export function distributionFixture(count = 3) {
  const holders = Array.from({ length: count }, (_, n) => ({ address: address(n + 1), participationTokenBalance: String(n + 1), membershipStatus: 'Active' }));
  const meta = { block: { number: Number(height), hash: HASH }, hasIndexingErrors: false };
  const apollo = { query: vi.fn(async ({ variables }) => ({ data: variables
    ? { _meta: meta, organization: { id: ORG, paymentManager: { id: PM }, participationToken: { id: PT }, users: holders } }
    : { _meta: meta } })) };
  const client = { request: vi.fn(async ({ method }) => method === 'eth_chainId' ? '0x64' : { number: `0x${height.toString(16)}`, hash: HASH }),
    readContract: vi.fn(() => { throw new Error('Unbatched eligibility read'); }),
    multicall: vi.fn(async ({ contracts }) => contracts.map(() => ({ status: 'success', result: false }))) };
  return { apollo, client, chainId: 100, orgId: ORG, holderContract: PT, paymentManager: PM,
    endpoint: 'https://index.invalid/graphql', rpcEndpoint: 'https://rpc.invalid', holders };
}
beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); })));
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe('fresh distribution preparation through real core allocation', () => {
  it('batches 65 holders in four calls at one checkpoint with at most three in flight', async () => {
    const input = distributionFixture(65);
    let active = 0, maximum = 0;
    input.client.multicall.mockImplementation(async ({ contracts, blockNumber }) => {
      expect(blockNumber).toBe(height); active++; maximum = Math.max(maximum, active);
      await Promise.resolve(); active--;
      return contracts.map(({ functionName, args }) => {
        expect(functionName).toBe('isOptedOut');
        return { status: 'success', result: args[0].toLowerCase() === address(1) };
      });
    });
    const result = await prepareDistributionSnapshot(input);
    expect(input.client.multicall.mock.calls.map(([call]) => call.contracts.length)).toEqual([20, 20, 20, 5]);
    expect(maximum).toBe(3); expect(input.client.readContract).not.toHaveBeenCalled();
    expect(result.evidence.optOutFacts.data).toHaveLength(65);
    expect(result.evidence.optOutFacts.source.block).toEqual({ number: String(height), hash: HASH });
    const tree = buildDistributionTree(result.holders, '9007199254740993123456789', result.evidence);
    expect(tree.claims[address(1)]).toBeUndefined();
    expect(Object.values(tree.claims).reduce((sum, row) => sum + BigInt(row.amount), 0n)).toBe(9007199254740993123456789n);
  });

  it('uses actual aggregate3 encoding for the lightweight production client', async () => {
    const input = distributionFixture(3), selectors = [];
    const wire = vi.fn(async ({ method, params }) => {
      if (method === 'eth_chainId') return '0x64';
      if (method === 'eth_getBlockByNumber') return { number: `0x${height.toString(16)}`, hash: HASH };
      expect(method).toBe('eth_call'); expect(params[1]).toBe(`0x${height.toString(16)}`);
      expect(params[0].to.toLowerCase()).toBe(gnosis.contracts.multicall3.address.toLowerCase());
      const decoded = decodeFunctionData({ abi: multicall3Abi, data: params[0].data });
      const result = decoded.args[0].map(call => {
        expect(call.target.toLowerCase()).toBe(PM);
        const read = decodeFunctionData({ abi: PaymentManagerAbi, data: call.callData });
        selectors.push(read.functionName); expect(read.args).toHaveLength(1);
        return { success: true, returnData: encodeFunctionResult({ abi: PaymentManagerAbi, functionName: 'isOptedOut', result: false }) };
      });
      return encodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', result });
    });
    input.client = createClient({ chain: { ...gnosis, contracts: undefined }, transport: custom({ request: wire }) });
    const snapshot = await prepareDistributionSnapshot(input);
    expect(selectors).toEqual(['isOptedOut', 'isOptedOut', 'isOptedOut']);
    expect(buildDistributionTree(snapshot.holders, '10', snapshot.evidence).totalDistributed).toBe('10');
    expect(wire.mock.calls.filter(([call]) => call.method === 'eth_call')).toHaveLength(1);
  });

  it.each(['failed', 'short', 'not-boolean'])('refuses %s batched eligibility before building claims', async kind => {
    const input = distributionFixture();
    input.client.multicall.mockResolvedValue(kind === 'short' ? [] : [{ status: kind === 'failed' ? 'failure' : 'success', result: 'false' }]);
    await expect(prepareDistributionSnapshot(input)).rejects.toThrow('eligibility unavailable');
  });

  it('keeps the holder cap and rejects changed checkpoint hashes instead of claiming completeness', async () => {
    await expect(prepareDistributionSnapshot(distributionFixture(1000))).rejects.toThrow('holders incomplete');
    const input = distributionFixture();
    input.client.request.mockImplementation(async ({ method }) => method === 'eth_chainId' ? '0x64'
      : { number: `0x${height.toString(16)}`, hash: input.client.multicall.mock.calls.length ? `0x${'ef'.repeat(32)}` : HASH });
    await expect(prepareDistributionSnapshot(input)).rejects.toThrow('checkpoint changed');
  });
});
