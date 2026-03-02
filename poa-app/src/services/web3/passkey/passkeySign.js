/**
 * passkeySign.js
 * Sign ERC-4337 UserOp hashes using WebAuthn (passkey).
 * Returns the signature in the format expected by PasskeyAccount.validateUserOp().
 */

import { startAuthentication, base64URLStringToBuffer, bufferToBase64URLString } from '@simplewebauthn/browser';
import { encodeAbiParameters, parseAbiParameters, pad, toBytes, toHex } from 'viem';
import { computeCredentialId } from './passkeyUtils';

// P-256 curve order
const P256_N = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');

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
  // The challenge for WebAuthn is the UserOp hash encoded as base64url
  const hashBytes = toBytes(userOpHash);
  const challenge = bufferToBase64URLString(hashBytes);

  // Request WebAuthn assertion (biometric prompt)
  const assertion = await startAuthentication({
    optionsJSON: {
      challenge,
      rpId: window.location.hostname,
      allowCredentials: [{
        id: rawCredentialIdBase64,
        type: 'public-key',
        transports: ['internal'],
      }],
      userVerification: 'required',
      timeout: 120000,
    },
  });

  // Extract response fields
  const authenticatorDataBuffer = base64URLStringToBuffer(assertion.response.authenticatorData);
  const authenticatorData = new Uint8Array(authenticatorDataBuffer);

  const clientDataJSONBuffer = base64URLStringToBuffer(assertion.response.clientDataJSON);
  const clientDataJSON = new Uint8Array(clientDataJSONBuffer);

  // Parse DER-encoded ECDSA signature into (r, s)
  const signatureBuffer = base64URLStringToBuffer(assertion.response.signature);
  const signatureBytes = new Uint8Array(signatureBuffer);
  const { r, s } = parseDERSignature(signatureBytes);

  // Find challengeIndex and typeIndex in clientDataJSON
  // clientDataJSON is JSON like: {"type":"webauthn.get","challenge":"<base64url>","origin":"..."}
  const clientDataString = new TextDecoder().decode(clientDataJSON);
  const challengeIndex = findFieldIndex(clientDataString, 'challenge');
  const typeIndex = findFieldIndex(clientDataString, 'type');

  // Compute credentialId bytes32 from the raw credential ID
  const credentialIdBytes32 = computeCredentialId(assertion.rawId);

  // Encode signature as: credentialId(32 bytes raw) || abi.encode(WebAuthnAuth)
  // The contract does: bytes32 cid = bytes32(sig[0:32]); auth = abi.decode(sig[32:], (WebAuthnAuth))
  // So we must encode WebAuthnAuth separately and prepend the raw credentialId.
  const authEncoded = encodeAbiParameters(
    parseAbiParameters('(bytes, bytes, uint256, uint256, bytes32, bytes32)'),
    [[
      toHex(authenticatorData),
      toHex(clientDataJSON),
      BigInt(challengeIndex),
      BigInt(typeIndex),
      pad(toHex(r), { size: 32 }),
      pad(toHex(s), { size: 32 }),
    ]]
  );

  // Concatenate: raw credentialId bytes32 + abi.encode(WebAuthnAuth)
  const encodedSignature = credentialIdBytes32 + authEncoded.slice(2);

  return encodedSignature;
}

/**
 * Parse a DER-encoded ECDSA signature into r and s BigInt values.
 * DER format: 0x30 <total_len> 0x02 <r_len> <r_bytes> 0x02 <s_len> <s_bytes>
 */
function parseDERSignature(derBytes) {
  if (derBytes[0] !== 0x30) {
    throw new Error('Invalid DER signature: expected sequence marker 0x30');
  }

  let offset = 2; // skip 0x30 and total length byte

  // Parse r
  if (derBytes[offset] !== 0x02) {
    throw new Error('Invalid DER: expected 0x02 for r integer');
  }
  offset++;
  const rLen = derBytes[offset];
  offset++;
  const rBytes = derBytes.slice(offset, offset + rLen);
  let r = BigInt(toHex(rBytes));
  offset += rLen;

  // Parse s
  if (derBytes[offset] !== 0x02) {
    throw new Error('Invalid DER: expected 0x02 for s integer');
  }
  offset++;
  const sLen = derBytes[offset];
  offset++;
  const sBytes = derBytes.slice(offset, offset + sLen);
  let s = BigInt(toHex(sBytes));

  // Normalize s to low-s form (required by P-256 verification)
  if (s > P256_N / 2n) {
    s = P256_N - s;
  }

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
  return idx + searchStr.length;
}

