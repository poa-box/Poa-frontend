import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { submissionIntentKey, transitionSubmissionRecovery } from '@poa-box/core/execute/recovery';
import { TransactionManager } from '@/services/web3/core/TransactionManager';
import { SmartAccountTransactionManager } from '@/services/web3/core/SmartAccountTransactionManager';
import { EOA7702TransactionManager } from '@/services/web3/eip7702/EOA7702TransactionManager';
import { installManagerLifecycle } from '@/services/web3/core/managerLifecycle';
import { createSubmissionJournal, pendingSubmissionError } from '@/services/web3/core/submissionJournal';
import { fakeBrowserLocks, recoveryTestStorage, deferredRecoveryTest } from '@/services/web3/core/submissionTestHelpers';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';

const ACCOUNT = `0x${'11'.repeat(20)}`;
const TARGET = `0x${'22'.repeat(20)}`;
const ORIGINAL = `0x${'aa'.repeat(32)}`;
const REPLACEMENT = `0x${'bb'.repeat(32)}`;
const BLOCK = `0x${'cc'.repeat(32)}`;
const ORPHAN = `0x${'dd'.repeat(32)}`;
const iface = new ethers.utils.Interface(['function deposit() payable', 'function withdraw()']);
const callKey = submissionIntentKey([{ to: TARGET, data: iface.encodeFunctionData('deposit'), value: '0' }]);
let storage;
let locks;

const journal = () => createSubmissionJournal({ accountAddress: ACCOUNT, chainId: 100, entryPoint: ENTRY_POINT_ADDRESS, storage, locks });

function transport() {
  const receipt = { transactionHash: ORIGINAL, status: 'success', blockNumber: 41n, blockHash: BLOCK };
  const transaction = { hash: ORIGINAL, from: ACCOUNT, to: TARGET, input: iface.encodeFunctionData('deposit'),
    value: 0n, nonce: 7, chainId: 100, blockNumber: 41n, blockHash: BLOCK };
  const receipts = new Map([[ORIGINAL, receipt]]);
  const transactions = new Map([[ORIGINAL, transaction]]);
  const publicClient = {
    getChainId: vi.fn(async () => 100),
    getBlockNumber: vi.fn(async () => 40n),
    getTransactionReceipt: vi.fn(async ({ hash }) => receipts.get(hash)),
    getTransaction: vi.fn(async ({ hash }) => transactions.get(hash)),
    getBlock: vi.fn(async ({ blockNumber }) => ({ number: blockNumber, hash: BLOCK })),
  };
  return { publicClient, receipt, transaction, receipts, transactions };
}

function direct(config = {}) {
  const f = transport();
  const signer = { getTransactionCount: vi.fn(async () => 7), getAddress: vi.fn(async () => ACCOUNT), getChainId: vi.fn(async () => 100) };
  const contract = { address: TARGET, interface: iface, estimateGas: { deposit: vi.fn(async () => ethers.BigNumber.from(100000)) },
    deposit: vi.fn(async () => ({ hash: ORIGINAL, wait: async () => ({ ...f.receipt, status: 1 }) })) };
  const manager = new TransactionManager(signer, { accountAddress: ACCOUNT, chainId: 100, publicClient: f.publicClient,
    submissionStorage: storage, submissionLocks: locks, ...config });
  return { ...f, manager, signer, contract };
}

function replacement(f, { status = 'success', data = iface.encodeFunctionData('deposit') } = {}) {
  const transaction = { ...f.transaction, hash: REPLACEMENT, input: data };
  const receipt = { ...f.receipt, transactionHash: REPLACEMENT, status };
  f.transactions.set(REPLACEMENT, transaction);
  f.receipts.set(REPLACEMENT, receipt);
  const error = Object.assign(new Error('mined replacement'), { code: 'TRANSACTION_REPLACED',
    replacement: { ...transaction, data, value: ethers.BigNumber.from(0) },
    receipt: { ...receipt, status: status === 'success' ? 1 : 0 } });
  f.contract.deposit.mockResolvedValue({ hash: ORIGINAL, wait: async () => { throw error; } });
  return { transaction, receipt, error };
}

async function saved() {
  const owner = journal();
  const release = await owner.acquire();
  try {
    owner.begin(callKey); owner.signing();
    owner.write({ kind: 'transaction', chainId: 100, phase: 'submitting', nonce: '7', callKey, fromBlock: '40' });
    return owner.write({ kind: 'transaction', chainId: 100, phase: 'submitted', nonce: '7', txHash: ORIGINAL });
  } finally { await release(); }
}

