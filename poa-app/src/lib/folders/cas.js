/**
 * CAS-retry helpers for setFolders.
 *
 * Detect FoldersRootStale, extract the new on-chain root, and surface it to
 * the caller so the UI can re-fetch + re-prompt instead of silently dropping
 * the user's edits.
 *
 * Inputs may be raw ethers errors, ParsedError instances (which wrap the
 * original under `originalError`), or any other transport-layer envelope.
 * The walk below handles all observed shapes.
 */

import { ethers } from 'ethers';

const FOLDERS_ROOT_STALE_IFACE = new ethers.utils.Interface([
  'error FoldersRootStale(bytes32 expected, bytes32 actual)',
]);
const SELECTOR = ethers.utils
  .id('FoldersRootStale(bytes32,bytes32)')
  .slice(0, 10);

/**
 * Recursively gather strings that *could* be the revert data hex, from any
 * known-to-occur location in error envelopes (ethers v5, viem-flavoured
 * wrappers, ParsedError from `services/web3/core/TransactionManager`, etc.).
 */
function collectCandidates(err, out = [], seen = new Set()) {
  if (!err || seen.has(err)) return out;
  seen.add(err);

  // Strings get pushed directly.
  if (typeof err === 'string') {
    out.push(err);
    return out;
  }

  // Property bag — look in the usual hiding places.
  const fields = [
    err.data,
    err.error,
    err.error?.data,
    err.error?.data?.data,
    err.cause,
    err.cause?.data,
    err.originalError,
    err.originalError?.data,
    err.originalError?.error,
    err.originalError?.error?.data,
    err.originalError?.error?.data?.data,
    err.info?.error?.data,
    err.reason,
    err.message,
  ];
  for (const f of fields) {
    if (typeof f === 'string') {
      out.push(f);
    } else if (f && typeof f === 'object') {
      collectCandidates(f, out, seen);
    }
  }
  return out;
}

/**
 * If `error` is a FoldersRootStale revert, return `{ expected, actual }`.
 * Otherwise return null.
 */
export function parseFoldersRootStale(error) {
  if (!error) return null;

  const candidates = collectCandidates(error);

  for (const data of candidates) {
    if (typeof data !== 'string' || !data.toLowerCase().startsWith(SELECTOR)) continue;
    try {
      const decoded = FOLDERS_ROOT_STALE_IFACE.decodeErrorResult(
        'FoldersRootStale',
        data
      );
      return {
        expected: decoded.expected,
        actual: decoded.actual,
      };
    } catch {
      // fall through
    }
  }

  // Soft signal: revert message text mentions the error by name. We won't
  // have expected/actual values but we still want CAS-retry to engage.
  for (const text of candidates) {
    if (typeof text === 'string' && text.includes('FoldersRootStale')) {
      return { expected: null, actual: null };
    }
  }

  return null;
}
