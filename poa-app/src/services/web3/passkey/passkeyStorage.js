/** Historical public credential pointers and migration records share the SDK store.
 * Resolve browser globals only when used, so public/SSR readers remain inert.
 */
import { createPasskeyCredentialStore } from '@poa-box/browser/storage';

const credentials = createPasskeyCredentialStore({
  storage: {
    getItem: key => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: key => localStorage.removeItem(key),
  },
  now: () => Date.now(),
  randomUUID: () => globalThis.crypto.randomUUID(),
  onEnrollment: () => {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event('poa:enrollment'));
    }
  },
});

export const {
  savePasskeyCredential,
  getAllCredentials,
  getLastUsedCredential,
  removeCredential,
  clearAllCredentials,
  hasStoredCredentials,
  pendingEnrollmentKey,
  readPendingEnrollment,
  enrollmentTarget,
  requirePendingEnrollment,
  savePendingCredential,
  getPendingCredentialForOrg,
  findPendingCredentialByCredentialId,
  removePendingCredential,
  readEnrollmentMigration,
  saveEnrollmentMigration,
  saveEnrollmentRestart,
} = credentials;
