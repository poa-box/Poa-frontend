import { describe, expect, it } from 'vitest';
import { ACCOUNT_HINT_KEY, hintFromVerifiedAuth, persistAccountHint, readAccountHint, removeAccountHint, validateAccountHint, suppressHintAfterClear } from './accountHint';
const address = '0x1234567890aBCDef1234567890AbcdEF12345678';
const hint = { address: address.toLowerCase(), authType: 'eoa', updatedAt: 123 };
function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
}
const browser = (local = {}, session = {}) => ({ localStorage: storage(local), sessionStorage: storage(session) });
describe('untrusted account prefetch hints', () => {
  it('normalizes a valid hint and strips unrelated authority fields', () => {
    expect(validateAccountHint({ ...hint, address, isAuthenticated: true, permissions: ['admin'] })).toEqual(hint);
  });
  it.each([null, [], {}, { ...hint, address: [address] }, { ...hint, address: { toString: () => address } }, { ...hint, address: 123 }, { ...hint, address: null }, { ...hint, address: '0x123' }, { ...hint, address: `0x${'0'.repeat(40)}` }, { ...hint, authType: 'admin' }, { ...hint, updatedAt: -1 }, { ...hint, updatedAt: '123' }])('rejects malformed hints %#', (value) => {
    expect(validateAccountHint(value)).toBeNull();
  });
  it('reads compact storage without changing any verified auth state', () => {
    expect(readAccountHint(browser({ [ACCOUNT_HINT_KEY]: JSON.stringify(hint) }))).toEqual(hint);
    expect(hintFromVerifiedAuth({ accountAddress: address, authType: 'eoa', isAuthenticated: true, isAuthHydrated: false })).toBeNull();
    expect(hintFromVerifiedAuth({ accountAddress: address, authType: 'eoa', isAuthenticated: false, isAuthHydrated: true })).toBeNull();
    expect(hintFromVerifiedAuth({ accountAddress: address, authType: 'eoa', isAuthenticated: true, isAuthHydrated: true }, 123)).toEqual(hint);
  });
  it('respects explicit signout in either storage namespace and fails closed on storage errors', () => {
    const compact = { [ACCOUNT_HINT_KEY]: JSON.stringify(hint) };
    expect(readAccountHint(browser(compact, { 'poa:explicit-sign-out': '1' }))).toBeNull();
    expect(readAccountHint(browser({ ...compact, 'poa:explicit-sign-out': '1' }))).toBeNull();
    const denied = { getItem() { throw Error('denied'); } };
    expect(readAccountHint({ localStorage: denied, sessionStorage: denied })).toBeNull();
    expect(readAccountHint(null)).toBeNull();
  });
  it('uses only matching legacy credential addresses and chooses latest saved record', () => {
    const other = '0x2222222222222222222222222222222222222222';
    const credentials = { [address.toLowerCase()]: { accountAddress: address, savedAt: 1 }, [other]: { accountAddress: other, savedAt: 5 }, wrong: { accountAddress: other, savedAt: 99 } };
    expect(readAccountHint(browser({ 'poa-passkey-credentials': JSON.stringify(credentials) }))).toEqual({ address: other, authType: 'passkey', updatedAt: 5 });
  });
  it('does not fall through a malformed compact hint to an unrelated saved credential', () => {
    expect(readAccountHint(browser({ [ACCOUNT_HINT_KEY]: '{bad', 'poa-passkey-credentials': JSON.stringify({ [address]: { accountAddress: address, savedAt: 1 } }) }))).toBeNull();
  });
  it('replaces mismatched compact hints and clears storage without touching credentials', () => {
    const b = browser({ [ACCOUNT_HINT_KEY]: 'old', 'poa-passkey-credentials': 'retained' });
    persistAccountHint(b, hint); expect(readAccountHint(b)).toEqual(hint);
    removeAccountHint(b); expect(b.localStorage.getItem(ACCOUNT_HINT_KEY)).toBeNull();
    expect(b.localStorage.getItem('poa-passkey-credentials')).toBe('retained');
    expect(() => persistAccountHint({ localStorage: { setItem() { throw Error(); } } }, hint)).not.toThrow();
    expect(() => removeAccountHint({ localStorage: { removeItem() { throw Error(); } } })).not.toThrow();
  });
});


describe('hint suppression after disconnect completion', () => {
  const anonymous = { isAuthHydrated: true, isAuthenticated: false };
  it('does not re-arm suppression after the anonymous snapshot already settled', () => {
    expect(suppressHintAfterClear(anonymous, true)).toBe(false);
    const reconnected = { isAuthHydrated: true, isAuthenticated: true, accountAddress: address, authType: 'eoa' };
    expect(hintFromVerifiedAuth(reconnected, 123)).toEqual(hint);
  });
  it('still suppresses explicit signout and unsettled or connected completion snapshots', () => {
    expect(suppressHintAfterClear(anonymous)).toBe(true);
    expect(suppressHintAfterClear({ isAuthHydrated: false, isAuthenticated: false }, true)).toBe(true);
    expect(suppressHintAfterClear({ isAuthHydrated: true, isAuthenticated: true }, true)).toBe(true);
    expect(suppressHintAfterClear(null, true)).toBe(true);
  });
});
