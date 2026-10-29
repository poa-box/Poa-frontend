import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowserLocks } from '@/services/web3/core/submissionTestHelpers';
import { ethers } from 'ethers';
import { TransactionManager } from '@/services/web3/core/TransactionManager';
import { listPendingSubmissions } from '@/services/web3/core/submissionJournal';
const ACCOUNT = '0x1111111111111111111111111111111111111111';
const HASH = `0x${'aa'.repeat(32)}`;
const BLOCK_HASH = `0x${'bb'.repeat(32)}`;
let storage;
const setup = () => {
  const receipt = { transactionHash: HASH, blockNumber: 12, blockHash: BLOCK_HASH, status: 1 };
  const signer = { getTransactionCount: vi.fn(async () => 7), provider: { network: { chainId: 100 } } };
  const contract = { address: '0x2222222222222222222222222222222222222222', interface: new ethers.utils.Interface(['function deposit() payable']),
    estimateGas: { deposit: vi.fn(async () => ethers.BigNumber.from(100000)) },
    deposit: vi.fn(async () => ({ hash: HASH, wait: async () => receipt })) };
  const transaction = { hash: HASH, chainId: 100, from: ACCOUNT, nonce: 7, to: contract.address,
    input: contract.interface.encodeFunctionData('deposit'), value: 0n, blockNumber: 12n, blockHash: BLOCK_HASH };
  const publicClient = { getChainId: vi.fn(async () => 100), getTransactionReceipt: vi.fn(async () => receipt),
    getTransaction: vi.fn(async () => transaction), getBlock: vi.fn(async () => ({ number: 12n, hash: BLOCK_HASH })) };
  const manager = new TransactionManager(signer, { accountAddress: ACCOUNT, chainId: 100, publicClient });
  return { signer, manager, contract, publicClient, receipt };
};
beforeEach(() => {
  vi.stubGlobal('navigator', { locks: fakeBrowserLocks() });
  const rows = new Map();
  storage = { getItem: key => rows.get(key) || null, setItem: (key, value) => rows.set(key, value), removeItem: key => rows.delete(key), get length() { return rows.size; }, key: index => [...rows.keys()][index] };
  vi.stubGlobal('window', { localStorage: storage });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
  vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('direct EOA lifecycle through the service manager', () => {
  it('preserves exact value, callbacks, raw receipt and pinned nonce, saving before send then clearing known success', async () => {
    const { manager, contract, receipt } = setup();
    contract.deposit.mockImplementation(async (_options) => {
      expect(listPendingSubmissions(ACCOUNT)).toMatchObject([{ kind: 'transaction', phase: 'submitting', nonce: '7' }]);
      return { hash: HASH, wait: async () => receipt };
    });
    const onStateChange = vi.fn();
    const result = await manager.execute(contract, 'deposit', [], { value: '9007199254740993123456789', onStateChange });
    expect(result.success).toBe(true); expect(result.receipt).toBe(receipt);
    expect(contract.deposit).toHaveBeenCalledWith(expect.objectContaining({ value: '9007199254740993123456789', nonce: 7 }));
    expect(onStateChange.mock.calls.map(([state]) => state)).toEqual(['estimating', 'awaiting_signature', 'pending', 'confirming', 'success']);
    expect(listPendingSubmissions(ACCOUNT)).toEqual([]);
  });
  it.each(['send-response-lost', 'receipt-timeout'])('blocks after %s across manager recreation without another send', async mode => {
    const { manager, contract } = setup();
    contract.deposit.mockImplementation(async () => {
      if (mode === 'send-response-lost') throw new Error('offline');
      return { hash: HASH, wait: async () => { throw new Error('offline'); } };
    });
    expect((await manager.execute(contract, 'deposit')).error.category).toBe('submission_unknown');
    const restored = setup();
    expect((await restored.manager.execute(restored.contract, 'deposit')).error.category).toBe('submission_unknown');
    expect(restored.contract.deposit).not.toHaveBeenCalled();
    const result = await restored.manager.reconcileSubmission();
    expect(result.outcome.status).toBe(mode === 'receipt-timeout' ? 'succeeded' : 'unknown');
    if (mode === 'send-response-lost') expect(restored.publicClient.getTransactionReceipt).not.toHaveBeenCalled();
    else expect(listPendingSubmissions(ACCOUNT)).toEqual([]);
  });
  it('keeps a mismatched receipt unknown rather than clearing the saved identity', async () => {
    const { manager, contract, receipt } = setup();
    receipt.transactionHash = `0x${'cc'.repeat(32)}`;
    expect((await manager.execute(contract, 'deposit')).error.category).toBe('submission_unknown');
    expect(listPendingSubmissions(ACCOUNT)).toHaveLength(1);
  });
  it.each([undefined, '0xmalformed'])('keeps a returned missing/malformed hash %s unknown without accepting an unrelated receipt', async hash => {
    const { manager, contract, receipt } = setup(); const wait = vi.fn(async () => receipt);
    contract.deposit.mockResolvedValue({ hash, wait });
    expect((await manager.execute(contract, 'deposit')).error.category).toBe('submission_unknown');
    expect(wait).not.toHaveBeenCalled(); expect(listPendingSubmissions(ACCOUNT)).toMatchObject([{ phase: 'submitting', nonce: '7' }]);
    const restored = setup();
    expect((await restored.manager.execute(restored.contract, 'deposit')).error.category).toBe('submission_unknown');
    expect(restored.contract.deposit).not.toHaveBeenCalled();
    expect((await restored.manager.reconcileSubmission()).outcome.status).toBe('unknown');
  });
  it('clears a definite user cancellation and a matching failed receipt, retaining useful failed results', async () => {
    const { manager, contract, receipt } = setup();
    contract.deposit.mockRejectedValueOnce(Object.assign(new Error('cancelled'), { code: 'ACTION_REJECTED' }));
    expect((await manager.execute(contract, 'deposit')).success).toBe(false);
    expect(listPendingSubmissions(ACCOUNT)).toEqual([]);
    receipt.status = 0;
    expect((await manager.execute(contract, 'deposit')).success).toBe(false);
    expect(listPendingSubmissions(ACCOUNT)).toEqual([]);
  });
  it('blocks persistence failure before wallet submission', async () => {
    const { manager, contract } = setup();
    storage.setItem = () => { throw new Error('Unavailable'); };
    expect((await manager.execute(contract, 'deposit')).success).toBe(false);
    expect(contract.deposit).not.toHaveBeenCalled();
  });
  it.each(['single', 'batch'])('awaits fresh host review after wallet, nonce and checkpoint setup for a %s call', async mode => {
    const { signer, contract, publicClient } = setup();
    const order = [];
    const manager = new TransactionManager(signer, { accountAddress: ACCOUNT, chainId: 100, publicClient,
      ensureChain: async () => { order.push('chain'); return signer; } });
    signer.getTransactionCount.mockImplementation(async () => { order.push('nonce'); return 7; });
    publicClient.getBlockNumber = vi.fn(async () => { order.push('block'); return 11n; });
    const beforeSend = vi.fn(async () => { order.push('review'); await Promise.resolve(); throw new Error('Reviewed state changed'); });
    const result = mode === 'single'
      ? await manager.execute(contract, 'deposit', [], { beforeSend })
      : (await manager.executeBatch([{ contract, method: 'deposit' }], { beforeSend }))[0];
    expect(result.success).toBe(false);
    expect(result.submissionState).toBe('not-submitted');
    expect(order).toEqual(['chain', 'nonce', 'block', 'review']);
    expect(contract.deposit).not.toHaveBeenCalled();
    expect(listPendingSubmissions(ACCOUNT)).toEqual([]);
    expect((await manager.execute(contract, 'deposit')).success).toBe(true);
  });
  it.each(['account', 'chain'])('refuses a signer %s change during the awaited setup', async field => {
    const { signer, contract, manager, publicClient } = setup();
    signer.getAddress = vi.fn(async () => ACCOUNT);
    signer.getChainId = vi.fn(async () => 100);
    publicClient.getBlockNumber = vi.fn(async () => {
      await Promise.resolve();
      if (field === 'account') signer.getAddress.mockResolvedValue('0x3333333333333333333333333333333333333333');
      else signer.getChainId.mockResolvedValue(42161);
      return 11n;
    });
    const result = await manager.execute(contract, 'deposit');
    expect(result.success).toBe(false);
    expect(contract.deposit).not.toHaveBeenCalled();
    expect(listPendingSubmissions(ACCOUNT)).toEqual([]);
  });
  it.each(['getAddress', 'getChainId'])('refreshes authority after delayed final %s lookup, before wallet dispatch', async lookup => {
    const { signer, contract, manager } = setup();
    let now = 1_000_000;
    const reviewedAt = now;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    signer.getAddress = vi.fn(async () => ACCOUNT);
    signer.getChainId = vi.fn(async () => 100);
    const value = lookup === 'getAddress' ? ACCOUNT : 100;
    signer[lookup].mockResolvedValueOnce(value).mockImplementationOnce(async () => {
      await Promise.resolve();
      now += 40_000;
      return value;
    });
    const beforeSend = vi.fn(async () => {
      if (Date.now() - reviewedAt > 30_000) throw new Error('The reviewed proposal expired.');
    });
    const result = await manager.execute(contract, 'deposit', [], { beforeSend });
    expect(result.success).toBe(false);
    expect(result.submissionState).toBe('not-submitted');
    expect(beforeSend).toHaveBeenCalledOnce();
    expect(signer[lookup]).toHaveBeenCalledTimes(2);
    expect(contract.deposit).not.toHaveBeenCalled();
    expect(listPendingSubmissions(ACCOUNT)).toEqual([]);
  });
  it('rechecks runtime scope after the awaited host review even when the signer stays unchanged', async () => {
    const { signer, contract } = setup();
    let current = true;
    const manager = new TransactionManager(signer, { accountAddress: ACCOUNT, chainId: 100,
      scopeGuard: () => { if (!current) throw new Error('Account changed'); } });
    expect((await manager.execute(contract, 'deposit', [], { beforeSend: async () => { current = false; } })).success).toBe(false);
    expect(contract.deposit).not.toHaveBeenCalled();
    expect(listPendingSubmissions(ACCOUNT)).toEqual([]);
  });
  it('rejects an account switch after gas estimation, before send and late callbacks', async () => {
    let current = true;
    const { contract, signer } = setup();
    const manager = new TransactionManager(signer, { scopeGuard: () => { if (!current) throw new Error('stale'); } });
    contract.estimateGas.deposit.mockImplementation(async () => { current = false; return ethers.BigNumber.from(100000); });
    const onStateChange = vi.fn();
    expect((await manager.execute(contract, 'deposit', [], { onStateChange })).success).toBe(false);
    expect(contract.deposit).not.toHaveBeenCalled();
    expect(onStateChange.mock.calls.map(([state]) => state)).toEqual(['estimating']);
  });
  it('returns the known original receipt after a switch during confirmation while suppressing callbacks to the new page', async () => {
    let current = true;
    const { contract, signer, receipt, publicClient } = setup();
    contract.deposit.mockImplementation(async () => ({ hash: HASH, wait: async () => { current = false; return receipt; } }));
    const manager = new TransactionManager(signer, { accountAddress: ACCOUNT, chainId: 100, publicClient,
      scopeGuard: () => { if (!current) throw new Error('stale'); } });
    const onStateChange = vi.fn();
    const result = await manager.execute(contract, 'deposit', [], { onStateChange });
    expect(result.success).toBe(true); expect(result.receipt).toBe(receipt);
    expect(onStateChange.mock.calls.map(([state]) => state)).toEqual(['estimating', 'awaiting_signature', 'pending', 'confirming']);
    expect(listPendingSubmissions(ACCOUNT)).toEqual([]);
  });
});
