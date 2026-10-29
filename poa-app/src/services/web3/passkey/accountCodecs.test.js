import { afterEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { getUserOperationHash } from 'viem/account-abstraction';
import { packUserOperationV07 } from '@poa-box/core/accounts/userop-v07';
import { derivePasskeySalt, packPasskeySignature, unpackPasskeySignature } from '@poa-box/core/accounts/codecs';
const browserMocks = vi.hoisted(() => ({ authenticate: vi.fn() }));
vi.mock('@simplewebauthn/browser', async importOriginal => ({ ...await importOriginal(), startAuthentication: browserMocks.authenticate }));
import { computeRegistrationChallenge, signUserOpWithPasskey } from '@/services/web3/passkey/passkeySign';
import { computeCredentialId } from '@/services/web3/passkey/passkeyUtils';
import { getUserOpHash } from '@/services/web3/passkey/userOpBuilder';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const ACCOUNT = '0x1111111111111111111111111111111111111111';
const FACTORY = '0x2222222222222222222222222222222222222222';
const PAYMASTER = '0x3333333333333333333333333333333333333333';
const operation = {
  sender: ACCOUNT, nonce: 9007199254740993123456789n, callData: '0x12345678',
  callGasLimit: 500000n, verificationGasLimit: 123456n, preVerificationGas: 45000n,
  maxFeePerGas: 17n, maxPriorityFeePerGas: 7n, signature: '0x',
};

describe('adopted account protocol codecs', () => {
  it('uses the passkey registration primary type, exact nonce/deadline and registry domain', () => {
    const input = { accountAddress: ACCOUNT, username: 'member', nonce: operation.nonce,
      deadline: '9007199254740993999999999', chainId: 100, registryAddress: FACTORY };
    const fields = [{ name: 'user', type: 'address' }, { name: 'username', type: 'string' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }];
    const domain = { name: 'UniversalAccountRegistry', version: '1', chainId: 100, verifyingContract: FACTORY };
    const value = { user: ACCOUNT, username: input.username, nonce: input.nonce, deadline: input.deadline };
    const expected = ethers.utils._TypedDataEncoder.hash(domain, { RegisterPasskeyAccount: fields }, value);
    expect(computeRegistrationChallenge(input)).toBe(expected);
    expect(computeRegistrationChallenge(input)).not.toBe(ethers.utils._TypedDataEncoder.hash(domain, { RegisterAccount: fields }, value));
    expect(() => computeRegistrationChallenge({ ...input, nonce: Number.MAX_SAFE_INTEGER + 1 })).toThrow();
  });

  it('hashes raw credential bytes and preserves the exact signature prefix and ABI tuple', () => {
    const raw = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const credentialId = computeCredentialId(Buffer.from(raw).toString('base64url'));
    expect(credentialId).toBe(ethers.utils.keccak256(raw));
    expect(derivePasskeySalt(credentialId)).toBe(ethers.utils.solidityKeccak256(['bytes32', 'string'], [credentialId, 'poa-salt-v1']));
    const auth = { authenticatorData: '0x0102', clientDataJSON: '0x0304', challengeIndex: '9007199254740993123', typeIndex: '7', r: `0x${'11'.repeat(32)}`, s: `0x${'22'.repeat(32)}` };
    const expected = credentialId + ethers.utils.defaultAbiCoder.encode(['tuple(bytes,bytes,uint256,uint256,bytes32,bytes32)'], [[auth.authenticatorData, auth.clientDataJSON, auth.challengeIndex, auth.typeIndex, auth.r, auth.s]]).slice(2);
    expect(packPasskeySignature(credentialId, auth)).toBe(expected);
    expect(unpackPasskeySignature(expected)).toEqual({ credentialId, auth });
    expect(() => packPasskeySignature(credentialId, { ...auth, challengeIndex: -1 })).toThrow();
  });

  it('adapts the browser assertion into the canonical credential prefix and low-s WebAuthn tuple', async () => {
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', 'false');
    vi.stubGlobal('window', { location: { hostname: 'test.local', origin: 'https://test.local' } });
    const rawId = Buffer.from([1, 2, 3, 250, 251, 252]).toString('base64url');
    const challenge = Buffer.from('11'.repeat(32), 'hex').toString('base64url');
    const clientData = JSON.stringify({ type: 'webauthn.get', challenge, origin: 'https://test.local' });
    const authenticatorData = Uint8Array.from({ length: 37 }, (_, index) => index);
    const n = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
    // Synthetic DER fixture: r=1, high s=n-1. No authenticator or signer is used.
    const der = Buffer.from(`3026020101022100${(n - 1n).toString(16)}`, 'hex');
    browserMocks.authenticate.mockResolvedValueOnce({ rawId, response: {
      authenticatorData: Buffer.from(authenticatorData).toString('base64url'),
      clientDataJSON: Buffer.from(clientData).toString('base64url'),
      signature: der.toString('base64url'),
    } });
    const signature = await signUserOpWithPasskey(`0x${'11'.repeat(32)}`, rawId);
    const decoded = unpackPasskeySignature(signature);
    expect(decoded.credentialId).toBe(ethers.utils.keccak256(Buffer.from(rawId, 'base64url')));
    expect(decoded.auth).toEqual({
      authenticatorData: ethers.utils.hexlify(authenticatorData),
      clientDataJSON: ethers.utils.hexlify(Buffer.from(clientData)),
      challengeIndex: String(clientData.indexOf(challenge)),
      typeIndex: String(clientData.indexOf('webauthn.get')),
      r: ethers.utils.hexZeroPad('0x01', 32), s: ethers.utils.hexZeroPad('0x01', 32),
    });
    expect(browserMocks.authenticate).toHaveBeenCalledWith(expect.objectContaining({ optionsJSON: expect.objectContaining({ allowCredentials: [{ id: rawId, type: 'public-key', transports: ['internal'] }], userVerification: 'required' }) }));
  });

  it.each([false, true])('matches the independent v0.7 hash oracle for factory-bearing=%s operations', counterfactual => {
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
    const op = { ...operation, ...(counterfactual ? { factory: FACTORY, factoryData: '0xabcdef' } : {}),
      paymaster: PAYMASTER, paymasterVerificationGasLimit: 20000n, paymasterPostOpGasLimit: 10000n, paymasterData: '0x1234' };
    const expected = getUserOperationHash({ userOperation: op, entryPointAddress: ENTRY_POINT_ADDRESS, entryPointVersion: '0.7', chainId: 100 });
    expect(getUserOpHash(op, ENTRY_POINT_ADDRESS, 100)).toBe(expected);
    expect(getUserOpHash({ ...op, signature: '0xbeef' }, ENTRY_POINT_ADDRESS, 100)).toBe(expected);
    expect(getUserOpHash(op, ENTRY_POINT_ADDRESS, 42161)).not.toBe(expected);
    if (counterfactual) expect(getUserOpHash(operation, ENTRY_POINT_ADDRESS, 100)).not.toBe(expected);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects half factory fields, unsafe integers and overflowing uint128 gas before signing', () => {
    expect(() => getUserOpHash({ ...operation, factory: FACTORY }, ENTRY_POINT_ADDRESS, 100)).toThrow();
    expect(() => getUserOpHash({ ...operation, factoryData: '0xabcd' }, ENTRY_POINT_ADDRESS, 100)).toThrow();
    expect(() => getUserOpHash({ ...operation, nonce: Number.MAX_SAFE_INTEGER + 1 }, ENTRY_POINT_ADDRESS, 100)).toThrow();
    expect(() => packUserOperationV07({ ...operation, callGasLimit: 1n << 128n })).toThrow();
  });
});
