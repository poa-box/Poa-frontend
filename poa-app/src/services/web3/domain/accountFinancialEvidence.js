import { requireRawUint } from '@poa-box/core/amounts';
import { assertPlanScope, assertSourceRef, unknownFact } from '@poa-box/core/data/facts';

export function knownRawAmount(value) {
  if (value == null) return null;
  try { return requireRawUint(value); } catch { return null; }
}

export function assetActionsAvailable({ token, nativeBalance, errors = [], coverage }) {
  return coverage === 'complete' || coverage === 'incomplete'
    ? knownRawAmount(token?.balance) !== null && BigInt(token.balance) > 0n
      && knownRawAmount(nativeBalance) !== null && BigInt(nativeBalance) > 0n
      && !errors.some(error => error.chainId === token.chainId &&
        (!error.token || error.token.toLowerCase() === token.address?.toLowerCase()))
    : false;
}

// A successful empty legacy array is the service's documented known-empty result.
// A nonempty array without coverage cannot establish fresh recovery evidence.
export function cashoutHistoryCoverage(rows) {
  return rows.coverage || { status: rows.length ? 'unavailable' : 'complete', issues: [] };
}

export function cashoutRowKey(row) {
  return row.kind === 'unfilled' ? `unfilled:${String(row.depositId)}`
    : row.kind === 'failed' ? `failed:${row.requestHash?.toLowerCase()}` : '';
}

export function mergeCashoutHistoryRows(previous, next, coverage) {
  if (coverage.status === 'complete') return next;
  const observed = new Set(next.map(cashoutRowKey));
  return [...next, ...previous.filter(row => !observed.has(cashoutRowKey(row))).map(row => ({ ...row,
    recoveryFacts: unknownFact('CURRENT_CASHOUT_STATE_UNAVAILABLE', row.recoveryFacts?.source),
  }))];
}

/** Consume core's owner/amount projection, then apply the host's EOA capability.
 * Permit2 initiation and transaction-only recovery are distinct capabilities. */
export function cashoutRecoveryDecision({ row, descriptor, accountAddress, chainId,
  canTransact = false, isPasskeyUser = false, coverage }) {
  const denied = { allowed: false, reason: 'Recovery details unavailable. Refresh before continuing.' };
  if (isPasskeyUser || !canTransact) return { ...denied, reason: 'Connect the wallet that owns this cashout to recover it.' };
  if (!['complete', 'incomplete'].includes(coverage?.status)) return denied;
  const fact = row?.recoveryFacts;
  if (fact?.state !== 'known' || !fact.source || !accountAddress || chainId !== descriptor.chainId) return denied;
  try {
    const kind = row.kind === 'unfilled' ? 'escrow' : row.kind === 'failed' ? 'failed' : null;
    if (!kind || fact.value.kind !== kind) return denied;
    assertSourceRef(fact.source);
    assertPlanScope(fact.source, { account: accountAddress, chainId,
      contract: kind === 'escrow' ? descriptor.escrow : descriptor.relay });
    if (fact.source.indexed || fact.source.snapshot !== 'pinned' || !fact.source.block?.hash) return denied;
    if (fact.value.transactionOnlyCapability?.state === 'known' && fact.value.transactionOnlyCapability.value !== true) return denied;
    const amountRaw = requireRawUint(fact.value.recoverableAmountRaw);
    const displayedRaw = knownRawAmount(row.kind === 'unfilled' ? row.remainingAmount : row.amount);
    if (fact.value.owner !== true || BigInt(amountRaw) === 0n || displayedRaw !== amountRaw) return denied;
    return { allowed: true, amountRaw };
  } catch { return denied; }
}

export function sameCashoutRecovery(reviewed, fresh) {
  try {
    const before = reviewed.recoveryFacts, after = fresh.recoveryFacts;
    return cashoutRowKey(reviewed) === cashoutRowKey(fresh)
      && reviewed.requestHash?.toLowerCase() === fresh.requestHash?.toLowerCase()
      && before.state === 'known' && after.state === 'known'
      && before.value.owner === after.value.owner
      && before.value.recoverableAmountRaw === after.value.recoverableAmountRaw
      && before.value.outstandingIntentAmountRaw === after.value.outstandingIntentAmountRaw
      && BigInt(after.source.block.number) >= BigInt(before.source.block.number)
      && (after.source.block.number !== before.source.block.number ||
        after.source.block.hash.toLowerCase() === before.source.block.hash.toLowerCase());
  } catch { return false; }
}
