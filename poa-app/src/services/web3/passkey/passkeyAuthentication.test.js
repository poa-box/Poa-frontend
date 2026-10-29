import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unpackPasskeySignature } from '@poa-box/core/accounts/codecs';
const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), rpId: vi.fn(() => 'poa.box') }));
vi.mock('@simplewebauthn/browser', async importOriginal => ({ ...await importOriginal(), startAuthentication: mocks.authenticate }));
vi.mock('@/config/passkey', () => ({ getWebAuthnRpId: mocks.rpId }));
import { signUserOpWithPasskey, signRegistrationChallenge } from '@/services/web3/passkey/passkeySign';
const RAW = Buffer.from([1, 2, 3, 250, 251, 252]).toString('base64url');
const HASH = `0x${'11'.repeat(32)}`;
const b64 = value => Buffer.from(value).toString('base64url');
function assertion(overrides = {}) {
  return { rawId: RAW, response: { authenticatorData: b64(new Uint8Array(37)),
    clientDataJSON: b64(JSON.stringify({ type: 'webauthn.get', challenge: b64(Buffer.from(HASH.slice(2), 'hex')), origin: 'https://www.poa.box' })),
    signature: b64([0x30, 6, 0x02, 1, 1, 0x02, 1, 2]) }, ...overrides };
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.authenticate.mockReset(); mocks.rpId.mockReturnValue('poa.box');
  vi.stubGlobal('window', { location: { hostname: 'www.poa.box', origin: 'https://www.poa.box' } });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Offline test forbids transport'); }));
  mocks.authenticate.mockResolvedValue(assertion());
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
describe.each([['UserOp', signUserOpWithPasskey], ['registration', signRegistrationChallenge]])('%s browser credential boundary', (_name, sign) => {
  it.each(['AbortError', 'NotAllowedError', 'SecurityError', 'NetworkError'])('does not prompt again after %s', async name => {
    const rejection = Object.assign(new Error('Rejected ceremony'), { name });
    mocks.authenticate.mockRejectedValueOnce(rejection).mockResolvedValueOnce(assertion());
    await expect(sign(HASH, RAW)).rejects.toBe(rejection);
    expect(mocks.authenticate).toHaveBeenCalledTimes(1);
  });
  it('does not retry a wrapped user rejection', async () => {
    const rejection = Object.assign(new Error('WebAuthn rejected'), { code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', cause: Object.assign(new Error('Cancelled'), { name: 'NotAllowedError' }) });
    mocks.authenticate.mockRejectedValueOnce(rejection).mockResolvedValueOnce(assertion());
    await expect(sign(HASH, RAW)).rejects.toBe(rejection);
    expect(mocks.authenticate).toHaveBeenCalledTimes(1);
  });
  it('permits the explicit RP rejection fallback on a supported related-origin host', async () => {
    vi.stubGlobal('window', { location: { hostname: 'poa.earth', origin: 'https://poa.earth' } });
    const mismatch = Object.assign(new Error('RP rejected by browser'), { code: 'ERROR_INVALID_RP_ID', cause: Object.assign(new Error('RP ID invalid'), { name: 'SecurityError' }) });
    const response = assertion();
    response.response.clientDataJSON = b64(JSON.stringify({ type: 'webauthn.get', challenge: b64(Buffer.from(HASH.slice(2), 'hex')), origin: 'https://poa.earth' }));
    mocks.authenticate.mockRejectedValueOnce(mismatch).mockResolvedValueOnce(response);
    await expect(sign(HASH, RAW)).resolves.toBeDefined();
    expect(mocks.authenticate.mock.calls.map(([request]) => request.optionsJSON.rpId)).toEqual(['poa.box', 'poa.earth']);
  });
  it.each(['challenge', 'origin', 'type'])('rejects an assertion whose signed %s belongs to another request', async field => {
    const response = assertion();
    const data = JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64url').toString());
    data[field] = field === 'origin' ? 'https://other.invalid' : field === 'type' ? 'webauthn.create' : 'wrong-challenge';
    response.response.clientDataJSON = b64(JSON.stringify(data));
    mocks.authenticate.mockResolvedValue(response);
    await expect(sign(HASH, RAW)).rejects.toThrow('does not match this request');
    expect(mocks.authenticate).toHaveBeenCalledTimes(1);
  });
  it.each([
    [0x30, 6, 0x02, 1, 0, 0x02, 1, 2],
    [0x30, 6, 0x02, 1, 0x80, 0x02, 1, 2],
    [0x30, 7, 0x02, 2, 0, 1, 0x02, 1, 2],
    [0x30, 6, 0x02, 1, 1, 0x02, 1, 2, 0],
  ].map(bytes => [bytes]))('rejects malformed or noncanonical DER before returning authorization (%j)', async bytes => {
    const response = assertion(); response.response.signature = b64(bytes); mocks.authenticate.mockResolvedValue(response);
    await expect(sign(HASH, RAW)).rejects.toThrow(/passkey/i);
  });
  it('refuses a response for a different credential', async () => {
    mocks.authenticate.mockResolvedValue(assertion({ rawId: Buffer.from([9, 9, 9]).toString('base64url') }));
    await expect(sign(HASH, RAW)).rejects.toThrow(/passkey|credential/i);
  });
});
it('computes UTF-8 byte offsets while retaining signed origin policy', async () => {
  const response = assertion();
  response.response.clientDataJSON = b64(JSON.stringify({ note: 'é', type: 'webauthn.get', challenge: b64(Buffer.from(HASH.slice(2), 'hex')), origin: 'https://www.poa.box', crossOrigin: true }));
  mocks.authenticate.mockResolvedValue(response);
  const decoded = unpackPasskeySignature(await signUserOpWithPasskey(HASH, RAW));
  const bytes = Buffer.from(decoded.auth.clientDataJSON.slice(2), 'hex');
  expect(bytes.subarray(Number(decoded.auth.typeIndex), Number(decoded.auth.typeIndex) + 12).toString()).toBe('webauthn.get');
  expect(bytes.subarray(Number(decoded.auth.challengeIndex), Number(decoded.auth.challengeIndex) + 43).toString()).toBe(b64(Buffer.from(HASH.slice(2), 'hex')));
});
it('packs the selected credential assertion using the installed canonical codec', async () => {
  const signed = await signUserOpWithPasskey(HASH, RAW);
  const decoded = unpackPasskeySignature(signed);
  expect(decoded.auth.r).toBe(`0x${'0'.repeat(63)}1`);
  expect(decoded.auth.s).toBe(`0x${'0'.repeat(63)}2`);
  expect(mocks.authenticate.mock.calls[0][0].optionsJSON.allowCredentials).toEqual([{ id: RAW, type: 'public-key', transports: ['internal'] }]);
});