function recoverer(kind, scopeGuard = () => {}) {
  const f = transport();
  let manager;
  if (kind === 'direct') {
    manager = new TransactionManager({}, { accountAddress: ACCOUNT, chainId: 100, publicClient: f.publicClient,
      submissionStorage: storage, submissionLocks: locks, scopeGuard });
  } else {
    const Manager = kind === '7702 lifecycle' ? EOA7702TransactionManager : SmartAccountTransactionManager;
    manager = new Manager({ accountAddress: ACCOUNT, chainId: 100, publicClient: f.publicClient,
      bundlerClient: {}, submissionJournal: journal(), scopeGuard });
  }
  const reconcile = kind === 'passkey prototype'
    ? submission => SmartAccountTransactionManager.prototype.reconcileSubmission.call(manager, submission)
    : submission => manager.reconcileSubmission(submission);
  return { ...f, manager, reconcile };
}

beforeEach(() => {
  storage = recoveryTestStorage(); locks = fakeBrowserLocks();
  vi.stubGlobal('window', { localStorage: storage }); vi.stubGlobal('navigator', { locks });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
  vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('real EOA manager replacement with installed core and canonical transport', () => {
  it.each(['success', 'reverted'])('settles a fee-only replacement from canonical %s evidence and sends once', async status => {
    const f = direct(); const r = replacement(f, { status }); const callback = vi.fn();
    const result = await f.manager.execute(f.contract, 'deposit', [], { onStateChange: callback });
    expect(result.success).toBe(status === 'success');
    if (status === 'success') expect(result.receipt).toBe(r.receipt);
    else expect(result.error.category).toBe('transaction_failed');
    expect(f.publicClient.getTransaction).toHaveBeenCalledExactlyOnceWith({ hash: REPLACEMENT });
    expect(f.publicClient.getTransactionReceipt).toHaveBeenCalledTimes(2);
    expect(f.publicClient.getBlock).toHaveBeenCalledTimes(2);
    expect(f.publicClient.getChainId).toHaveBeenCalledTimes(2);
    expect(f.contract.deposit).toHaveBeenCalledOnce();
    expect(f.manager.getPendingSubmission()).toBeNull();
    expect(callback.mock.calls.at(-1)[0]).toBe(status === 'success' ? 'success' : 'error');
  });

  it.each(['success', 'reverted'])('classifies a different call at the exact nonce as replaced with %s receipt', async status => {
    const f = direct(); replacement(f, { status, data: iface.encodeFunctionData('withdraw') });
    const result = await f.manager.execute(f.contract, 'deposit');
    expect(result.success).toBe(false); expect(result.error.category).toBe('transaction_replaced');
    expect(f.manager.getPendingSubmission()).toBeNull(); expect(f.contract.deposit).toHaveBeenCalledOnce();
  });

  it('uses the exact hash as a candidate and independently reads the call and receipt', async () => {
    const f = direct(); const r = replacement(f);
    r.error.replacement = { hash: REPLACEMENT };
    r.error.receipt = { transactionHash: REPLACEMENT, status: 0 };
    const result = await f.manager.execute(f.contract, 'deposit');
    expect(result.success).toBe(true); expect(result.receipt).toBe(r.receipt);
    expect(f.publicClient.getTransaction).toHaveBeenCalledExactlyOnceWith({ hash: REPLACEMENT });
  });

  it.each(['sender', 'nonce', 'transaction chain', 'current chain', 'transaction hash', 'receipt hash', 'orphan block',
    'missing block', 'missing call', 'conflicting call', 'changed closing receipt', 'changed closing chain', 'missing candidate'])
  ('keeps %s evidence unknown and retains the exact saved barrier', async mode => {
    const f = direct(); const r = replacement(f);
    if (mode === 'sender') r.transaction.from = TARGET;
    if (mode === 'nonce') r.transaction.nonce = 8;
    if (mode === 'transaction chain') r.transaction.chainId = 42161;
    if (mode === 'current chain') f.publicClient.getChainId.mockResolvedValue(42161);
    if (mode === 'transaction hash') r.transaction.hash = ORIGINAL;
    if (mode === 'receipt hash') r.receipt.transactionHash = ORIGINAL;
    if (mode === 'orphan block') f.publicClient.getBlock.mockResolvedValue({ number: 41n, hash: ORPHAN });
    if (mode === 'missing block') delete r.transaction.blockHash;
    if (mode === 'missing call') delete r.transaction.input;
    if (mode === 'conflicting call') r.transaction.data = iface.encodeFunctionData('withdraw');
    if (mode === 'changed closing receipt') f.publicClient.getTransactionReceipt.mockResolvedValueOnce(r.receipt).mockResolvedValue({ ...r.receipt, blockHash: ORPHAN });
    if (mode === 'changed closing chain') f.publicClient.getChainId.mockResolvedValueOnce(100).mockResolvedValue(42161);
    if (mode === 'missing candidate') delete r.error.replacement.hash;
    const result = await f.manager.execute(f.contract, 'deposit');
    expect(result.success).toBe(false); expect(result.error.category).toBe('submission_unknown');
    expect(f.manager.getPendingSubmission()).toMatchObject({ phase: 'submitted', nonce: '7', txHash: ORIGINAL });
    expect(f.contract.deposit).toHaveBeenCalledOnce();
    expect((await f.manager.execute(f.contract, 'deposit')).error.category).toBe('submission_unknown');
    expect(f.contract.deposit).toHaveBeenCalledOnce();
  });

  it('does not treat an unverified replacement diagnostic as an original failed receipt', async () => {
    const f = direct(); const r = replacement(f);
    r.error.replacement.hash = 'invalid';
    r.error.receipt = { ...f.receipt, status: 0 };
    expect((await f.manager.execute(f.contract, 'deposit')).error.category).toBe('submission_unknown');
    expect(f.manager.getPendingSubmission().txHash).toBe(ORIGINAL);
  });

  it('preserves the canonical original-flow replacement outcome after navigation and suppresses stale callbacks', async () => {
    let current = true;
    const f = direct({ scopeGuard: () => { if (!current) throw new Error('Stale page'); } });
    const r = replacement(f); const callback = vi.fn();
    f.publicClient.getTransaction.mockImplementation(async () => { current = false; return r.transaction; });
    const result = await f.manager.execute(f.contract, 'deposit', [], { onStateChange: callback });
    expect(result.success).toBe(true); expect(result.receipt).toBe(r.receipt);
    expect(f.manager.getPendingSubmission()).toBeNull();
    expect(callback.mock.calls.map(([state]) => state)).not.toContain('success');
  });

  it.each(['receipt', 'replacement', 'failed receipt'])('retains the blocker when active %s settlement cannot remove storage', async mode => {
    const f = direct();
    if (mode === 'replacement') replacement(f);
    if (mode === 'failed receipt') f.contract.deposit.mockResolvedValue({ hash: ORIGINAL, wait: async () => {
      throw Object.assign(new Error('failed'), { receipt: { ...f.receipt, status: 0 } });
    } });
    storage.removeItem = vi.fn(); const callback = vi.fn();
    const result = await f.manager.execute(f.contract, 'deposit', [], { onStateChange: callback });
    expect(result.success).toBe(false); expect(result.error.category).toBe('submission_unknown');
    expect(f.manager.getPendingSubmission()).not.toBeNull();
    expect(callback.mock.calls.map(([state]) => state)).not.toContain('success');
    expect(f.contract.deposit).toHaveBeenCalledOnce();
  });
});

describe.each(['direct', 'passkey lifecycle', 'passkey prototype', '7702 lifecycle'])('%s recovery fencing', kind => {
  it('returns canonical success only after exact fenced removal', async () => {
    const record = await saved(); const f = recoverer(kind);
    const result = await f.reconcile(record);
    expect(result.outcome.status).toBe('succeeded'); expect(result.receipt).toBe(f.receipt);
    expect(f.manager.getPendingSubmission()).toBeNull(); expect(locks.held.size).toBe(0);
  });

  it.each(['page', 'account', 'chain'])('does not mutate after %s changes during a recovery read', async field => {
    const record = await saved(); const scope = { page: 'org-a', account: ACCOUNT, chain: 100 };
    const expected = { ...scope };
    const f = recoverer(kind, () => { if (scope[field] !== expected[field]) throw new Error('Stale scope'); });
    const reached = deferredRecoveryTest(); const gate = deferredRecoveryTest();
    f.publicClient.getTransactionReceipt.mockImplementation(async () => { reached.resolve(); await gate.promise; return f.receipt; });
    const clear = vi.spyOn(f.manager.submissionJournal, 'clear');
    const pending = f.reconcile(record); await reached.promise;
    scope[field] = 'changed'; gate.resolve();
    await expect(pending).rejects.toThrow('Stale scope');
    expect(clear).not.toHaveBeenCalled(); expect(journal().read()).toEqual(record); expect(locks.held.size).toBe(0);
  });

  it('rechecks scope inside the acquired clear critical section after asynchronous lock acquisition', async () => {
    const record = await saved(); let current = true;
    const f = recoverer(kind, () => { if (!current) throw new Error('Stale scope'); });
    const reached = deferredRecoveryTest(); const gate = deferredRecoveryTest();
    const request = locks.request.bind(locks);
    locks.request = async (...args) => { reached.resolve(); await gate.promise; return request(...args); };
    const clear = vi.spyOn(f.manager.submissionJournal, 'clear');
    const pending = f.reconcile(record); await reached.promise;
    current = false; gate.resolve();
    await expect(pending).rejects.toThrow('Stale scope');
    expect(clear).not.toHaveBeenCalled(); expect(journal().read()).toEqual(record); expect(locks.held.size).toBe(0);
  });

  it('rejects a false durable clear without reporting settlement or resetting uncertainty', async () => {
    const record = await saved(); const f = recoverer(kind);
    const uncertainty = pendingSubmissionError(record); f.manager._uncertainSubmission = uncertainty;
    storage.removeItem = vi.fn();
    await expect(f.reconcile(record)).rejects.toThrow('earlier transaction');
    expect(f.manager._uncertainSubmission).toBe(uncertainty);
    expect(journal().read()).toEqual(record); expect(locks.held.size).toBe(0);
  });

  it('keeps the exact saved barrier when a competing tab owns the account lock', async () => {
    const record = await saved(); const f = recoverer(kind); const tab = journal(); const release = await tab.acquire();
    try {
      await expect(f.reconcile(record)).rejects.toThrow('already in progress');
      expect(journal().read()).toEqual(record);
    } finally { await release(); }
    expect(locks.held.size).toBe(0);
  });

  it.each(['revision', 'owner', 'attempt'])('cannot remove a newer %s record that appears during recovery', async mode => {
    const record = await saved(); const f = recoverer(kind);
    const reached = deferredRecoveryTest(); const gate = deferredRecoveryTest();
    f.publicClient.getTransactionReceipt.mockImplementation(async () => { reached.resolve(); await gate.promise; return f.receipt; });
    const pending = f.reconcile(record); await reached.promise;
    const recovery = mode === 'revision'
      ? transitionSubmissionRecovery(record.recovery, record.recovery, { type: 'unresolved' })
      : { ...record.recovery, [mode === 'owner' ? 'ownerId' : 'attemptId']: `new-${mode}` };
    const newer = { ...record, recovery }; const key = storage.key(0);
    storage.setItem(key, JSON.stringify(newer)); gate.resolve();
    await expect(pending).rejects.toThrow('earlier transaction');
    expect(journal().read()).toEqual(newer); expect(locks.held.size).toBe(0);
  });
});

describe('active lifecycle settlement fences', () => {
  async function active() {
    const activeJournal = journal(); const manager = { accountAddress: ACCOUNT, chainId: 100,
      execute: async () => {}, executeBatch: async () => {} };
    installManagerLifecycle(manager, { submissionJournal: activeJournal });
    const release = await activeJournal.acquire();
    manager._submissionOwnerRecord = activeJournal.begin(callKey).recovery;
    activeJournal.signing();
    const raw = { chainId: 100, entryPoint: ENTRY_POINT_ADDRESS, sender: ACCOUNT, nonce: '7', computedHash: ORIGINAL, phase: 'submitting' };
    const first = manager.recordSubmission(raw); manager._submissionOwnerRecord = first.recovery;
    const submission = { ...raw, phase: 'submitted', userOpHash: ORIGINAL };
    const record = manager.recordSubmission(submission); manager._submissionOwnerRecord = record.recovery;
    return { manager, record, submission, release };
  }

  it('clears the exact current owner, revision and identity synchronously under its lease', async () => {
    const f = await active();
    try { expect(f.manager.settleSubmission(f.submission)).toBe(true); expect(journal().read()).toBeNull(); }
    finally { await f.release(); }
  });

  it.each(['revision', 'owner', 'attempt', 'identity', 'false clear'])('refuses %s settlement and retains uncertainty', async mode => {
    const f = await active();
    try {
      let current = f.record;
      if (mode === 'revision') current = { ...current, recovery: transitionSubmissionRecovery(current.recovery, current.recovery, { type: 'unresolved' }) };
      if (mode === 'owner') current = { ...current, recovery: { ...current.recovery, ownerId: 'new-owner' } };
      if (mode === 'attempt') current = { ...current, recovery: { ...current.recovery, attemptId: 'new-attempt' } };
      if (mode === 'identity') current = { ...current, computedHash: REPLACEMENT, recovery: { ...current.recovery, computedHash: REPLACEMENT } };
      storage.setItem(storage.key(0), JSON.stringify(current));
      if (mode === 'false clear') storage.removeItem = vi.fn();
      expect(() => f.manager.settleSubmission(f.submission)).toThrow('earlier transaction');
      expect(f.manager._uncertainSubmission).not.toBeNull(); expect(journal().read()).toEqual(current);
    } finally { await f.release(); }
  });
});
