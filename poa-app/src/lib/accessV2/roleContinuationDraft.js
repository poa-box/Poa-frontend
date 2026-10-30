// Host persistence only. These saved fields are drafts / lookup hints, never proof.
import { normalizeRoleForm, roleFormError } from '@/lib/accessV2/roleFormBatch';
import { roleRecoveryIdentity, isRoleTransactionHash } from '@/lib/accessV2/roleSubmissionRecovery';
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
    return rows.filter(row => [1, 2].includes(row?.version) && typeof row.id === 'string' && /^[\w-]{1,80}$/.test(row.id)
      && JSON.stringify(row.scope) === JSON.stringify(scope) && !roleFormError(row.form)
      && statuses.has(row.creation?.status) && address(row.creation?.call?.target)
      && row.creation.call.target.toLowerCase() === scope.authority && row.creation.call.value === '0'
      && /^0x[\da-f]+$/i.test(row.creation.call.calldata || '') && row.creation.call.calldata.length <= 100_000
      && (!row.creation.transactionHash || hash(row.creation.transactionHash))
      && (!row.creation.proposalId || /^\d+$/.test(row.creation.proposalId)))
      .map(row => ({ ...row, form: normalizeRoleForm(row.form), creation: cleanStage(row.creation, scope),
        ...(row.configuration ? { configuration: cleanStage(row.configuration, scope) } : {}),
        ...(row.configurationHistory ? { configurationHistory: row.configurationHistory.map(stage => cleanStage(stage, scope)) } : {}) }));
  } catch { return []; }
}
export function saveRoleContinuation(storage, scope, record) {
  if (!storage || !scope) throw new Error('Your role settings could not be saved. Enable browser storage before submitting.');
  const rows = readRoleContinuations(storage, scope);
  const next = { ...record, version: 2, scope, form: normalizeRoleForm(record.form), creation: cleanStage(record.creation, scope),
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
