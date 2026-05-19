import { describe, it, expect } from 'vitest';
import { parseError } from './ErrorParser';
import { Web3ErrorCategory, TransactionError } from './Web3Error';

// Real-world shape: go-ethereum's RPC rejection of a tx whose signature S
// has a leading zero byte. The wallet wraps it as -32603 but the canonical
// `rlp: non-canonical` text is preserved somewhere in the envelope.
const STALE_S_MESSAGE =
  '-32602: rlp: non-canonical integer (leading zero bytes) for *big.Int, decoding into (types.DynamicFeeTx).S';

describe('Web3ErrorCategory detection — wallet signature', () => {
  it('detects the non-canonical RLP error when the message is top-level', () => {
    const err = { message: STALE_S_MESSAGE };
    expect(TransactionError.detectCategory(err)).toBe(Web3ErrorCategory.WALLET_SIGNATURE);
  });

  it('detects the message when nested under error.error.data.message', () => {
    const err = {
      code: -32603,
      message: 'Error processing the transaction',
      error: { data: { message: STALE_S_MESSAGE } },
    };
    expect(TransactionError.detectCategory(err)).toBe(Web3ErrorCategory.WALLET_SIGNATURE);
  });

  it('detects the message when nested under originalError', () => {
    const err = {
      category: 'CONTRACT_REVERT',
      originalError: { error: { message: STALE_S_MESSAGE } },
    };
    expect(TransactionError.detectCategory(err)).toBe(Web3ErrorCategory.WALLET_SIGNATURE);
  });

  it('detects the looser "non-canonical integer (leading zero" prefix variant', () => {
    const err = {
      message: 'non-canonical integer (leading zero bytes) at offset 64',
    };
    expect(TransactionError.detectCategory(err)).toBe(Web3ErrorCategory.WALLET_SIGNATURE);
  });

  it('does NOT misclassify unrelated -32602 errors', () => {
    const err = { code: -32602, message: 'invalid argument 0: missing field' };
    expect(TransactionError.detectCategory(err)).not.toBe(Web3ErrorCategory.WALLET_SIGNATURE);
  });

  it('does NOT misclassify a contract revert that happens to contain "non-canonical"', () => {
    // The patterns require the rlp/big-int context. A revert string with the
    // word "non-canonical" in it shouldn't trigger the wallet-signature path.
    const err = {
      code: -32000,
      reason: 'execution reverted: NonCanonicalOrder()',
      message: 'execution reverted: NonCanonicalOrder()',
    };
    expect(TransactionError.detectCategory(err)).not.toBe(Web3ErrorCategory.WALLET_SIGNATURE);
  });

  it('takes priority over CONTRACT_REVERT when the message looks like a revert', () => {
    // Some wallets wrap the rlp error as "execution reverted: <inner>" — the
    // wallet-signature detector must fire before the contract-revert fallback.
    const err = {
      reason: 'execution reverted',
      message: STALE_S_MESSAGE,
    };
    expect(TransactionError.detectCategory(err)).toBe(Web3ErrorCategory.WALLET_SIGNATURE);
  });

  it('tolerates circular references in the error envelope', () => {
    const a = { message: STALE_S_MESSAGE };
    const b = { parent: a };
    a.child = b;
    expect(() => TransactionError.detectCategory(a)).not.toThrow();
    expect(TransactionError.detectCategory(a)).toBe(Web3ErrorCategory.WALLET_SIGNATURE);
  });
});

describe('parseError — wallet signature dispatch', () => {
  it('returns a ParsedError with the friendly retry message', () => {
    const err = { message: STALE_S_MESSAGE };
    const parsed = parseError(err);
    expect(parsed.category).toBe(Web3ErrorCategory.WALLET_SIGNATURE);
    expect(parsed.userMessage).toMatch(/click again to retry/i);
    expect(parsed.technicalMessage).toMatch(/non-canonical/i);
    expect(parsed.originalError).toBe(err);
  });
});
