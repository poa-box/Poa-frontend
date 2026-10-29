import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatTransactionReceipt } from 'viem';
import { USER_OPERATION_EVENTS, decodeUserOperationOutcome } from '@poa-box/core/execute/outcome';
import { confirmUserOperation, reconcileUserOperationSubmission } from '@/services/web3/core/userOperationSubmission';

const HASH = `0x${'11'.repeat(32)}`, OTHER = `0x${'22'.repeat(32)}`, TX = `0x${'33'.repeat(32)}`;
const SENDER = `0x${'44'.repeat(20)}`, ENTRY = `0x${'55'.repeat(20)}`, ZERO = `0x${'00'.repeat(20)}`;
const NONCE = (1n << 192n) + 1001n;
const expected = { userOpHash: HASH, entryPoint: ENTRY, sender: SENDER, nonce: NONCE };
const submission = { computedHash: HASH, entryPoint: ENTRY, sender: SENDER, accountAddress: SENDER, nonce: NONCE.toString(), chainId: 100, phase: 'submitted' };
const submitted = { hash: HASH, expected, submission };
const event = (hash = HASH, success = true, nonce = NONCE) => ({ address: ENTRY,
  ...USER_OPERATION_EVENTS.encodeEventLog('UserOperationEvent', [hash, SENDER, ZERO, nonce, success, 10, 20]),
  blockNumber: '0x42', logIndex: '0x0', transactionIndex: '0x0', transactionHash: TX,
});
const formatted = (status = '0x1', logs = [event(OTHER, false), event()]) => formatTransactionReceipt({
  transactionHash: TX, blockNumber: '0x42', status, logs,
});
beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); })));
afterEach(() => vi.unstubAllGlobals());
describe('actual installed viem receipt transport boundary', () => {
  it('normalizes viem success for the exact operation in a mixed bundle, preserving all raw evidence', async () => {
    const receipt = formatted();
    expect(receipt.status).toBe('success');
    expect(decodeUserOperationOutcome(receipt, expected)).toMatchObject({ status: 'unknown', code: 'INVALID_RECEIPT_STATUS' });
    const result = await confirmUserOperation(submitted, { waitForUserOperationReceipt: async () => ({ receipt, success: false }) });
    expect(result.outcome).toMatchObject({ status: 'succeeded', nonce: NONCE.toString(), sender: SENDER });
    expect(result.receipt).toBe(receipt);
    expect(result.receipt.logs).toHaveLength(2);
    expect(receipt.status).toBe('success');
    expect(result).not.toHaveProperty('creationOperation');
    expect(receipt).not.toHaveProperty('creationOperation');
  });
  it.each([['0x0', true, 'OUTER_REVERTED'], ['0x1', false, undefined]])('settles outer %s / inner %s as a failure', async (status, success, code) => {
    const receipt = formatted(status, [event(HASH, success)]);
    const result = await confirmUserOperation(submitted, { waitForUserOperationReceipt: async () => ({ receipt, success: true }) });
    expect(result.outcome.status).toBe('failed');
    if (code) expect(result.outcome.code).toBe(code);
    expect(result.receipt).toBe(receipt);
  });
  it.each(['invalid-status', 'malformed-log', 'other-only', 'wrong-nonce', 'duplicate-target'])('keeps %s unknown despite a bundler success summary', async variant => {
    const receipt = formatted(variant === 'invalid-status' ? '0x2' : '0x1');
    if (variant === 'malformed-log') receipt.logs[1].data += '00';
    if (variant === 'other-only') receipt.logs = [event(OTHER)];
    if (variant === 'wrong-nonce') receipt.logs = [event(HASH, true, NONCE + 1n)];
    if (variant === 'duplicate-target') receipt.logs.push(receipt.logs[1]);
    await expect(confirmUserOperation(submitted, { waitForUserOperationReceipt: async () => ({ receipt, success: true }) }))
      .rejects.toMatchObject({ outcome: { status: 'unknown' } });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses the same narrow normalization for readonly reconciliation and preserves receipt identity', async () => {
    const receipt = formatted();
    const bundler = { getUserOperationReceipt: vi.fn(async () => ({ receipt: { transactionHash: TX } })) };
    const client = { getChainId: vi.fn(async () => 100), getTransactionReceipt: vi.fn(async () => receipt) };
    const result = await reconcileUserOperationSubmission(submission, bundler, client);
    expect(result.outcome).toMatchObject({ status: 'succeeded', nonce: NONCE.toString() });
    expect(result.receipt).toBe(receipt);
    expect(client.getTransactionReceipt).toHaveBeenCalledExactlyOnceWith({ hash: TX });
  });
});
