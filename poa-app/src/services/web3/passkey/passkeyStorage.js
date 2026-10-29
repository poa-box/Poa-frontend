/**
 * passkeyStorage.js
 * Persist passkey credential data in localStorage for returning users.
 */

const STORAGE_KEY = 'poa-passkey-credentials';
const PENDING_STORAGE_KEY = 'poa-passkey-pending';

/**
 * Save passkey credential after successful onboarding.
 * @param {Object} data
 * @param {string} data.credentialId - bytes32 hex
 * @param {string} data.rawCredentialId - base64url (needed for WebAuthn allowCredentials)
 * @param {string} data.publicKeyX - bytes32 hex
 * @param {string} data.publicKeyY - bytes32 hex
 * @param {string} data.accountAddress - Deployed smart account address
 * @param {string} data.salt - uint256 hex string
 */
export function savePasskeyCredential(data) {
  const existing = getAllCredentials();
  existing[data.accountAddress.toLowerCase()] = {
    ...data,
    savedAt: Date.now(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

/**
 * Get all saved passkey credentials.
 * @returns {Object} Map of accountAddress -> credential data
 */
export function getAllCredentials() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

/**
 * Get the most recently saved credential (for auto-reconnect).
 * @returns {Object|null} Most recent credential or null
 */
export function getLastUsedCredential() {
  const all = getAllCredentials();
  const entries = Object.values(all);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
}

/**
 * Remove a saved credential.
 * @param {string} accountAddress
 */
export function removeCredential(accountAddress) {
  const existing = getAllCredentials();
  delete existing[accountAddress.toLowerCase()];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

/**
 * Remove ALL saved passkey credentials — a full local "forget this device" sign-out.
 * Non-destructive to the authenticator: the passkey still lives in the device/hardware, so the
 * user can re-attach later via discoverable WebAuthn ("Sign in with passkey"). This only drops the
 * cached credential pointers that drive auto-restore, so a signed-out state actually sticks.
 */
export function clearAllCredentials() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Check if any passkey credentials are saved.
 * @returns {boolean}
 */
export function hasStoredCredentials() {
  return Object.keys(getAllCredentials()).length > 0;
}

// ── Pending (pre-deployment) credential storage ──

const address = value => typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value) && !/^0x0{40}$/i.test(value);

/** One enrollment slot per observed account infrastructure; display/org names are never identity. */
export function pendingEnrollmentKey(source) {
  const chainId = source?.credentialChainId ?? source?.chainId;
  if (!Number.isSafeInteger(chainId) || chainId <= 0 || !address(source?.registryAddress) || !address(source?.factoryAddress)) return null;
  return `enrollment:${chainId}:${source.registryAddress.toLowerCase()}:${source.factoryAddress.toLowerCase()}`;
}

function getAllPendingCredentials(strict = false) {
  try {
    const all = JSON.parse(localStorage.getItem(PENDING_STORAGE_KEY) || '{}');
    if (!all || typeof all !== 'object' || Array.isArray(all)
      || Object.values(all).some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Invalid saved account setup.');
    return all;
  } catch (error) {
    if (strict) throw new Error('Your earlier account setup could not be read. Check it before creating another account.');
    return {};
  }
}

/** Explicit legacy lookup: source fields qualify old entries; a display name never does.
 * Any unresolved enrollment blocks another credential, even after switching enrollment flows.
 */
export function readPendingEnrollment(source) {
  const key = pendingEnrollmentKey(source);
  const all = getAllPendingCredentials(true);
  const rows = Object.entries(all);
  if (!rows.length) return null;
  const matched = rows.find(([storedKey, row]) => key && storedKey === key && pendingEnrollmentKey(row) === key)
    || rows.find(([, row]) => key && pendingEnrollmentKey(row) === key);
  const [storedKey, credential] = matched || rows[0];
  const provenance = matched ? (storedKey === key ? 'matched' : 'legacy-qualified')
    : pendingEnrollmentKey(credential) ? 'other-source' : 'legacy-unknown';
  return { credential, provenance, key: storedKey };
}

export function enrollmentTarget(source) {
  return (source.targetAddress || source.zkEmailInvitesAddress || (source.mode === 'solidarity' ? source.registryAddress : source.quickJoinAddress) || source.registryAddress)?.toLowerCase() || null;
}

export function requirePendingEnrollment(source, { flow, username } = {}) {
  const pending = readPendingEnrollment(source);
  if (!pending) return null;
  if (!['matched', 'legacy-qualified'].includes(pending.provenance)
    || (source.initiator && JSON.stringify(pending.credential.initiator) !== JSON.stringify(source.initiator))
    || (source.orgId?.toLowerCase() ?? null) !== (pending.credential.orgId?.toLowerCase() ?? null)
    || pending.credential.targetAddress?.toLowerCase() !== enrollmentTarget(source)
    || (flow && pending.credential.flow !== flow) || (username && pending.credential.username !== username)) {
    throw new Error('Finish or check your earlier account setup before creating another account.');
  }
  return pending.credential;
}

/** Public pointers only. Unknown legacy sources stay explicitly unqualified. */
export function savePendingCredential(data) {
  const existing = getAllPendingCredentials(true);
  const key = pendingEnrollmentKey(data);
  const legacyKey = String(data.orgName || data.orgId || '').toLowerCase();
  if (!key && !legacyKey) throw new Error('The account setup source is unavailable.');
  const previous = Object.entries(existing).find(([, row]) => row.credentialId === data.credentialId
    && row.accountAddress?.toLowerCase() === data.accountAddress?.toLowerCase());
  if (previous && previous[0] !== (key || legacyKey)) delete existing[previous[0]];
  existing[key || legacyKey] = { ...data, sourceProvenance: key ? 'observed' : 'legacy-unknown', savedAt: Date.now() };
  localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(existing));
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event('poa:enrollment'));
}

/** Compatibility lookup for discovery/E2E callers. Enrollment actions use readPendingEnrollment. */
export function getPendingCredentialForOrg(orgName) {
  if (!orgName) return null;
  const key = orgName.toLowerCase();
  const all = getAllPendingCredentials();
  return all[key] || Object.values(all).find(row => row.orgId?.toLowerCase() === key || row.orgName?.toLowerCase() === key) || null;
}

export function findPendingCredentialByCredentialId(credentialId) {
  if (!credentialId) return null;
  return Object.values(getAllPendingCredentials()).find(row => row.credentialId?.toLowerCase() === credentialId.toLowerCase()) || null;
}

/** Discard is forbidden while the original submission is unresolved. */
export function removePendingCredential(accountAddress, source, expectedPending) {
  if (!accountAddress) return;
  const existing = getAllPendingCredentials(true);
  if (expectedPending && JSON.stringify(existing[expectedPending.key]) !== JSON.stringify(expectedPending.credential)) throw new Error('Your saved account setup changed. Check it again.');
  for (const key of Object.keys(existing)) {
    if (existing[key].accountAddress?.toLowerCase() === accountAddress.toLowerCase()
      && (!source || pendingEnrollmentKey(existing[key]) === pendingEnrollmentKey(source))) delete existing[key];
  }
  localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(existing));
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event('poa:enrollment'));
}

