import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { utils } from 'ethers';
import { CASHOUT_ESCROW_ABI_V1 } from '@poa-box/core/integrations/cashout';
import { cashoutGraph, cashoutCandidate, CASHOUT_TEST_USER as USER, CASHOUT_TEST_HASH as HASH } from '@/test/cashoutGraphFixture';
const f = vi.hoisted(() => ({ apollo: { query: vi.fn() }, rpc: { getChainId: vi.fn(), getBlock: vi.fn(), multicall: vi.fn(), getTransactionReceipt: vi.fn() } }));
vi.mock('viem', async original => ({ ...await original(), createPublicClient: () => f.rpc }));
vi.mock('@/util/apolloClient', () => ({ getClient: () => f.apollo }));
import { fetchOutstandingDeposits, ESCROW_V2_ADDRESS, USDC_BASE } from '@/services/web3/domain/CashOutService';
const hash = n => `0x${n.toString(16).padStart(64, '0')}`;
const candidate = (n, status = 'FAILED') => cashoutCandidate({ requestHash: hash(n), createdTxHash: hash(1000 + n), amount: '1000000' }, status);
const iface = new utils.Interface([...CASHOUT_ESCROW_ABI_V1]);
function receipt(txHash) {
  const id = BigInt(txHash) - 1000n;
  const log = iface.encodeEventLog(iface.getEvent('DepositReceived'), [id, USER, USDC_BASE, '1000000', ['1', '1000000'], USER, USER]);
  return { transactionHash: txHash, status: 'success', blockNumber: 90n, blockHash: HASH,
    logs: [{ ...log, address: ESCROW_V2_ADDRESS, transactionHash: txHash, logIndex: 1 }] };
}
beforeEach(() => {
  vi.clearAllMocks(); f.rpc.getChainId.mockResolvedValue(8453); f.rpc.getBlock.mockResolvedValue({ number: 100n, hash: HASH });
  f.apollo.query.mockImplementation(cashoutGraph());
  f.rpc.getTransactionReceipt.mockImplementation(async ({ hash }) => receipt(hash));
  f.rpc.multicall.mockImplementation(async ({ contracts }) => contracts.map(contract => ({ status: 'success', result:
    contract.functionName === 'failedDepositor' ? USER : contract.functionName === 'failedAmount' ? 1000000n
      : contract.functionName === 'usdc' ? USDC_BASE : { depositor: USER, token: USDC_BASE, remainingDeposits: 1000000n, outstandingIntentAmount: 0n } })));
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
});
afterEach(() => vi.unstubAllGlobals());
describe('actual cashout consumer: complete independent streams and bounded current evidence', () => {
  it('pages both streams beyond 50 and 100, checks recovered candidates, batches RPC and shares concurrent requests', async () => {
    const failed = Array.from({ length: 105 }, (_, n) => candidate(n + 1, n % 2 ? 'RECOVERED' : 'FAILED'));
    const deposited = Array.from({ length: 103 }, (_, n) => candidate(n + 201, 'DEPOSITED'));
    f.apollo.query.mockImplementation(cashoutGraph({ failed, deposited }));
    const [first, second] = await Promise.all([fetchOutstandingDeposits(USER), fetchOutstandingDeposits(USER)]);
    expect(first).toBe(second); expect(first).toHaveLength(208); expect(first.coverage.status).toBe('complete');
    expect(first.filter(row => row.kind === 'failed')).toHaveLength(105);
    expect(first.coverage.outstandingCount.state).toBe('unknown');
    const pages = f.apollo.query.mock.calls.filter(([{ variables }]) => variables.statuses);
    expect(pages).toHaveLength(4);
    expect(pages.every(([{ variables }]) => variables.wallet === USER && variables.block.hash === HASH)).toBe(true);
    expect(pages.filter(([{ variables }]) => variables.statuses.includes('RECOVERED'))).toHaveLength(2);
    expect(f.rpc.multicall.mock.calls.every(([args]) => args.contracts.length <= 24 && args.blockNumber === 100n)).toBe(true);
    expect(f.rpc.getTransactionReceipt).toHaveBeenCalledTimes(103);
    expect(first.every(row => row.recoveryFacts.state === 'known')).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['failed', 'deposited'])('preserves the other stream when %s pagination fails', async stream => {
    f.apollo.query.mockImplementation(cashoutGraph({ failed: [candidate(1)], deposited: [candidate(2, 'DEPOSITED')],
      alter(data, variables) {
        if (variables.statuses && variables.statuses.includes('DEPOSITED') === (stream === 'deposited')) throw new Error('offline');
        return data;
      } }));
    const rows = await fetchOutstandingDeposits(USER);
    expect(rows.coverage.status).toBe('incomplete'); expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe(stream === 'failed' ? 'unfilled' : 'failed');
    expect(rows.coverage.discovery.issues.some(issue => issue.code === 'INCOMPLETE_INDEXED_STREAM')).toBe(true);
  });
  it('rejects a repeating cursor explicitly rather than truncating silently', async () => {
    // Repeating pages violate strict cursor progression; core stops immediately.
    const repeated = Array.from({ length: 100 }, (_, n) => candidate(n + 1));
    f.apollo.query.mockImplementation(cashoutGraph({ failed: repeated, alter(data, variables) {
      if (variables.statuses?.includes('FAILED')) data.cashOutRequests = repeated;
      return data;
    } }));
    const rows = await fetchOutstandingDeposits(USER);
    expect(rows.coverage.status).toBe('incomplete');
    expect(rows.coverage.issues.length).toBeGreaterThan(0);
    expect(f.apollo.query.mock.calls.length).toBeLessThan(10);
  });
  it.each(['chain', 'depositor', 'status', 'pendingFor', 'relay', 'token', 'hash'])('fails closed for wrong %s scope', async scope => {
    const failed = [candidate(1)];
    if (scope === 'chain') f.rpc.getChainId.mockResolvedValue(100);
    if (scope === 'depositor') failed[0].depositor.id = USDC_BASE;
    if (scope === 'status') failed[0].status = 'DEPOSITED';
    if (scope === 'pendingFor') failed[0].pendingFor.id = USDC_BASE;
    f.apollo.query.mockImplementation(cashoutGraph({ failed, alter(data, variables) {
      if (!variables.block) return data;
      if (scope === 'relay' && data.relayContracts) data.relayContracts.push({ id: USER });
      if (scope === 'token' && data.relayContract) data.relayContract.usdc = USER;
      if (scope === 'hash') data._meta.block.hash = hash(9999);
      return data;
    } }));
    if (['chain', 'relay', 'token', 'hash'].includes(scope)) await expect(fetchOutstandingDeposits(USER)).rejects.toThrow();
    else { const rows = await fetchOutstandingDeposits(USER); expect(rows.coverage.status).toBe('incomplete'); expect(rows).toHaveLength(0); }
    expect(f.rpc.multicall).not.toHaveBeenCalled();
  });
  it('refreshes the latest discovery head from the network instead of retaining a cached candidate universe', async () => {
    f.apollo.query.mockImplementation(cashoutGraph({ failed: [candidate(1)] }));
    expect(await fetchOutstandingDeposits(USER)).toHaveLength(1);
    f.apollo.query.mockImplementation(cashoutGraph({ failed: [candidate(1), candidate(2)] }));
    expect(await fetchOutstandingDeposits(USER)).toHaveLength(2);
    const heads = f.apollo.query.mock.calls.filter(([{ variables }]) => !variables.block);
    expect(heads).toHaveLength(2);
    expect(heads.every(([request]) => request.fetchPolicy === 'network-only')).toBe(true);
  });
  it('does not erase recovered-source candidates until exact pinned getters prove zero', async () => {
    f.apollo.query.mockImplementation(cashoutGraph({ failed: [candidate(1, 'RECOVERED')] }));
    expect(await fetchOutstandingDeposits(USER)).toHaveLength(1);
    f.rpc.multicall.mockImplementation(async ({ contracts }) => contracts.map(contract => ({ status: 'success', result:
      contract.functionName === 'failedDepositor' ? USER : contract.functionName === 'usdc' ? USDC_BASE : 0n })));
    const rows = await fetchOutstandingDeposits(USER);
    expect(rows).toHaveLength(0); expect(rows.coverage.status).toBe('complete');
  });
  it.each(['wrong-hash', 'future', 'reorg', 'rpc'])('keeps receipt %s failure incomplete without recovery permission', async mode => {
    f.apollo.query.mockImplementation(cashoutGraph({ deposited: [candidate(1, 'DEPOSITED')] }));
    if (mode === 'rpc') f.rpc.getTransactionReceipt.mockRejectedValue(new Error('offline'));
    else f.rpc.getTransactionReceipt.mockImplementation(async ({ hash: tx }) => ({ ...receipt(tx),
      ...(mode === 'wrong-hash' ? { transactionHash: hash(999) } : mode === 'future' ? { blockNumber: 101n } : { blockHash: hash(999) }) }));
    const rows = await fetchOutstandingDeposits(USER);
    expect(rows).toHaveLength(0); expect(rows.coverage.status).toBe('incomplete');
    expect(f.rpc.multicall).not.toHaveBeenCalled();
  });
  it('does not shift successful later RPC batches onto candidates from a short response', async () => {
    f.apollo.query.mockImplementation(cashoutGraph({ failed: Array.from({ length: 9 }, (_, n) => candidate(n + 1)) }));
    const actual = f.rpc.multicall.getMockImplementation();
    f.rpc.multicall.mockImplementationOnce(async () => [{ status: 'success', result: USER }]);
    f.rpc.multicall.mockImplementation(actual);
    const rows = await fetchOutstandingDeposits(USER);
    expect(rows).toHaveLength(9); expect(rows.coverage.status).toBe('incomplete');
    expect(rows.slice(0, 8).every(row => row.recoveryFacts.state === 'unknown')).toBe(true);
    expect(rows[8].recoveryFacts.state).toBe('known');
  });
  it('retains proven candidates as unknown when an RPC batch fails and rejects changed RPC pin', async () => {
    f.apollo.query.mockImplementation(cashoutGraph({ failed: [candidate(1)] }));
    f.rpc.multicall.mockRejectedValue(new Error('offline'));
    const rows = await fetchOutstandingDeposits(USER);
    expect(rows).toHaveLength(1); expect(rows.coverage.status).toBe('incomplete'); expect(rows[0].recoveryFacts.state).toBe('unknown');
    f.rpc.getBlock.mockImplementation(async ({ blockTag }) => ({ number: 100n, hash: blockTag ? HASH : hash(123) }));
    await expect(fetchOutstandingDeposits(USER)).rejects.toThrow('changed');
  });
});
