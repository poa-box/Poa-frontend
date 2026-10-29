/**
 * passkeySign.js
 * Sign ERC-4337 UserOp hashes and registration challenges using WebAuthn (passkey).
 */

import { base64URLStringToBuffer, bufferToBase64URLString } from '@simplewebauthn/browser';
import { pad, toBytes, toHex } from 'viem';
import { registrationChallenge, packPasskeySignature } from '@poa-box/core/accounts/codecs';
import { computeCredentialId } from '@/services/web3/passkey/passkeyUtils';
import { getWebAuthnRpId } from '@/config/passkey';
import { authenticateWithRpFallback } from '@/services/web3/passkey/authenticate';

// P-256 curve order
const P256_N = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');

/**
 * Perform a WebAuthn assertion (biometric prompt) and parse the response.
 *
 * @param {string} challengeHash - bytes32 hex string to sign
 * @param {string} rawCredentialIdBase64 - base64url credential ID for allowCredentials
 * @returns {Object} { authenticatorData, clientDataJSON, challengeIndex, typeIndex, r, s, rawId }
 */
async function getWebAuthnAssertion(challengeHash, rawCredentialIdBase64) {
  if (process.env.NEXT_PUBLIC_E2E_MODE === 'true') {
    const { signVirtualAssertion } = await import('@/services/e2e/virtualPasskey');
    return signVirtualAssertion(challengeHash);
  }
  if (typeof challengeHash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(challengeHash)) throw new Error('Invalid passkey challenge.');
  const expectedCredential = computeCredentialId(rawCredentialIdBase64);
  const expectedOrigin = window.location.origin;
  const hashBytes = toBytes(challengeHash);
  const challenge = bufferToBase64URLString(hashBytes);

  const primaryRpId = getWebAuthnRpId();

  const opts = (rpId) => ({
    optionsJSON: {
      challenge,
      rpId,
      allowCredentials: [{
        id: rawCredentialIdBase64,
        type: 'public-key',
        transports: ['internal'],
      }],
      userVerification: 'required',
      timeout: 120000,
    },
  });

  const assertion = await authenticateWithRpFallback(opts, primaryRpId);
  if (typeof assertion?.rawId !== 'string' || computeCredentialId(assertion.rawId) !== expectedCredential) {
    throw new Error('The selected passkey does not match this account. Please sign in again.');
  }

  const authenticatorDataBuffer = base64URLStringToBuffer(assertion.response.authenticatorData);
  const authenticatorData = new Uint8Array(authenticatorDataBuffer);

  const clientDataJSONBuffer = base64URLStringToBuffer(assertion.response.clientDataJSON);
  const clientDataJSON = new Uint8Array(clientDataJSONBuffer);

  const signatureBuffer = base64URLStringToBuffer(assertion.response.signature);
  const signatureBytes = new Uint8Array(signatureBuffer);
  const { r, s } = parseDERSignature(signatureBytes);

  const clientDataString = new TextDecoder('utf-8', { fatal: true }).decode(clientDataJSON);
  const signed = JSON.parse(clientDataString);
  if (signed.type !== 'webauthn.get' || signed.challenge !== challenge
    || (expectedOrigin && signed.origin !== expectedOrigin)) {
    throw new Error('The passkey response does not match this request. Please try again.');
  }
  const challengeIndex = findFieldIndex(clientDataString, 'challenge');
  const typeIndex = findFieldIndex(clientDataString, 'type');

  return {
    authenticatorData,
    clientDataJSON,
    challengeIndex,
    typeIndex,
    r,
    s,
    rawId: assertion.rawId,
  };
}

/**
 * Sign a UserOp hash with a passkey credential.
 *
 * @param {string} userOpHash - bytes32 hex string (the hash to sign)
 * @param {string} rawCredentialIdBase64 - base64url credential ID for allowCredentials
 * @returns {string} ABI-encoded signature for PasskeyAccount.validateUserOp()
 *
 * The PasskeyAccount contract expects the signature to be:
 *   credentialId(32 bytes raw) || abi.encode(WebAuthnAuth)
 * where WebAuthnAuth = { authenticatorData, clientDataJSON, challengeIndex, typeIndex, r, s }
 *
 * IMPORTANT: credentialId is NOT abi.encode'd — it's raw bytes32 at signature[0:32].
 * The contract slices signature[32:] and abi.decode's that as WebAuthnAuth.
 */
export async function signUserOpWithPasskey(userOpHash, rawCredentialIdBase64) {
  const auth = await getWebAuthnAssertion(userOpHash, rawCredentialIdBase64);

  const credentialIdBytes32 = computeCredentialId(auth.rawId);

  return packPasskeySignature(credentialIdBytes32, {
    authenticatorData: toHex(auth.authenticatorData),
    clientDataJSON: toHex(auth.clientDataJSON),
    challengeIndex: auth.challengeIndex,
    typeIndex: auth.typeIndex,
    r: pad(toHex(auth.r), { size: 32 }),
    s: pad(toHex(auth.s), { size: 32 }),
  });
}

