import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ slots: [], cursor: 0, effects: [], context: {}, client: null, apollo: null, create: vi.fn() }));
vi.mock('react', async original => {
  const actual = await original();
  const memo = (fn, deps) => { const index = f.cursor++, previous = f.slots[index];
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) f.slots[index] = { deps, value: fn() };
    return f.slots[index].value;
  };
  return { ...actual,
    useRef: initial => { const index = f.cursor++; return f.slots[index] ||= { current: initial }; },
    useState: initial => { const index = f.cursor++; f.slots[index] ||= { value: initial };
      return [f.slots[index].value, next => { f.slots[index].value = next; }]; },
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect: (fn, deps) => { const index = f.cursor++, previous = f.slots[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) f.effects.push(() => {
        previous?.cleanup?.(); f.slots[index] = { deps, cleanup: fn() };
      });
    },
  };
});
vi.mock('@/context/POContext', () => ({ usePOContext: () => f.context }));
vi.mock('@/context/RefreshContext', () => ({ RefreshEvent: {}, useRefreshSubscription: () => {} }));
vi.mock('@/services/web3/utils/publicChainClient', () => ({ createPublicClientForChain: (...args) => { f.create(...args); return f.client; } }));
vi.mock('@/util/apolloClient', () => ({ getClient: () => f.apollo }));
import { createClient, custom, decodeFunctionData, encodeFunctionResult, multicall3Abi } from 'viem';
import { readContract } from 'viem/actions';
import { gnosis } from 'viem/chains';
import { PaymentManagerAbi } from '@poa-box/core/abis/PaymentManager';
import { ERC20Abi } from '@poa-box/core/abis/ERC20';
import { readOrgPotBalances, useOrgPotBalances } from '@/hooks/useOrgPotBalances';
import { paymentManagerAvailability } from '@/lib/voting/treasuryBatches';
const ORG = `0x${'1'.repeat(64)}`, PM = `0x${'2'.repeat(40)}`, TOKEN = `0x${'3'.repeat(40)}`, EXEC = `0x${'4'.repeat(40)}`;
const HASH = `0x${'5'.repeat(64)}`, ROOT = `0x${'6'.repeat(64)}`;
const network = { chainId: 100, rpcUrl: 'https://rpc.invalid', subgraphUrl: 'https://graph.invalid' };
const meta = { block: { number: 100, hash: HASH }, hasIndexingErrors: false };
function fixture({ count = 1n, failedId, failedBatch } = {}) {
  const client = {
    request: vi.fn(async ({ method }) => method === 'eth_chainId' ? '0x64' : { number: '0x64', hash: HASH }),
    getBalance: vi.fn(async () => 70n),
    readContract: vi.fn(async ({ functionName }) => {
      if (functionName === 'distributionCounter') return count;
      if (functionName === 'balanceOf') return 70n;
      throw new Error('Individual round RPC forbidden');
    }),
    multicall: vi.fn(async ({ contracts }) => {
      if (contracts[0].args[0] === failedBatch) throw new Error('batch unavailable');
      return contracts.map(({ args }) => args[0] === failedId ? { status: 'failure', error: new Error('round unavailable') }
        : { status: 'success', result: [TOKEN, 100n, 10n, ROOT, 100n, false] });
    }),
  };
  const apollo = { query: vi.fn(async ({ query }) => ({ data: query.loc.source.body.includes('FetchDistributionsPage') ? {
    _meta: meta, organization: { id: ORG, paymentManager: { id: PM, organization: { id: ORG } } },
    distributions: [{ id: `${PM}-1`, distributionId: '1', payoutToken: TOKEN, totalAmount: '100', totalClaimed: '100',
      checkpointBlock: '10', merkleRoot: ROOT, createdAtBlock: '20', status: 'Active', paymentManager: { id: PM, organization: { id: ORG } } }],
  } : { _meta: meta } })) };
  return { client, apollo, network, orgId: ORG, token: TOKEN, decimals: 18, executor: EXEC, paymentManager: PM };
}
function PotHarness(options = { token: TOKEN }) { f.cursor = 0; return useOrgPotBalances(options); }
function effects() { for (const effect of f.effects.splice(0)) effect(); }
function cleanup() { for (const slot of f.slots) slot?.cleanup?.(); }
beforeEach(() => {
  f.slots = []; f.cursor = 0; f.effects = []; vi.clearAllMocks();
  f.context = { orgId: ORG, subgraphUrl: network.subgraphUrl, orgChainId: 100, executorContractAddress: EXEC, paymentManagerAddress: PM };
  const input = fixture(); f.client = input.client; f.apollo = input.apollo;
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('canonical complete planning with batched same-block round IO', () => {
  it('batches all 50 authoritative round IDs in three calls, without individual round requests', async () => {
    const input = fixture({ count: 50n }), result = await readOrgPotBalances(input);
    expect(result.coverage.status).toBe('complete'); expect(result.distributions).toHaveLength(50);
    const calls = input.client.multicall.mock.calls.map(([call]) => call);
    expect(calls.map(call => call.contracts.length)).toEqual([20, 20, 10]);
    expect(calls.flatMap(call => call.contracts.map(contract => contract.args[0]))).toEqual(Array.from({ length: 50 }, (_, i) => BigInt(i + 1)));
    calls.forEach(call => { expect(call.blockNumber).toBe(100n); expect(call.allowFailure).toBe(true); });
    expect(result.planningEvidence.block).toEqual({ number: '100', hash: HASH });
    expect(input.client.readContract.mock.calls.every(([call]) => call.functionName !== 'getDistribution')).toBe(true);
  });
  it('executes standalone viem batching through a lightweight client without a multicall method or deployment metadata', async () => {
    const input = fixture({ count: 2n });
    const height = 60000000n, block = { number: height.toString(), hash: HASH };
    const graph = input.apollo.query.getMockImplementation();
    input.apollo.query.mockImplementation(async args => {
      const result = await graph(args); return { data: { ...result.data, _meta: { ...meta, block } } };
    });
    const getters = [], wire = vi.fn(async ({ method, params }) => {
      if (method === 'eth_chainId') return '0x64';
      if (method === 'eth_getBlockByNumber') return { number: `0x${height.toString(16)}`, hash: HASH };
      if (method !== 'eth_call') throw new Error('Unexpected RPC method');
      expect(params[1]).toBe(`0x${height.toString(16)}`);
      const transaction = params[0];
      if (transaction.to.toLowerCase() === TOKEN.toLowerCase()) return encodeFunctionResult({ abi: ERC20Abi, functionName: 'balanceOf', result: 70n });
      if (transaction.to.toLowerCase() === PM.toLowerCase()) return encodeFunctionResult({ abi: PaymentManagerAbi, functionName: 'distributionCounter', result: 2n });
      expect(transaction.to.toLowerCase()).toBe(gnosis.contracts.multicall3.address.toLowerCase());
      const decoded = decodeFunctionData({ abi: multicall3Abi, data: transaction.data });
      expect(decoded.functionName).toBe('aggregate3');
      const result = decoded.args[0].map(call => {
        const decodedCall = decodeFunctionData({ abi: PaymentManagerAbi, data: call.callData });
        expect(decodedCall.functionName).toBe('getDistribution'); getters.push(decodedCall.args[0]);
        return { success: true, returnData: encodeFunctionResult({ abi: PaymentManagerAbi, functionName: 'getDistribution', result: [TOKEN, 100n, 10n, ROOT, 100n, false] }) };
      });
      return encodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', result });
    });
    const client = createClient({ chain: { ...gnosis, contracts: undefined }, transport: custom({ request: wire }) })
      .extend(client => ({ readContract: args => readContract(client, args) }));
    expect(client.multicall).toBeUndefined();
    const result = await readOrgPotBalances({ ...input, client });
    expect(result.coverage.status).toBe('complete'); expect(getters).toEqual([1n, 2n]);
    expect(wire.mock.calls.filter(([call]) => call.method === 'eth_call')).toHaveLength(4);
  });
  it('preserves indexed creation evidence and canonical release planning after batching', async () => {
    const result = await readOrgPotBalances(fixture());
    expect(paymentManagerAvailability({ evidence: result.planningEvidence })).toMatchObject({ spendable: '0', spendableAfterRelease: '70', releaseIds: ['1'] });
    expect(result.distributions[0].creationBlock).toMatchObject({ state: 'known', value: '20', source: { block: { hash: HASH } } });
  });
  it('keeps failed individual getters and failed chunks explicit, retaining other known rows', async () => {
    const partial = await readOrgPotBalances(fixture({ count: 3n, failedId: 2n }));
    expect(partial.coverage).toMatchObject({ status: 'incomplete', failedIds: ['2'] });
    expect(partial.distributions.map(row => row.id)).toEqual(['1', '3']);
    expect(partial.paymentManager).toBe('70'); expect(partial.planningEvidence.paymentManager).toBeNull();
    const chunk = await readOrgPotBalances(fixture({ count: 21n, failedBatch: 21n }));
    expect(chunk.coverage.failedIds).toEqual(['21']); expect(chunk.distributions).toHaveLength(20);
    expect(chunk.planningEvidence.paymentManager).toBeNull();
  });
  it('does not enumerate above the bound and distinguishes known-zero counter from unknown commitments', async () => {
    const input = fixture({ count: 51n }), capped = await readOrgPotBalances(input);
    expect(input.client.multicall).not.toHaveBeenCalled(); expect(capped.coverage.issues).toContainEqual({ code: 'ROUND_CAP' });
    expect(capped.planningEvidence.paymentManager).toBeNull(); expect(capped.paymentManager).toBe('70');
    const empty = fixture({ count: 0n }), known = await readOrgPotBalances(empty);
    expect(empty.client.multicall).not.toHaveBeenCalled(); expect(known.coverage.status).toBe('complete');
    expect(paymentManagerAvailability({ evidence: known.planningEvidence }).spendable).toBe('70');
  });
});

describe('submit caller refetch contract', () => {
  it('does not refetch during unrelated rerenders of the action form', async () => {
    PotHarness(); effects();
    await vi.waitFor(() => expect(PotHarness().loading).toBe(false));
    const calls = f.apollo.query.mock.calls.length;
    for (let amount = 1; amount <= 4; amount++) { PotHarness({ token: TOKEN, amount: String(amount) }); effects(); }
    expect(f.apollo.query).toHaveBeenCalledTimes(calls);
  });
  it('returns newly observed data to the caller and preserves it as current hook state', async () => {
    const result = await PotHarness().refetch();
    expect(result.planningEvidence.paymentManager.coverage.status).toBe('complete');
    expect(PotHarness().planningEvidence).toBe(result.planningEvidence); expect(PotHarness().loading).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('returns null for disabled and saved stale callbacks without invoking readers', async () => {
    const old = PotHarness().refetch;
    f.context = { ...f.context, orgId: `0x${'7'.repeat(64)}` };
    PotHarness({ token: TOKEN, enabled: false });
    expect(await old()).toBeNull(); expect(await PotHarness({ token: TOKEN, enabled: false }).refetch()).toBeNull();
    expect(f.create).not.toHaveBeenCalled(); expect(f.apollo.query).not.toHaveBeenCalled();
  });
  it('refuses in-flight data after organization scope changes', async () => {
    let finish;
    f.apollo.query.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = PotHarness().refetch();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    f.context = { ...f.context, orgId: `0x${'7'.repeat(64)}` }; PotHarness();
    expect(PotHarness().planningEvidence).toBeNull();
    finish({ data: { _meta: meta } });
    expect(await pending).toBeNull();
  });
  it('invalidates mounted requests and saved callbacks on unmount', async () => {
    const old = PotHarness(); effects();
    await vi.waitFor(() => expect(PotHarness().loading).toBe(false));
    cleanup(); f.create.mockClear();
    expect(await old.refetch()).toBeNull(); expect(f.create).not.toHaveBeenCalled();
  });
});
