import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { submissionIntentKey } from '@poa-box/core/execute/recovery';
import { TransactionManager } from '@/services/web3/core/TransactionManager';
import { createSubmissionJournal, listPendingSubmissions } from '@/services/web3/core/submissionJournal';
import { createBrowserSubmissionLock } from '@/services/web3/core/browserSubmissionLock';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';
import { fakeBrowserLocks, recoveryTestStorage, deferredRecoveryTest } from '@/services/web3/core/submissionTestHelpers';

const mocks = vi.hoisted(() => ({ build: vi.fn(), sign: vi.fn() }));
vi.mock('@/services/web3/passkey/userOpBuilder', async original => ({ ...await original(), buildUserOpWithFallback: mocks.build }));
vi.mock('@/services/web3/passkey/passkeySign', () => ({ signUserOpWithPasskey: mocks.sign }));
import { SmartAccountTransactionManager } from '@/services/web3/core/SmartAccountTransactionManager';
import { getUserOpHash } from '@/services/web3/passkey/userOpBuilder';
import { USER_OPERATION_EVENTS } from '@poa-box/core/execute/outcome';

const ACCOUNT = `0x${'11'.repeat(20)}`, TARGET = `0x${'22'.repeat(20)}`;
const TX = `0x${'aa'.repeat(32)}`, OTHER = `0x${'bb'.repeat(32)}`;
const iface = new ethers.utils.Interface(['function deposit() payable', 'function withdraw()']);
let storage, locks;
const journal = (options = {}) => createSubmissionJournal({ accountAddress: ACCOUNT, chainId: 100, entryPoint: ENTRY_POINT_ADDRESS, storage, locks, ...options });
const callKey = method => submissionIntentKey([{ to: TARGET, data: iface.encodeFunctionData(method), value: '0' }]);
function direct(options = {}) {
  const receipt = { transactionHash: TX, status: 1, blockNumber: 41, blockHash: OTHER };
  const mined = { hash: TX, from: ACCOUNT, to: TARGET, input: iface.encodeFunctionData('deposit'), value: 0n, nonce: 7, chainId: 100, blockNumber: 41n, blockHash: OTHER };
  let sends = 0;
  const signer = { getTransactionCount: vi.fn(async () => 7), getAddress: vi.fn(async () => ACCOUNT), getChainId: vi.fn(async () => 100) };
  const contract = { address: TARGET, interface: iface, estimateGas: { deposit: vi.fn(async () => ethers.BigNumber.from(100000)), withdraw: vi.fn(async () => ethers.BigNumber.from(100000)) },
    deposit: vi.fn(async () => { sends++; return { hash: TX, wait: async () => receipt }; }) };
  const client = { getChainId: vi.fn(async () => 100), getBlockNumber: vi.fn(async () => 40n),
    getBlock: vi.fn(async ({ blockNumber, includeTransactions }) => ({ number: blockNumber, hash: OTHER, ...(includeTransactions ? { transactions: blockNumber === 41n ? [mined] : [] } : {}) })),
    getTransaction: vi.fn(async () => mined),
    getTransactionReceipt: vi.fn(async () => receipt) };
  const manager = new TransactionManager(signer, { chainId: 100, accountAddress: ACCOUNT, publicClient: client, ...options });
  return { manager, contract, signer, client, receipt, mined, get sends() { return sends; } };
}
function smart(options = {}) {
  let sends = 0;
  let operation;
  const receipt = { transactionHash: TX, status: 'success', blockNumber: 41n, blockHash: OTHER, logs: [] };
  const bundler = { sendUserOperation: vi.fn(async op => {
    sends++; operation = op;
    const hash = getUserOpHash(op, ENTRY_POINT_ADDRESS, 100);
    receipt.logs = [{ address: ENTRY_POINT_ADDRESS, ...USER_OPERATION_EVENTS.encodeEventLog('UserOperationEvent', [hash, ACCOUNT, TARGET, op.nonce, true, 1, 2]) }];
    return hash;
  }), waitForUserOperationReceipt: vi.fn(async () => ({ receipt })), getUserOperationReceipt: vi.fn(async () => ({ receipt: { transactionHash: TX } })) };
  const client = { getChainId: vi.fn(async () => 100), getBytecode: vi.fn(async () => '0x1234'), getTransactionReceipt: vi.fn(async () => receipt),
    getBlock: vi.fn(async ({ blockNumber }) => ({ number: blockNumber, hash: OTHER })) };
  const manager = new SmartAccountTransactionManager({ accountAddress: ACCOUNT, rawCredentialId: 'PRIVATE', chainId: 100, publicClient: client, bundlerClient: bundler, ...options });
  return { manager, bundler, client, receipt, get sends() { return sends; }, get operation() { return operation; } };
}
beforeEach(() => {
  storage = recoveryTestStorage(); locks = fakeBrowserLocks();
  vi.stubGlobal('window', { localStorage: storage }); vi.stubGlobal('navigator', { locks });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
  vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.build.mockImplementation(async ({ callData }) => ({ sender: ACCOUNT, nonce: 7n, callData, callGasLimit: 100000n, verificationGasLimit: 100000n, preVerificationGas: 10000n,
    maxFeePerGas: 1n, maxPriorityFeePerGas: 1n, signature: '0x' }));
  mocks.sign.mockReset().mockResolvedValue('0x1234');
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('atomic same-origin browser signing', () => {
  it('arbitrates two independent tab journals with Web Locks; old released owners cannot mutate a new attempt', async () => {
    const a = journal(), b = journal();
    const releaseA = await a.acquire(); a.begin(callKey('deposit')); a.signing();
    await expect(b.acquire()).rejects.toThrow(/already in progress/);
    await releaseA();
    const releaseB = await b.acquire(); b.abandonUnsent(); const current = b.begin(callKey('withdraw'));
    expect(() => a.write({ kind: 'transaction', phase: 'submitting', chainId: 100, nonce: '7', callKey: callKey('deposit') })).toThrow(/session/);
    expect(b.read().recovery.attemptId).toBe(current.recovery.attemptId);
    await releaseB();
  });
  it('holds the exclusive lock through signing and receipt; a competing manager never signs or sends', async () => {
    const first = direct(), second = direct();
    const reached = deferredRecoveryTest(), gate = deferredRecoveryTest();
    first.contract.deposit.mockImplementation(async () => { reached.resolve(); return { hash: TX, wait: () => gate.promise }; });
    const promise = first.manager.execute(first.contract, 'deposit'); await reached.promise;
    const result = await second.manager.execute(second.contract, 'deposit');
    expect(result.success).toBe(false); expect(second.signer.getTransactionCount).not.toHaveBeenCalled();
    expect(second.contract.deposit).not.toHaveBeenCalled();
    gate.resolve(first.receipt); expect((await promise).success).toBe(true);
    expect(locks.held.size).toBe(0); expect(storage.rows.size).toBe(0);
  });
  it('fails closed without Web Locks, and never uses storage read-then-write as a lock', async () => {
    vi.stubGlobal('navigator', {});
    const a = direct(); expect((await a.manager.execute(a.contract, 'deposit')).success).toBe(false);
    expect(a.contract.deposit).not.toHaveBeenCalled(); expect(storage.rows.size).toBe(0);
  });
  it.each(['intent', 'signing', 'prepared'])('recovers a crashed %s owner only under the exclusive lock', async phase => {
    const old = journal(); const release = await old.acquire(); old.begin(callKey('deposit'));
    if (phase !== 'intent') old.signing();
    if (phase === 'prepared') old.prepare({ kind: 'transaction', chainId: 100, nonce: '7', callKey: callKey('deposit') });
    await release(); // Browser context destruction releases its Web Lock; callbacks are now fenced out.
    const next = direct(); expect((await next.manager.execute(next.contract, 'deposit')).success).toBe(true);
    expect(next.sends).toBe(1); expect(storage.rows.size).toBe(0);
  });
  it('keeps an abandoned broadcast marker blocked even after reload and arbitrary elapsed time', async () => {
    const old = journal(); const release = await old.acquire(); old.begin(callKey('deposit'));
    old.write({ kind: 'transaction', phase: 'submitting', chainId: 100, nonce: '7', callKey: callKey('deposit') }); await release();
    const next = direct();
    expect((await next.manager.execute(next.contract, 'deposit')).error.category).toBe('submission_unknown');
    expect(next.sends).toBe(0); expect(storage.rows.size).toBe(1);
  });
  it('blocks an unresolved submission at another EntryPoint on the same account and chain', async () => {
    const old = journal({ entryPoint: TARGET }); const release = await old.acquire(); old.begin(callKey('deposit'));
    old.write({ kind: 'transaction', phase: 'submitting', chainId: 100, nonce: '7', callKey: callKey('deposit') }); await release();
    const next = direct();
    expect((await next.manager.execute(next.contract, 'deposit')).error.category).toBe('submission_unknown'); expect(next.sends).toBe(0);
  });
  it('preserves a pre-existing legacy pending write and never upgrades unknown provenance by guessing', async () => {
    const legacy = { kind: 'transaction', phase: 'submitting', chainId: 100, accountAddress: ACCOUNT, entryPoint: ENTRY_POINT_ADDRESS, nonce: '36' };
    storage.setItem(`poa:submission:v1:100:${ACCOUNT}:${ENTRY_POINT_ADDRESS.toLowerCase()}`, JSON.stringify(legacy));
    const before = [...storage.rows.values()][0]; const a = direct();
    expect((await a.manager.execute(a.contract, 'deposit')).error.category).toBe('submission_unknown');
    expect((await a.manager.reconcileSubmission()).outcome.status).toBe('unknown');
    expect([...storage.rows.values()][0]).toBe(before); expect(a.sends).toBe(0);
  });
  it('includes intent, session and context digests in durable identity without persisting endpoint or credential material', async () => {
    const a = journal({ context: { orgId: OTHER, scopeKey: TX, generation: 3, authType: 'passkey' } });
    const release = await a.acquire(); const saved = a.begin(callKey('deposit'));
    expect(saved.recovery.scope).toMatchObject({ chainId: 100, accountAddress: ACCOUNT, intentKey: callKey('deposit'), sessionKey: expect.stringMatching(/^0x[0-9a-f]{64}$/), contextKey: expect.stringMatching(/^0x[0-9a-f]{64}$/) });
    await release();
    const b = journal({ context: { orgId: OTHER, scopeKey: TX, generation: 4, authType: 'passkey' } });
    const releaseB = await b.acquire(); b.abandonUnsent(); const changed = b.begin(callKey('deposit'));
    expect(changed.recovery.scope.sessionKey).not.toBe(saved.recovery.scope.sessionKey);
    expect(changed.recovery.scope.contextKey).toBe(saved.recovery.scope.contextKey);
    await releaseB();
  });
  it('prevents stale compare-and-clear from removing a new scoped intent', async () => {
    const a = journal(); let release = await a.acquire(); const old = a.begin(callKey('deposit')); a.abandonUnsent(); const current = a.begin(callKey('withdraw')); await release();
    await journal().clear(old);
    expect(journal().read().recovery.attemptId).toBe(current.recovery.attemptId);
  });
});

describe('EOA acknowledgement loss and exact nonce recovery', () => {
  it.each([1, 0])('recovers accepted-then-error with receipt status %s and exactly one actual send side effect', async status => {
    const first = direct(); let effects = 0;
    first.contract.deposit.mockImplementation(async () => { effects++; throw new Error('send accepted then response lost'); });
    expect((await first.manager.execute(first.contract, 'deposit')).error.category).toBe('submission_unknown');
    const descriptor = listPendingSubmissions(ACCOUNT)[0];
    expect(descriptor.recovery).toMatchObject({ phase: 'submitting', fromBlock: '40', nonce: '7' });
    const reloaded = direct(); reloaded.receipt.status = status; reloaded.client.getBlockNumber.mockResolvedValue(42n);
    expect((await reloaded.manager.execute(reloaded.contract, 'deposit')).error.category).toBe('submission_unknown');
    const recovered = await reloaded.manager.reconcileSubmission();
    expect(recovered.outcome.status).toBe(status ? 'succeeded' : 'failed'); expect(recovered.receipt).toBe(reloaded.receipt);
    expect(effects).toBe(1); expect(reloaded.sends).toBe(0); expect(reloaded.client.getBlock).toHaveBeenCalledTimes(4);
    expect(storage.rows.size).toBe(0);
  });
  it('retains a dropped EOA and a consumed nonce outside the finite search window as unresolved', async () => {
    const a = direct(); a.contract.deposit.mockRejectedValue(new Error('accepted?'));
    await a.manager.execute(a.contract, 'deposit');
    a.client.getBlockNumber.mockResolvedValue(9999999n); a.client.getBlock.mockImplementation(async ({ blockNumber }) => ({ number: blockNumber, transactions: [] }));
    const result = await a.manager.reconcileSubmission();
    expect(result.outcome).toMatchObject({ status: 'unknown', code: 'RECOVERY_WINDOW_EXCEEDED' });
    expect(a.client.getBlock).toHaveBeenCalledTimes(16); expect(storage.rows.size).toBe(1); expect(a.client.getTransactionReceipt).not.toHaveBeenCalled();
  });
  it.each(['succeeded', 'failed', 'replaced', 'wrong-account', 'wrong-nonce', 'wrong-chain', 'orphaned-block', 'foreign-rpc-hash'])('handles ethers mined replacement %s without duplicate sends', async variant => {
    const a = direct(); const blockHash = `0x${'cc'.repeat(32)}`;
    const replacement = { ...a.mined, hash: OTHER, data: a.mined.input, blockHash };
    if (variant === 'replaced') replacement.to = ACCOUNT;
    if (variant === 'wrong-account') replacement.from = TARGET;
    if (variant === 'wrong-nonce') replacement.nonce = 8;
    const replacementReceipt = { ...a.receipt, transactionHash: OTHER, blockHash, status: variant === 'failed' ? 0 : 1 };
    // Wallet diagnostics only select a candidate. The installed core requires independent,
    // exact RPC transaction/receipt identity and canonical inclusion before clearing the row.
    a.client.getTransaction.mockImplementation(async ({ hash }) => hash === OTHER
      ? variant === 'foreign-rpc-hash' ? a.mined : replacement : null);
    a.client.getTransactionReceipt.mockImplementation(async ({ hash }) => hash === OTHER ? replacementReceipt : null);
    a.client.getBlock.mockImplementation(async ({ blockNumber }) => ({ number: blockNumber,
      hash: variant === 'orphaned-block' ? a.receipt.blockHash : blockHash }));
    a.client.getChainId.mockResolvedValue(variant === 'wrong-chain' ? 42161 : replacement.chainId);
    a.contract.deposit.mockResolvedValue({ hash: TX, wait: async () => { throw Object.assign(new Error('replaced'), { code: 'TRANSACTION_REPLACED', replacement, receipt: replacementReceipt }); } });
    const result = await a.manager.execute(a.contract, 'deposit');
    expect(result.success).toBe(variant === 'succeeded');
    if (variant === 'succeeded') expect(result.receipt).toBe(replacementReceipt);
    const unresolved = ['wrong-account', 'wrong-nonce', 'wrong-chain', 'orphaned-block', 'foreign-rpc-hash'].includes(variant);
    if (variant !== 'succeeded') expect(result.error.category).toBe(unresolved ? 'submission_unknown'
      : variant === 'replaced' ? 'transaction_replaced' : 'transaction_failed');
    expect(storage.rows.size).toBe(unresolved ? 1 : 0); expect(a.contract.deposit).toHaveBeenCalledOnce();
    if (!unresolved) {
      expect(a.client.getTransaction).toHaveBeenCalledExactlyOnceWith({ hash: OTHER });
      expect(a.client.getTransactionReceipt.mock.calls).toEqual([[{ hash: OTHER }], [{ hash: OTHER }]]);
      expect(a.client.getBlock.mock.calls).toEqual([[{ blockNumber: replacement.blockNumber }], [{ blockNumber: replacement.blockNumber }]]);
      expect(a.client.getChainId).toHaveBeenCalledTimes(2);
    }
  });
  it('retains a known submitted hash when a later wallet diagnostic claims cancellation', async () => {
    const a = direct();
    a.contract.deposit.mockResolvedValue({ hash: TX, wait: async () => { throw Object.assign(new Error('late cancellation diagnostic'), { code: 4001 }); } });
    expect((await a.manager.execute(a.contract, 'deposit')).error.category).toBe('submission_unknown');
    expect(storage.rows.size).toBe(1);
  });
  it('preserves a confirmed direct receipt when a success observer throws', async () => {
    const a = direct();
    const result = await a.manager.execute(a.contract, 'deposit', [], { onStateChange: state => { if (state === 'success') throw new Error('observer'); } });
    expect(result.success).toBe(true); expect(result.receipt).toBe(a.receipt); expect(storage.rows.size).toBe(0);
  });
  it('rejects wrong-chain receipt evidence and a scope change during recovery without clearing any row', async () => {
    const a = direct(); a.contract.deposit.mockRejectedValue(new Error('response lost')); await a.manager.execute(a.contract, 'deposit');
    a.client.getChainId.mockResolvedValue(42161);
    expect((await a.manager.reconcileSubmission()).outcome.code).toBe('CHAIN_MISMATCH'); expect(storage.rows.size).toBe(1);
    expect(a.client.getBlock).not.toHaveBeenCalled();
  });
});

describe('smart account crash and receipt recovery', () => {
  it('persists the deterministic hash before signing, then fences an old signature after crash/reload', async () => {
    const firstJournal = journal(); let releaseFirst;
    const acquire = firstJournal.acquire.bind(firstJournal);
    firstJournal.acquire = async () => { releaseFirst = await acquire(); return releaseFirst; };
    const first = smart({ submissionJournal: firstJournal });
    const signReached = deferredRecoveryTest(), signGate = deferredRecoveryTest();
    mocks.sign.mockImplementationOnce(async () => { signReached.resolve(); return signGate.promise; });
    const pending = first.manager.execute({ address: TARGET, interface: iface }, 'deposit'); await signReached.promise;
    const saved = journal().read(); expect(saved.recovery.phase).toBe('prepared'); expect(saved.computedHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(JSON.stringify([...storage.rows.values()])).not.toMatch(/PRIVATE|signature|callData|rpcUrl|credential/);
    await releaseFirst();
    const reloaded = smart(); expect((await reloaded.manager.execute({ address: TARGET, interface: iface }, 'deposit')).success).toBe(true);
    signGate.resolve('0x1234'); expect((await pending).success).toBe(false);
    expect(first.sends).toBe(0); expect(reloaded.sends).toBe(1); expect(storage.rows.size).toBe(0);
  });
  it('recovers accepted UserOp with lost hash across sessions using only the computed identity', async () => {
    const a = smart(); const send = a.bundler.sendUserOperation.getMockImplementation(); let effects = 0;
    a.bundler.sendUserOperation.mockImplementation(async op => { effects++; await send(op); throw new Error('network response lost'); });
    expect((await a.manager.execute({ address: TARGET, interface: iface }, 'deposit')).error.category).toBe('submission_unknown');
    const restored = smart(); restored.client.getTransactionReceipt.mockResolvedValue(a.receipt);
    expect((await restored.manager.execute({ address: TARGET, interface: iface }, 'deposit')).error.category).toBe('submission_unknown');
    expect((await restored.manager.reconcileSubmission()).outcome.status).toBe('succeeded');
    expect(effects).toBe(1); expect(a.sends).toBe(1); expect(restored.sends).toBe(0); expect(storage.rows.size).toBe(0);
  });
  it('keeps dropped/replaced UserOps unresolved without another signature or send', async () => {
    const a = smart(); a.bundler.sendUserOperation.mockRejectedValue(new Error('network error'));
    await a.manager.execute({ address: TARGET, interface: iface }, 'deposit');
    const restored = smart(); restored.bundler.getUserOperationReceipt.mockResolvedValue(null);
    const signatures = mocks.sign.mock.calls.length;
    expect((await restored.manager.reconcileSubmission()).outcome.status).toBe('unknown');
    await restored.manager.execute({ address: TARGET, interface: iface }, 'deposit');
    expect(mocks.sign).toHaveBeenCalledTimes(signatures); expect(restored.sends).toBe(0); expect(storage.rows.size).toBe(1);
  });
});