/**
 * Compute the EIP-712 registration challenge hash that must be signed
 * to authorize username registration via registerAndQuickJoinWithPasskey.
 *
 * Matches UniversalAccountRegistry.registerAccountByPasskeySig() challenge computation.
 *
 * @param {Object} params
 * @param {string} params.accountAddress - Counterfactual smart account address
 * @param {string} params.username - Username to register
 * @param {bigint} params.nonce - Account's nonce on the registry
 * @param {bigint} params.deadline - Expiration timestamp
 * @param {number} params.chainId - Chain ID
 * @param {string} params.registryAddress - UniversalAccountRegistry address
 * @returns {string} bytes32 hex challenge hash
 */
export function computeRegistrationChallenge({ accountAddress, username, nonce, deadline, chainId, registryAddress }) {
  return registrationChallenge({ user: accountAddress, username, nonce, deadline, chainId, registryAddress }, 'passkey');
}

/**
 * Sign a registration challenge with a passkey.
 * Returns the raw WebAuthnAuth fields for use as the `auth` parameter
 * in registerAndQuickJoinWithPasskey().
 *
 * @param {string} challengeHash - bytes32 hex (from computeRegistrationChallenge)
 * @param {string} rawCredentialIdBase64 - base64url credential ID
 * @returns {Object} Auth fields for ABI encoding: { authenticatorData, clientDataJSON, challengeIndex, typeIndex, r, s }
 *   All values are hex strings / BigInts ready for encodeFunctionData.
 */
export async function signRegistrationChallenge(challengeHash, rawCredentialIdBase64) {
  const auth = await getWebAuthnAssertion(challengeHash, rawCredentialIdBase64);

  return {
    authenticatorData: toHex(auth.authenticatorData),
    clientDataJSON: toHex(auth.clientDataJSON),
    challengeIndex: BigInt(auth.challengeIndex),
    typeIndex: BigInt(auth.typeIndex),
    r: pad(toHex(auth.r), { size: 32 }),
    s: pad(toHex(auth.s), { size: 32 }),
  };
}

/**
 * Parse a DER-encoded ECDSA signature into r and s BigInt values.
 * DER format: 0x30 <total_len> 0x02 <r_len> <r_bytes> 0x02 <s_len> <s_bytes>
 */
function parseDERSignature(derBytes) {
  if (derBytes.length < 8 || derBytes[0] !== 0x30 || derBytes[1] !== derBytes.length - 2 || (derBytes[1] & 0x80)) {
    throw new Error('Invalid passkey DER signature.');
  }
  let offset = 2;
  const integer = () => {
    if (derBytes[offset++] !== 0x02) throw new Error('Invalid passkey DER integer.');
    const length = derBytes[offset++];
    if (!length || length > 33 || offset + length > derBytes.length) throw new Error('Invalid passkey DER integer length.');
    const bytes = derBytes.slice(offset, offset + length);
    offset += length;
    if ((bytes[0] & 0x80) || (length > 1 && bytes[0] === 0 && !(bytes[1] & 0x80))) throw new Error('Noncanonical passkey DER integer.');
    const value = BigInt(toHex(bytes));
    if (value <= 0n || value >= P256_N) throw new Error('Invalid passkey signature coordinate.');
    return value;
  };
  const r = integer();
  let s = integer();
  if (offset !== derBytes.length) throw new Error('Trailing passkey DER signature bytes.');
  if (s > P256_N / 2n) s = P256_N - s;
  return { r, s };
}

/**
 * Find the byte index of a JSON field's VALUE in clientDataJSON.
 *
 * The WebAuthnLib contract expects:
 * - challengeIndex: index of the first char of the base64url challenge value
 * - typeIndex: index of the first char of "webauthn.get"
 *
 * For clientDataJSON like: {"type":"webauthn.get","challenge":"abc..."}
 * typeIndex points to 'w' in webauthn.get, challengeIndex points to 'a' in abc...
 */
function findFieldIndex(jsonString, fieldName) {
  // Search for "fieldName":" to find the value start
  const searchStr = `"${fieldName}":"`;
  const idx = jsonString.indexOf(searchStr);
  if (idx === -1) {
    throw new Error(`Could not find "${fieldName}" in clientDataJSON`);
  }
  // Return index of first char of the value (right after the opening quote of the value)
  return new TextEncoder().encode(jsonString.slice(0, idx + searchStr.length)).length;
}
