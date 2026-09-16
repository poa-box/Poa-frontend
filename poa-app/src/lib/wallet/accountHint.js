// Untrusted public-query hint only. Never use this as identity or permissions.
export const ACCOUNT_HINT_KEY = 'poa:account-hint:v1';
const SIGN_OUT_KEY = 'poa:explicit-sign-out';
const PASSKEY_KEY = 'poa-passkey-credentials';
const addressPattern = /^0x[0-9a-fA-F]{40}$/;
export function validateAccountHint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.address !== 'string' || !addressPattern.test(value.address) || /^0x0{40}$/i.test(value.address)) return null;
  if (!['eoa', 'passkey'].includes(value.authType)) return null;
  if (!Number.isSafeInteger(value.updatedAt) || value.updatedAt < 0) return null;
  return { address: value.address.toLowerCase(), authType: value.authType, updatedAt: value.updatedAt };
}
export function readAccountHint(browser) {
  if (!browser) return null;
  try {
    // Storage errors fail closed; even public prefetch must respect sign-out.
    if (browser.sessionStorage.getItem(SIGN_OUT_KEY) === '1' || browser.localStorage.getItem(SIGN_OUT_KEY) === '1') return null;
    const compact = browser.localStorage.getItem(ACCOUNT_HINT_KEY);
    if (compact !== null) return validateAccountHint(JSON.parse(compact));
    const credentials = JSON.parse(browser.localStorage.getItem(PASSKEY_KEY) || '{}');
    if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) return null;
    return Object.entries(credentials).map(([key, credential]) => {
      if (!credential || typeof credential !== 'object' || key.toLowerCase() !== credential.accountAddress?.toLowerCase()) return null;
      return validateAccountHint({ address: credential.accountAddress, authType: 'passkey', updatedAt: credential.savedAt ?? 0 });
    }).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
  } catch { return null; }
}
export function hintFromVerifiedAuth(auth, now = Date.now()) {
  if (auth?.isAuthHydrated !== true || auth?.isAuthenticated !== true) return null;
  return validateAccountHint({ address: auth.accountAddress, authType: auth.authType, updatedAt: now });
}
export function persistAccountHint(browser, hint) {
  const validated = validateAccountHint(hint);
  if (!browser || !validated) return;
  try { browser.localStorage.setItem(ACCOUNT_HINT_KEY, JSON.stringify(validated)); } catch { /* Optional optimization. */ }
}
export function removeAccountHint(browser) {
  try { browser?.localStorage.removeItem(ACCOUNT_HINT_KEY); } catch { /* In-memory hint is still cleared. */ }
}

/** A completed disconnect may publish anonymous before its Promise resolves. */
export function suppressHintAfterClear(auth, completedDisconnect = false) {
  return !(completedDisconnect && auth?.isAuthHydrated === true && auth?.isAuthenticated === false);
}
