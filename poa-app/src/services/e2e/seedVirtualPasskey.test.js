import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ stored: false, credential: null, save: vi.fn() }));
vi.mock('@/services/web3/passkey/passkeyStorage', () => ({ hasStoredCredentials: () => f.stored, savePasskeyCredential: value => f.save(value) }));
vi.mock('@/services/e2e/virtualPasskey', () => ({ getVirtualPasskeyCredential: () => f.credential }));
const credential = { credentialId: `0x${'11'.repeat(32)}`, publicKeyX: `0x${'22'.repeat(32)}`, publicKeyY: `0x${'33'.repeat(32)}`, rawCredentialId: 'public-id', salt: 9007199254740993n };
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); f.stored = false; f.credential = credential; vi.stubGlobal('window', {}); vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); });
describe('fresh and returning virtual passkey startup', () => {
 it('leaves a fresh seed anonymous without inventing any pending enrollment', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ data: { passkeyCredentials: [] } }) });
  const runtime = await import('./seedVirtualPasskey');
  expect(await runtime.ensureVirtualPasskeyActivated()).toBeNull();
  expect(f.save).not.toHaveBeenCalled();
  expect(runtime.ensureVirtualPasskeyPendingSeeded).toBeUndefined();
  const request = JSON.parse(fetch.mock.calls[0][1].body); expect(request.variables.credentialId).toBe(credential.credentialId);
 });
 it('restores a returning seed with exact public fields and an exact salt string', async () => {
  const accountAddress = `0x${'44'.repeat(20)}`;
  fetch.mockResolvedValue({ ok: true, json: async () => ({ data: { passkeyCredentials: [{ account: { id: accountAddress } }] } }) });
  const runtime = await import('./seedVirtualPasskey');
  const value = await runtime.ensureVirtualPasskeyActivated();
  expect(value).toEqual({ ...credential, salt: '9007199254740993', accountAddress });
  expect(f.save).toHaveBeenCalledExactlyOnceWith(value);
 });
 it('does not replace an already stored credential or touch the network', async () => {
  f.stored = true; const runtime = await import('./seedVirtualPasskey');
  expect(await runtime.ensureVirtualPasskeyActivated()).toBeNull(); expect(fetch).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled();
 });
 it('keeps an unavailable returning-account lookup anonymous without synthesizing an account', async () => {
  fetch.mockResolvedValue({ ok: false }); const runtime = await import('./seedVirtualPasskey');
  expect(await runtime.ensureVirtualPasskeyActivated()).toBeNull(); expect(f.save).not.toHaveBeenCalled();
 });
});
