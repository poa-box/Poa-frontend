// Host journal projection. Protocol identity, outcome and nonce checks stay in core.
import { normalizeSubmissionRecovery, submissionIntentKey } from '@poa-box/core/execute/recovery';
import { requireRawUint } from '@poa-box/core/amounts';

export const isRoleTransactionHash = value => typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value);
const address = value => typeof value === 'string' && /^0x[\da-f]{40}$/i.test(value);

/** Only the exact service-to-manager call can bind a ticket to a journal intent. */
export function roleSubmissionIntent(contract, method, args, options = {}) {
  return submissionIntentKey([{ to: contract.address, data: contract.interface.encodeFunctionData(method, args), value: options.value ?? '0' }]);
}

/** An allowlist, never a spread of a manager/error/signed-operation object. */
export function roleRecoveryIdentity(input, scope, intentKey) {
  if (!input || !scope || !isRoleTransactionHash(intentKey)) throw new Error('Saved vote identity is unavailable.');
  const recovery = normalizeSubmissionRecovery(input.recovery);
  if (recovery.scope.chainId !== scope.chainId || recovery.scope.accountAddress !== scope.account
    || recovery.scope.intentKey !== intentKey.toLowerCase() || input.chainId !== scope.chainId
    || input.accountAddress?.toLowerCase() !== scope.account
    || input.orgId && input.orgId.toLowerCase() !== scope.orgId) throw new Error('Saved vote identity does not match this request.');
  const native = recovery.kind === 'transaction';
  if (input.sender !== undefined && input.sender.toLowerCase() !== scope.account
    || recovery.nonce !== undefined && recovery.nonce !== requireRawUint(input.nonce)
    || recovery.computedHash && recovery.computedHash !== input.computedHash?.toLowerCase()
    || recovery.txHash && recovery.txHash !== input.txHash?.toLowerCase()
    || recovery.entryPoint && recovery.entryPoint !== input.entryPoint?.toLowerCase()
    || input.kind === 'transaction' && recovery.kind && !native) throw new Error('Saved vote identity changed.');
  if (!['intent', 'signing', 'prepared', 'submitting', 'submitted', 'receipt'].includes(input.phase)) throw new Error('Saved vote phase is unavailable.');
  return {
    phase: input.phase, chainId: scope.chainId, accountAddress: scope.account, orgId: scope.orgId,
    ...(native ? { kind: 'transaction' } : {}),
    ...(address(input.entryPoint) ? { entryPoint: input.entryPoint.toLowerCase() } : {}),
    ...(input.sender ? { sender: scope.account } : {}),
    ...(recovery.nonce === undefined ? {} : { nonce: recovery.nonce }),
    ...(recovery.computedHash ? { computedHash: recovery.computedHash } : {}),
    ...(isRoleTransactionHash(input.userOpHash) ? { userOpHash: input.userOpHash.toLowerCase() } : {}),
    ...(recovery.txHash ? { txHash: recovery.txHash } : {}),
    recovery,
  };
}

/** A different revision may advance this attempt; another attempt must never replace it. */
export function sameRoleRecoveryAttempt(a, b) {
  return a.recovery.attemptId === b.recovery.attemptId && a.recovery.ownerId === b.recovery.ownerId
    && JSON.stringify(a.recovery.scope) === JSON.stringify(b.recovery.scope);
}
