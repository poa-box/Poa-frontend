/**
 * passkeyStorage.js
 * Persist passkey credential data in localStorage for returning users.
 */

const STORAGE_KEY = 'poa-passkey-credentials';

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
 * Check if any passkey credentials are saved.
 * @returns {boolean}
 */
export function hasStoredCredentials() {
  return Object.keys(getAllCredentials()).length > 0;
}
