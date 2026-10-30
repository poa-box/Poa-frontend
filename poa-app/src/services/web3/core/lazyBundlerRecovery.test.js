import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatTransactionReceipt } from 'viem';
import { USER_OPERATION_EVENTS } from '@poa-box/core/execute/outcome';
import { submissionIntentKey } from '@poa-box/core/execute/recovery';
import { createLazyBundler } from '@/lib/wallet/lazyBundler';
import { SmartAccountTransactionManager } from '@/services/web3/core/SmartAccountTransactionManager';
import { createSubmissionJournal, pendingSubmissionError } from '@/services/web3/core/submissionJournal';
import { fakeBrowserLocks, recoveryTestStorage } from '@/services/web3/core/submissionTestHelpers';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';

const writes = vi.hoisted(() => ({ build: vi.fn(), sign: vi.fn() }));
vi.mock('@/services/web3/passkey/userOpBuilder', async importOriginal => ({
  ...await importOriginal(), buildUserOpWithFallback: writes.build,
}));
vi.mock('@/services/web3/passkey/passkeySign', () => ({ signUserOpWithPasskey: writes.sign }));

const ACCOUNT = `0x${'11'.repeat(20)}`;
const TARGET = `0x${'22'.repeat(20)}`;
const HASH = `0x${'aa'.repeat(32)}`;
const OTHER_HASH = `0x${'bb'.repeat(32)}`;
const TX = `0x${'cc'.repeat(32)}`;
const BLOCK = `0x${'dd'.repeat(32)}`;
const NONCE = (1n << 192n) + 138n;
const ZERO = `0x${'00'.repeat(20)}`;
let storage;
let locks;

const journal = () => createSubmissionJournal({ accountAddress: ACCOUNT, chainId: 100,
  entryPoint: ENTRY_POINT_ADDRESS, storage, locks });

function event(hash = HASH) {
  return { address: ENTRY_POINT_ADDRESS,
    ...USER_OPERATION_EVENTS.encodeEventLog('UserOperationEvent', [hash, ACCOUNT, ZERO, NONCE, true, 10, 20]),
    transactionHash: TX, blockNumber: '0x42', logIndex: '0x0', transactionIndex: '0x0' };
}

async function setup(mode = 'mined') {
  // Save only the original identity: the acknowledgement and outer hash were lost.
  const owner = journal();
  const release = await owner.acquire();
  let saved;
  try {
    owner.begin(submissionIntentKey([{ to: TARGET, data: '0x1234', value: '0' }]));
    owner.signing();
    saved = owner.write({ phase: 'submitting', chainId: 100, entryPoint: ENTRY_POINT_ADDRESS,
      sender: ACCOUNT, nonce: NONCE.toString(), computedHash: HASH });
  } finally { await release(); }

  const receipt = formatTransactionReceipt({ transactionHash: TX, blockNumber: '0x42', blockHash: BLOCK, status: '0x1',
    logs: [event(OTHER_HASH), ...(mode === 'unrelated event' ? [] : [event()])] });
  const forbidden = () => { throw new Error('Recovery must only read receipts'); };
  const realClient = {
    getUserOperationReceipt: vi.fn(async function () {
      expect(this).toBe(realClient);
      return mode === 'missing bundler receipt' ? null : { success: false, receipt: { transactionHash: TX } };
    }),
    sendUserOperation: vi.fn(forbidden), waitForUserOperationReceipt: vi.fn(forbidden),
    estimateUserOperationGas: vi.fn(forbidden), getUserOperationGasPrice: vi.fn(forbidden),
  };
  const load = vi.fn(async () => realClient);
  const bundlerClient = createLazyBundler(load);
  const publicClient = {
    getChainId: vi.fn(async () => 100),
    getTransactionReceipt: vi.fn(async () => mode === 'missing chain receipt' ? null : receipt),
    getTransaction: vi.fn(forbidden), getBlock: vi.fn(async ({ blockNumber }) => ({ number: blockNumber, hash: BLOCK })), getBlockNumber: vi.fn(forbidden),
  };
  // Recreate the manager/journal as after navigation, without sending a new operation.
  const manager = new SmartAccountTransactionManager({ accountAddress: ACCOUNT, chainId: 100,
    publicClient, bundlerClient, submissionJournal: journal() });
  const uncertainty = pendingSubmissionError(saved);
  manager._uncertainSubmission = uncertainty;
  expect(load).not.toHaveBeenCalled();
  expect(saved).not.toHaveProperty('txHash');
  expect(saved).not.toHaveProperty('userOpHash');
  return { saved, manager, realClient, publicClient, load, receipt, uncertainty };
}

function expectReadOnly(f) {
  expect(f.load).toHaveBeenCalledOnce();
  expect(f.realClient.getUserOperationReceipt).toHaveBeenCalledExactlyOnceWith({ hash: HASH });
  for (const method of ['sendUserOperation', 'waitForUserOperationReceipt', 'estimateUserOperationGas', 'getUserOperationGasPrice']) {
    expect(f.realClient[method]).not.toHaveBeenCalled();
  }
  for (const method of ['getTransaction', 'getBlockNumber']) {
    expect(f.publicClient[method]).not.toHaveBeenCalled();
  }
  expect(writes.build).not.toHaveBeenCalled();
  expect(writes.sign).not.toHaveBeenCalled();
  expect(locks.held.size).toBe(0);
}

beforeEach(() => {
  vi.clearAllMocks();
  storage = recoveryTestStorage(); locks = fakeBrowserLocks();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe('actual lazy bundler through manager and installed core recovery', () => {
  it('recovers the original lost-ack operation from its exact chain event and durably clears the saved barrier', async () => {
    const f = await setup();
    const result = await f.manager.reconcileSubmission();
    expect(result.outcome).toMatchObject({ status: 'succeeded', userOpHash: HASH, sender: ACCOUNT,
      nonce: NONCE.toString(), txHash: TX });
    expect(result.receipt).toBe(f.receipt);
    expect(result.receipt.status).toBe('success');
    expect(result.receipt.logs).toHaveLength(2);
    expect(f.publicClient.getTransactionReceipt.mock.calls).toEqual([[{ hash: TX }], [{ hash: TX }]]);
    expect(f.publicClient.getBlock.mock.calls).toEqual([[{ blockNumber: 66n }], [{ blockNumber: 66n }]]);
    expect(f.manager.getPendingSubmission()).toBeNull();
    expect(journal().read()).toBeNull();
    expect(storage.length).toBe(0);
    expect(f.manager._uncertainSubmission).toBeNull();
    expectReadOnly(f);
  });

  it.each(['missing bundler receipt', 'missing chain receipt', 'unrelated event'])('retains the exact saved uncertainty for %s', async mode => {
    const f = await setup(mode);
    const result = await f.manager.reconcileSubmission();
    expect(result.outcome.status).toBe('unknown');
    expect(f.manager.getPendingSubmission()).toEqual(f.saved);
    expect(journal().read()).toEqual(f.saved);
    expect(storage.length).toBe(1);
    expect(f.manager._uncertainSubmission).toBe(f.uncertainty);
    if (mode === 'missing bundler receipt') expect(f.publicClient.getTransactionReceipt).not.toHaveBeenCalled();
    else expect(f.publicClient.getTransactionReceipt).toHaveBeenCalledExactlyOnceWith({ hash: TX });
    expect(f.publicClient.getBlock).not.toHaveBeenCalled();
    expectReadOnly(f);
  });
});