const RECOVERY_STORAGE_KEY = 'poa-passkey-enrollment-recovery:v1';
const RESTART_STORAGE_KEY = 'poa-passkey-enrollment-restarts:v1';

/** Recovery pointers are never active credentials and never overwrite the original. */
export function readEnrollmentMigration(recoveryId) {
  return JSON.parse(localStorage.getItem(RECOVERY_STORAGE_KEY) || '{}')[recoveryId];
}

export function saveEnrollmentMigration(record, expectedPending) {
  const rowsByKey = getAllPendingCredentials(true);
  const current = rowsByKey[expectedPending.key] && { key: expectedPending.key, credential: rowsByKey[expectedPending.key] };
  if (!current || current.key !== expectedPending.key
    || JSON.stringify(current.credential) !== JSON.stringify(expectedPending.credential)
    || record.authorization !== 'recovery-only' || record.activationAllowed !== false
    || record.audit.legacyRecordId !== expectedPending.key) throw new Error('Your saved account setup changed. Check it again.');
  const rows = JSON.parse(localStorage.getItem(RECOVERY_STORAGE_KEY) || '{}');
  const previous = rows[record.audit.recoveryId];
  if (previous && JSON.stringify(previous) !== JSON.stringify(record)) throw new Error('Your saved recovery changed. Check it again.');
  rows[record.audit.recoveryId] = record;
  localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(rows));
}

/** Explicit existing-account restart leaves every pending credential and journal intact. */
export function saveEnrollmentRestart({ pending, accountAddress, source }) {
  const current = readPendingEnrollment(source);
  if (!current || current.key !== pending.key || JSON.stringify(current.credential) !== JSON.stringify(pending.credential)) {
    throw new Error('Your saved account setup changed. Check it again.');
  }
  const rows = JSON.parse(localStorage.getItem(RESTART_STORAGE_KEY) || '{}');
  const id = globalThis.crypto.randomUUID();
  rows[id] = { legacyRecordId: pending.key, legacyCredentialId: pending.credential.credentialId,
    accountAddress: accountAddress.toLowerCase(), sourceKey: pendingEnrollmentKey(source),
    orgId: source.orgId, targetAddress: enrollmentTarget(source), action: 'claim-with-existing-account', retainedLegacy: true };
  localStorage.setItem(RESTART_STORAGE_KEY, JSON.stringify(rows));
  return id;
}
