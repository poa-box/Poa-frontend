import { describe, expect, it, vi } from 'vitest';
import { NETWORKS } from '@/config/networks';
import { fetchChainInflows, fetchUsdSpotRate, readInflowTransferChunks } from '@/services/web3/domain/LandingInflowService';

const data = () => ({
  taskManagers: [{ id: `0x${'1'.repeat(40)}`, createdAtBlock: '10' }],
  paymentManagerContracts: [], executorContracts: [], paymasterHubContracts: [],
  payments: [], paymasterDepositEvents: [], solidarityEvents: [],
  _meta: { block: { number: 100, hash: null, timestamp: null }, hasIndexingErrors: false },
});
const response = (json) => ({ ok: true, json: async () => json });

describe('native deposit USD pricing', () => {
  it('reads a fresh public spot quote without rounding its decimal string', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ data: { base: 'ETH', currency: 'USD', amount: '2507.685' } }));
    expect(await fetchUsdSpotRate('ETH', fetcher)).toBe('2507.685');
    expect(fetcher).toHaveBeenCalledWith('https://api.coinbase.com/v2/prices/ETH-USD/spot', expect.objectContaining({ cache: 'no-store' }));
  });

  it('rejects failed, malformed, and wrong-currency quotes', async () => {
    const quote = { base: 'ETH', currency: 'USD', amount: '2507.685' };
    for (const invalid of [
      { ok: false }, response({}), response({ data: { ...quote, base: 'BTC' } }),
      response({ data: { ...quote, currency: 'EUR' } }), response({ data: { ...quote, amount: '0' } }),
      response({ data: { ...quote, amount: 'NaN' } }),
    ]) {
      await expect(fetchUsdSpotRate('ETH', vi.fn().mockResolvedValue(invalid))).rejects.toThrow('exchange rate unavailable');
    }
  });
});

