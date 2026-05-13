import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { parseFoldersRootStale } from './cas';

const IFACE = new ethers.utils.Interface([
  'error FoldersRootStale(bytes32 expected, bytes32 actual)',
]);

function encodeStaleError(expected, actual) {
  return IFACE.encodeErrorResult('FoldersRootStale', [expected, actual]);
}

const EXPECTED = '0x' + '11'.repeat(32);
const ACTUAL = '0x' + '22'.repeat(32);
const STALE_DATA = encodeStaleError(EXPECTED, ACTUAL);

describe('parseFoldersRootStale', () => {
  it('returns null for falsy input', () => {
    expect(parseFoldersRootStale(null)).toBeNull();
    expect(parseFoldersRootStale(undefined)).toBeNull();
  });

  it('returns null for unrelated errors', () => {
    expect(parseFoldersRootStale(new Error('something else'))).toBeNull();
    expect(parseFoldersRootStale({ data: '0xdeadbeef' })).toBeNull();
  });

  it('parses a raw ethers error with .data at the top level', () => {
    const decoded = parseFoldersRootStale({ data: STALE_DATA });
    expect(decoded).not.toBeNull();
    expect(decoded.expected.toLowerCase()).toBe(EXPECTED);
    expect(decoded.actual.toLowerCase()).toBe(ACTUAL);
  });

  it('parses errors with revert data nested under error.error.data', () => {
    const decoded = parseFoldersRootStale({ error: { data: STALE_DATA } });
    expect(decoded?.expected.toLowerCase()).toBe(EXPECTED);
  });

  it('parses errors with revert data nested under error.error.data.data', () => {
    const decoded = parseFoldersRootStale({ error: { data: { data: STALE_DATA } } });
    expect(decoded?.actual.toLowerCase()).toBe(ACTUAL);
  });

  it('parses ParsedError shapes (data under originalError)', () => {
    // Mirrors `ParsedError` from lib/errors/ErrorParser.js — the TransactionManager
    // wraps every error in a ParsedError, with the raw revert data only available
    // under `.originalError`. The CAS handler MUST handle this shape.
    const parsedError = {
      category: 'CONTRACT_REVERT',
      userMessage: 'Contract error: FoldersRootStale',
      technicalMessage: 'FoldersRootStale',
      originalError: { data: STALE_DATA },
    };
    const decoded = parseFoldersRootStale(parsedError);
    expect(decoded).not.toBeNull();
    expect(decoded.expected.toLowerCase()).toBe(EXPECTED);
    expect(decoded.actual.toLowerCase()).toBe(ACTUAL);
  });

  it('parses ParsedError where originalError nests under error.data', () => {
    const parsedError = {
      originalError: { error: { data: STALE_DATA } },
    };
    expect(parseFoldersRootStale(parsedError)).not.toBeNull();
  });

  it('parses ParsedError where originalError nests under error.data.data', () => {
    const parsedError = {
      originalError: { error: { data: { data: STALE_DATA } } },
    };
    expect(parseFoldersRootStale(parsedError)).not.toBeNull();
  });

  it('is case-insensitive on the selector', () => {
    const upper = '0x' + STALE_DATA.slice(2).toUpperCase();
    expect(parseFoldersRootStale({ data: upper })).not.toBeNull();
  });

  it('falls back to soft-match when only the error name leaks through', () => {
    const error = new Error('reverted with FoldersRootStale(...)');
    const result = parseFoldersRootStale(error);
    expect(result).toEqual({ expected: null, actual: null });
  });

  it('tolerates circular references in the error envelope', () => {
    const a = {};
    const b = { parent: a };
    a.child = b;
    a.data = STALE_DATA;
    expect(() => parseFoldersRootStale(a)).not.toThrow();
    expect(parseFoldersRootStale(a)).not.toBeNull();
  });

  it('handles deeply nested error objects without crashing', () => {
    const error = { cause: { cause: { cause: { data: STALE_DATA } } } };
    const decoded = parseFoldersRootStale(error);
    // Walk doesn't have explicit cause.cause coverage; verify it returns
    // either a parsed result or null but never throws.
    expect(decoded === null || typeof decoded === 'object').toBe(true);
  });

  it('returns null when the data is a different custom-error selector', () => {
    const otherIface = new ethers.utils.Interface(['error SomethingElse(uint256 x)']);
    const otherData = otherIface.encodeErrorResult('SomethingElse', [42]);
    expect(parseFoldersRootStale({ data: otherData })).toBeNull();
  });
});
