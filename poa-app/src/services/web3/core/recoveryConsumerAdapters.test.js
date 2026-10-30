import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { submissionIntentKey } from '@poa-box/core/execute/recovery';
import { createSubmissionJournal } from '@/services/web3/core/submissionJournal';
import { reconcileUserOperationSubmission } from '@/services/web3/core/userOperationSubmission';
import { fakeBrowserLocks, recoveryTestStorage } from '@/services/web3/core/submissionTestHelpers';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';
const ACCOUNT = `0x${'11'.repeat(20)}`, TARGET = `0x${'22'.repeat(20)}`;
const TX = `0x${'aa'.repeat(32)}`, BLOCK = `0x${'bb'.repeat(32)}`, OTHER = `0x${'cc'.repeat(32)}`;
let storage, locks;
const journal = () => createSubmissionJournal({ accountAddress: ACCOUNT, chainId: 100, entryPoint: ENTRY_POINT_ADDRESS, storage, locks });
const key = submissionIntentKey([{ to: TARGET, data: '0x12345678', value: '9' }]);
async function saved(known = true) {
  const a = journal(); const release = await a.acquire(); a.begin(key);
  a.write({ kind: 'transaction', phase: 'submitting', chainId: 100, nonce: '7', callKey: key, fromBlock: '40' });
  if (known) a.write({ kind: 'transaction', phase: 'submitted', chainId: 100, nonce: '7', txHash: TX });
  const record = a.read(); await release(); return record;
}
function client() {
  const transaction = { hash: TX, from: ACCOUNT, nonce: 7, to: TARGET, input: '0x12345678', value: 9n, chainId: 100,
    blockNumber: 41n, blockHash: BLOCK };
  const receipt = { transactionHash: TX, status: 'success', blockNumber: 41n, blockHash: BLOCK, logs: [] };
  const publicClient = { getChainId: vi.fn(async () => 100), getTransaction: vi.fn(async () => transaction),
    getTransactionReceipt: vi.fn(async () => receipt), getBlock: vi.fn(async ({ blockNumber }) => ({ number: blockNumber, hash: BLOCK })),
    getBlockNumber: vi.fn(async () => 900n), sendTransaction: vi.fn() };
  return { publicClient, transaction, receipt };
}
beforeEach(() => { storage = recoveryTestStorage(); locks = fakeBrowserLocks(); vi.stubGlobal('window', { localStorage: storage }); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); })); });
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
describe('installed-package recovery transport and fences', () => {
  it.each(['succeeded', 'failed', 'replaced'])('uses full transaction and canonical block fields for %s', async status => {
    const record = await saved(); const f = client();
    if (status === 'failed') f.receipt.status = 'reverted';
    if (status === 'replaced') f.transaction.input = '0x87654321';
    const result = await reconcileUserOperationSubmission(record, null, f.publicClient);
    expect(result.outcome.status).toBe(status); expect(result.receipt).toBe(f.receipt);
    expect(f.publicClient.getTransaction).toHaveBeenCalledExactlyOnceWith({ hash: TX });
    expect(f.publicClient.getBlock).toHaveBeenCalledWith({ blockNumber: 41n });
    expect(f.publicClient.sendTransaction).not.toHaveBeenCalled();
  });
  it.each(['sender', 'nonce', 'chain', 'hash', 'block'])('a successful wrong %s receipt cannot settle the barrier', async mode => {
    const record = await saved(); const f = client();
    if (mode === 'sender') f.transaction.from = TARGET;
    if (mode === 'nonce') f.transaction.nonce = 8;
    if (mode === 'chain') f.transaction.chainId = 42161;
    if (mode === 'hash') f.transaction.hash = OTHER;
    if (mode === 'block') f.publicClient.getBlock.mockResolvedValue({ number: 41n, hash: OTHER });
    expect((await reconcileUserOperationSubmission(record, null, f.publicClient)).outcome.status).toBe('unknown');
    expect(journal().read()).not.toBeNull();
  });
  it('supports an exact manual hash after a bounded-window miss, without scanning or resending', async () => {
    const record = await saved(false); const f = client();
    expect((await reconcileUserOperationSubmission(record, null, f.publicClient, { candidateTxHash: TX })).outcome.status).toBe('succeeded');
    expect(f.publicClient.getBlockNumber).not.toHaveBeenCalled();
    expect(f.publicClient.sendTransaction).not.toHaveBeenCalled();
    f.transaction.from = TARGET;
    expect((await reconcileUserOperationSubmission(record, null, f.publicClient, { candidateTxHash: TX })).outcome.status).toBe('unknown');
  });
  it('keeps incomplete legacy records unknown even with an arbitrary successful receipt', async () => {
    const f = client();
    for (const record of [{ kind: 'transaction', txHash: TX, nonce: '7', chainId: 100, accountAddress: ACCOUNT },
      { computedHash: OTHER, chainId: 100, accountAddress: ACCOUNT, entryPoint: ENTRY_POINT_ADDRESS }]) {
      expect((await reconcileUserOperationSubmission(record, null, f.publicClient)).outcome.status).toBe('unknown');
    }
    expect(f.publicClient.getTransactionReceipt).not.toHaveBeenCalled();
  });
  it('does not claim removal when durable storage retains the exact record', async () => {
    const record = await saved();
    storage.removeItem = () => {};
    expect(await journal().clear(record)).toBe(false);
    expect(journal().read()).toEqual(record);
  });
  it('returns false on contention, revision changes, owner changes and v2/legacy mismatch; true only on exact removal', async () => {
    const a = journal(); const release = await a.acquire(); const old = a.begin(key);
    expect(await journal().clear(old)).toBe(false);
    a.signing(); const newer = a.read(); await release();
    expect(await journal().clear(old)).toBe(false);
    expect(await journal().clear({ ...newer, recovery: { ...newer.recovery, ownerId: 'foreign' } })).toBe(false);
    const { recovery, ...legacy } = newer;
    expect(await journal().clear(legacy)).toBe(false);
    expect(await journal().clear(newer)).toBe(true);
    expect(await journal().clear(newer)).toBe(false);
    expect(journal().read()).toBeNull();
  });
});
