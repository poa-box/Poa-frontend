import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createBrowserSubmissionLock as sdkLock, createPasskeyCredentialStore } from '@poa-box/browser/storage';
import { validateCredentialKeys as sdkValidateKeys, restoreCredentialKeys as sdkRestoreKeys,
  resolveAccountDeployment as sdkResolveDeployment } from '@poa-box/browser/passkeys';
import { derivePasskeySalt } from '@poa-box/core/accounts/codecs';
import { createBrowserSubmissionLock } from '@/services/web3/core/browserSubmissionLock';
import { validateCredentialKeys, restoreCredentialKeys, resolveAccountDeployment } from '@/services/web3/passkey/accountReadiness';
import { createPasskeyCredential } from '@/services/web3/passkey/passkeyCreate';
import { computeCredentialId } from '@/services/web3/passkey/passkeyUtils';
import { getLastUsedCredential, savePasskeyCredential, savePendingCredential,
  readPendingEnrollment, requirePendingEnrollment } from '@/services/web3/passkey/passkeyStorage';
import { PasskeyOnboardingService } from '@/services/web3/domain/PasskeyOnboardingService';
import { recoveryTestStorage } from '@/services/web3/core/submissionTestHelpers';

const mocks = vi.hoisted(() => ({ register: vi.fn() }));
vi.mock('@simplewebauthn/browser', async importOriginal => ({ ...await importOriginal(), startRegistration: mocks.register }));
const RAW = Buffer.from([1, 2, 3, 250, 251, 252]).toString('base64url');
const ACCOUNT = `0x${'11'.repeat(20)}`;
const X = '0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296';
const Y = '0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5';
const b64 = bytes => Buffer.from(bytes).toString('base64url');
const cborBytes = bytes => Buffer.concat([Buffer.from(bytes.length < 24 ? [0x40 + bytes.length] : [0x58, bytes.length]), bytes]);
function registration(options, overrides = {}) {
  const { challenge, rp } = options.optionsJSON;
  const raw = Buffer.from(RAW, 'base64url');
  const key = Buffer.concat([Buffer.from([0xa5, 1, 2, 3, 0x26, 0x20, 1, 0x21]),
    cborBytes(Buffer.from(X.slice(2), 'hex')), Buffer.from([0x22]), cborBytes(Buffer.from(Y.slice(2), 'hex'))]);
  const authData = Buffer.concat([createHash('sha256').update(rp.id).digest(), Buffer.from([0x45, 0, 0, 0, 0]),
    Buffer.alloc(16), Buffer.from([0, raw.length]), raw, key]);
  const attestation = Buffer.concat([Buffer.from([0xa1, 0x68]), Buffer.from('authData'), cborBytes(authData)]);
  return { id: RAW, rawId: RAW, type: 'public-key', response: {
    clientDataJSON: b64(JSON.stringify({ type: 'webauthn.create', challenge, origin: 'https://www.poa.box' })),
    attestationObject: b64(attestation),
    publicKey: b64(Buffer.concat([Buffer.from('3059301306072a8648ce3d020106082a8648ce3d03010703420004', 'hex'),
      Buffer.from(X.slice(2), 'hex'), Buffer.from(Y.slice(2), 'hex')])),
    ...overrides,
  } };
}
let storage;
beforeEach(() => {
  storage = recoveryTestStorage(); mocks.register.mockReset();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { location: { hostname: 'www.poa.box', origin: 'https://www.poa.box' }, localStorage: storage });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Offline SDK consumer test forbids transport'); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe('frontend adoption of the installed browser SDK', () => {
  it('uses the same account readiness and account lock implementations as an independent consumer', () => {
    expect(createBrowserSubmissionLock).toBe(sdkLock);
    expect(validateCredentialKeys).toBe(sdkValidateKeys);
    expect(restoreCredentialKeys).toBe(sdkRestoreKeys);
    expect(resolveAccountDeployment).toBe(sdkResolveDeployment);
  });

  it('interoperates with saved and pending credentials from the public SDK store without changing historical keys', () => {
    const independent = createPasskeyCredentialStore({ storage });
    const credential = { credentialId: computeCredentialId(RAW), rawCredentialId: RAW,
      publicKeyX: X, publicKeyY: Y, accountAddress: ACCOUNT, salt: '1' };
    savePasskeyCredential(credential);
    expect(independent.getLastUsedCredential()).toEqual(getLastUsedCredential());
    independent.clearAllCredentials();
    expect(getLastUsedCredential()).toBeNull();
    expect(storage.getItem('poa-passkey-credentials')).toBeNull();
    const source = { chainId: 100, registryAddress: `0x${'22'.repeat(20)}`, factoryAddress: `0x${'33'.repeat(20)}` };
    independent.savePendingCredential({ ...credential, ...source, credentialChainId: 100,
      targetAddress: source.registryAddress, flow: 'onboarding', username: 'member' });
    expect(readPendingEnrollment(source)).toEqual(independent.readPendingEnrollment(source));
    expect(() => requirePendingEnrollment(source, { flow: 'zkemail', username: 'member' })).toThrow('earlier account setup');
    savePendingCredential({ ...readPendingEnrollment(source).credential, orgName: 'Renamed' });
    expect(independent.readPendingEnrollment(source).credential.orgName).toBe('Renamed');
  });

  it('creates a validated credential through the shared runtime with frontend RP settings', async () => {
    mocks.register.mockImplementation(async options => registration(options));
    const credential = await createPasskeyCredential('member');
    expect(credential).toEqual({ credentialId: computeCredentialId(RAW), rawCredentialId: RAW,
      publicKeyX: X, publicKeyY: Y, salt: BigInt(derivePasskeySalt(computeCredentialId(RAW))) });
    expect(mocks.register).toHaveBeenCalledTimes(1);
    expect(mocks.register.mock.calls[0][0].optionsJSON).toMatchObject({ rp: { name: 'Poa', id: 'poa.box' },
      user: { name: 'member', displayName: 'member' },
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' } });
  });

  it('rejects a mismatched signed registration response before saving a credential', async () => {
    mocks.register.mockImplementation(async options => registration(options, {
      clientDataJSON: b64(JSON.stringify({ type: 'webauthn.create', challenge: 'another-request', origin: 'https://www.poa.box' })),
    }));
    await expect(createPasskeyCredential('member')).rejects.toThrow();
    expect(getLastUsedCredential()).toBeNull();
    expect(mocks.register).toHaveBeenCalledTimes(1);
  });

  it('uses the shared account factory boundary for counterfactual generation without broadcasting', async () => {
    const readContract = vi.fn(async () => ACCOUNT);
    const credential = { credentialId: computeCredentialId(RAW), publicKeyX: X, publicKeyY: Y, salt: 1n };
    expect(await PasskeyOnboardingService.computeCounterfactualAddress({ readContract }, `0x${'44'.repeat(20)}`, credential)).toBe(ACCOUNT);
    expect(readContract).toHaveBeenCalledTimes(1);
    expect(readContract.mock.calls[0][0]).toMatchObject({ address: `0x${'44'.repeat(20)}`, functionName: 'getAddress',
      args: [credential.credentialId, X, Y, 1n] });
  });
});