describe('landing inflow source integrity', () => {
  it('pins token history to the indexed block and bounds requests without per-org RPC scans', async () => {
    const fetcher = inflowFetcher();
    expect(await fetchChainInflows(NETWORKS.gnosis, fetcher)).toEqual({});
    expect(fetcher).toHaveBeenCalledTimes(12);
    const requests = fetcher.mock.calls.map(([, options]) => JSON.parse(options.body));
    const filter = requests.find(request => request.method === 'eth_getLogs').params[0];
    expect([filter.fromBlock, filter.toBlock]).toEqual(['0xa', '0x64']);
    expect(filter.topics[1]).toBeNull();
    expect(filter.topics[2]).toHaveLength(1);
    expect(requests.filter(r => r.query?.includes('FetchHistoricalPotsPage'))).toHaveLength(3);
  });

  it('includes verified former hubs in the existing single Transfer query', async () => {
    const fetcher = inflowFetcher({ hub: true });
    expect(await fetchChainInflows(NETWORKS.gnosis, fetcher)).toEqual({});
    const requests = fetcher.mock.calls.map(([, options]) => JSON.parse(options.body));
    const logs = requests.filter(request => request.method === 'eth_getLogs');
    expect(logs).toHaveLength(1);
    expect(logs[0].params[0].fromBlock).toBe('0x5');
    expect(logs[0].params[0].topics[2]).toHaveLength(2);
    expect(requests.filter(request => request.method)).toHaveLength(4);
    expect(requests.filter(request => request.query?.includes('FetchIndexed')).every(request =>
      request.variables.fromBlock === '5' && request.variables.toBlock === '100' && request.variables.block.number === 100)).toBe(true);
  });

  it('covers a long indexed history with bounded singleton filters and honest contiguous chunks', async () => {
    const requests = []; let active = 0, maximum = 0;
    const rpc = vi.fn(async (_method, [filter]) => {
      requests.push(filter); maximum = Math.max(maximum, ++active);
      await Promise.resolve(); active--; return [];
    });
    const tokens = [{ address: `0x${'a'.repeat(40)}` }], contracts = [{ address: `0x${'b'.repeat(40)}` }, { address: `0x${'c'.repeat(40)}` }];
    const chunks = await readInflowTransferChunks({ rpc, tokens, contracts, fromBlock: '10', toBlock: '20000010' });
    expect(chunks.map(c => [c.fromBlock, c.toBlock])).toEqual([['10', '10000009'], ['10000010', '20000009'], ['20000010', '20000010']]);
    expect(requests).toHaveLength(6); expect(maximum).toBeLessThanOrEqual(4);
    expect(requests.every(f => typeof f.address === 'string' && typeof f.topics[2] === 'string'
      && BigInt(f.toBlock) - BigInt(f.fromBlock) < 10000000n)).toBe(true);
    rpc.mockRejectedValueOnce(new Error('One filtered range failed'));
    await expect(readInflowTransferChunks({ rpc, tokens, contracts, fromBlock: '10', toBlock: '20000010' })).rejects.toThrow('failed');
    const capped = vi.fn();
    await expect(readInflowTransferChunks({ rpc: capped, tokens, contracts, fromBlock: '10', toBlock: '400000000' })).rejects.toThrow('request limit');
    expect(capped).not.toHaveBeenCalled();
  });
  it('rejects a GraphQL error instead of displaying a zero', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ errors: [{ message: 'unavailable' }] }));
    await expect(fetchChainInflows(NETWORKS.gnosis, fetcher)).rejects.toThrow('rejected');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects indexing errors, absent native collections and mismatched page blocks', async () => {
    const badMeta = vi.fn().mockResolvedValue(response({ data: { _meta: { block: { number: 100 }, hasIndexingErrors: true } } }));
    await expect(fetchChainInflows(NETWORKS.gnosis, badMeta)).rejects.toThrow('index unavailable');
    expect(badMeta).toHaveBeenCalledTimes(1);
    for (const options of [{ nativeError: true }, { wrongNativeBlock: true }]) {
      const fetcher = inflowFetcher(options);
      await expect(fetchChainInflows(NETWORKS.gnosis, fetcher)).rejects.toThrow('incomplete');
      expect(fetcher.mock.calls.every(([, input]) => !JSON.parse(input.body).method)).toBe(true);
    }
  });

  it('rejects failed token history instead of exposing an incomplete total', async () => {
    const fetcher = inflowFetcher({ rpcError: 'eth_getLogs' });
    await expect(fetchChainInflows(NETWORKS.gnosis, fetcher)).rejects.toThrow('rejected');
  });
  it('rejects missing page proof, wrong RPC chain and missing deployment blocks', async () => {
    for (const options of [{ missingProof: true }, { rpcChain: '0xa4b1' }, { missingDeployment: true }]) {
      await expect(fetchChainInflows(NETWORKS.gnosis, inflowFetcher(options))).rejects.toThrow();
    }
  });

});

function inflowFetcher({ rpcError, missingProof, rpcChain = '0x64', missingDeployment, nativeError, wrongNativeBlock, hub = false } = {}) {
  return vi.fn(async (_url, options) => {
    const request = JSON.parse(options.body);
    if (request.method) {
      if (request.method === rpcError) return response({ error: { message: 'range exceeded' } });
      const result = request.method === 'eth_chainId' ? rpcChain : request.method === 'eth_getLogs' ? [] :
        { number: '0x64', hash: `0x${'a'.repeat(64)}` };
      return response({ result });
    }
    if (request.query.includes('FetchHistoricalPotsPage')) return response({ data: {
      taskManagers: [{ id: `0x${'1'.repeat(40)}`, createdAtBlock: missingDeployment ? undefined : '10', organization: { id: `0x${'2'.repeat(64)}` } }],
      paymentManagerContracts: [], executorContracts: [],
      ...(missingProof ? {} : { _meta: data()._meta }),
    } });
    if (request.query.includes('FetchPaymasterHubPotsPage')) return response({ data: { paymasterHubContracts: hub ? [{ id: `0x${'3'.repeat(40)}`, createdAtBlock: '5' }] : [], _meta: data()._meta } });
    if (request.query.includes('FetchIndexed')) return response({ data: { ...data(),
      ...(nativeError ? { solidarityEvents: undefined } : {}),
      ...(wrongNativeBlock ? { _meta: { block: { number: 101 } } } : {}) } });
    return response({ data: data() });
  });
}
