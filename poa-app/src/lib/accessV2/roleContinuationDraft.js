// Host persistence only. These saved fields are drafts / lookup hints, never proof.
import { normalizeRoleForm, roleFormError } from '@/lib/accessV2/roleFormBatch';
// Host journal projection. Protocol identity, outcome and nonce checks stay in core.
import { normalizeSubmissionRecovery } from '@poa-box/core/execute/recovery';
import { requireRawUint } from '@poa-box/core/amounts';

export const isRoleTransactionHash = value => typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value);


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


const PREFIX = 'poa:roleContinuation:v1:';
const address = value => /^0x[\da-f]{40}$/i.test(value || '') && !/^0x0{40}$/i.test(value);
const hash = value => /^0x[\da-f]{64}$/i.test(value || '');
const statuses = new Set(['submitting', 'uncertain', 'pending', 'failed', 'rejected', 'created']);
const cleanStage = (stage, scope) => {
  if (!stage) return undefined;
  const result = Object.fromEntries(['status', 'call', 'batch', 'proposalId', 'transactionHash', 'attemptId', 'expectedIntentKey',
    'failureKind', 'transportOutcome', 'transportStarted', 'recoveryInvalid'].filter(key => stage[key] !== undefined).map(key => [key, stage[key]]));
  if (stage.submission) {
    try { result.submission = roleRecoveryIdentity(stage.submission, scope, stage.expectedIntentKey); }
    catch { result.recoveryInvalid = true; result.status = 'uncertain'; }
  }
  if (Array.isArray(stage.submissionHistory)) {
    try { result.submissionHistory = stage.submissionHistory.map(input => roleRecoveryIdentity(input, scope, stage.expectedIntentKey)); }
    catch { result.recoveryInvalid = true; result.status = 'uncertain'; }
  }
  if (stage.expectedIntentKey && !isRoleTransactionHash(stage.expectedIntentKey)) { result.recoveryInvalid = true; result.status = 'uncertain'; }
  return result;
};
export function roleContinuationScope({ chainId, orgId, authority, hybridVoting, executor, account, endpoint }) {
  if (!Number.isSafeInteger(chainId) || chainId <= 0 || !orgId || !endpoint
    || ![authority, hybridVoting, executor, account].every(address)) return null;
  return { chainId, orgId: orgId.toLowerCase(), authority: authority.toLowerCase(), hybridVoting: hybridVoting.toLowerCase(),
    executor: executor.toLowerCase(), account: account.toLowerCase(), endpoint };
}
export const roleContinuationKey = scope => scope ? PREFIX + JSON.stringify(scope) : null;
export function readRoleContinuations(storage, scope) {
  if (!scope || !storage) return [];
  try {
    const raw = storage.getItem(roleContinuationKey(scope));
    if (!raw || raw.length > 1_000_000) return [];
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows) || rows.length > 50) return [];
    return rows.filter(row => [1, 2, 3].includes(row?.version) && typeof row.id === 'string' && /^[\w-]{1,80}$/.test(row.id)
      && JSON.stringify(row.scope) === JSON.stringify(scope) && !roleFormError(row.form)
      && (row.version === 3 && !row.creation && Array.isArray(row.publications) || statuses.has(row.creation?.status) && address(row.creation?.call?.target)
      && row.creation.call.target.toLowerCase() === scope.authority && row.creation.call.value === '0'
      && /^0x[\da-f]+$/i.test(row.creation.call.calldata || '') && row.creation.call.calldata.length <= 100_000
      && (!row.creation.transactionHash || hash(row.creation.transactionHash))
      && (!row.creation.proposalId || /^\d+$/.test(row.creation.proposalId))))
      .map(row => ({ ...row, form: normalizeRoleForm(row.form), creation: cleanStage(row.creation, scope),
        ...(row.configuration ? { configuration: cleanStage(row.configuration, scope) } : {}),
        ...(row.configurationHistory ? { configurationHistory: row.configurationHistory.map(stage => cleanStage(stage, scope)) } : {}) }));
  } catch { return []; }
}
export function saveRoleContinuation(storage, scope, record) {
  if (!storage || !scope) throw new Error('Your role settings could not be saved. Enable browser storage before submitting.');
  const rows = readRoleContinuations(storage, scope);
  const next = { ...record, revision: (rows.find(row => row.id === record.id)?.revision || 0) + 1, version: 3, scope, form: normalizeRoleForm(record.form), creation: cleanStage(record.creation, scope),
    ...(record.configuration ? { configuration: cleanStage(record.configuration, scope) } : {}),
    ...(record.configurationHistory ? { configurationHistory: record.configurationHistory.map(stage => cleanStage(stage, scope)) } : {}) };
  const index = rows.findIndex(row => row.id === next.id);
  if (index < 0) {
    if (rows.length >= 50) throw new Error('Your saved role list is full. Keep your existing votes before starting another.');
    rows.push(next);
  } else rows[index] = next;
  const json = JSON.stringify(rows);
  if (json.length > 1_000_000) throw new Error('These role settings are too large to save.');
  storage.setItem(roleContinuationKey(scope), json);
  if (storage.getItem(roleContinuationKey(scope)) !== json) throw new Error('Your role settings could not be saved.');
  return next;
}
