/**
 * passkeyCreate.js
 * WebAuthn credential creation (registration) for new passkey accounts.
 * Uses @simplewebauthn/browser for cross-browser compatibility.
 */

import { startRegistration } from '@simplewebauthn/browser';
import { base64URLStringToBuffer, bufferToBase64URLString } from '@simplewebauthn/browser';
import { keccak256, encodePacked, pad, toHex } from 'viem';
import { WEBAUTHN_RP_NAME } from '../../../config/passkey';
import { computeCredentialId } from './passkeyUtils';

/**
 * Create a new WebAuthn credential (passkey).
 *
 * @param {string} username - Display name for the passkey
 * @returns {Object} { credentialId, publicKeyX, publicKeyY, rawCredentialId, salt }
 *   credentialId: bytes32 = keccak256(rawCredentialId bytes)
 *   publicKeyX/Y: bytes32 = P-256 public key coordinates
 *   rawCredentialId: base64url string (needed for WebAuthn allowCredentials)
 *   salt: BigInt = derived from credentialId for deterministic account address
 */
export async function createPasskeyCredential(username) {
  // Generate a random challenge (not verified server-side; on-chain verification is separate)
  const challengeBytes = crypto.getRandomValues(new Uint8Array(32));
  const challenge = bufferToBase64URLString(challengeBytes);

  // Generate a random user ID for the credential
  const userIdBytes = crypto.getRandomValues(new Uint8Array(16));
  const userId = bufferToBase64URLString(userIdBytes);

  // Create the WebAuthn credential via @simplewebauthn/browser
  const registrationResponse = await startRegistration({
    optionsJSON: {
      rp: {
        name: WEBAUTHN_RP_NAME,
        id: window.location.hostname,
      },
      user: {
        id: userId,
        name: username,
        displayName: username,
      },
      challenge,
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' }, // ES256 (P-256 / secp256r1)
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'required',
      },
      timeout: 120000,
      attestation: 'none', // No attestation needed; on-chain verification is separate
    },
  });

  // Extract the raw credential ID (base64url)
  const rawCredentialId = registrationResponse.rawId;

  // Extract P-256 public key from the response
  // @simplewebauthn/browser v13 provides response.publicKey as base64url SPKI format
  const { x, y } = extractP256FromResponse(registrationResponse);

  // Compute credentialId as bytes32 = keccak256(raw credential ID bytes)
  const credentialId = computeCredentialId(rawCredentialId);

  // Derive salt deterministically from credentialId
  const salt = BigInt(
    keccak256(encodePacked(['bytes32', 'string'], [credentialId, 'poa-salt-v1']))
  );

  const publicKeyX = pad(toHex(x), { size: 32 });
  const publicKeyY = pad(toHex(y), { size: 32 });

  return {
    credentialId,       // bytes32 hex
    publicKeyX,         // bytes32 hex
    publicKeyY,         // bytes32 hex
    rawCredentialId,    // base64url string (for WebAuthn allowCredentials)
    salt,               // BigInt
  };
}

/**
 * Extract P-256 public key coordinates from the registration response.
 *
 * The response.publicKey field is a base64url-encoded SPKI (SubjectPublicKeyInfo) structure.
 * For P-256, the SPKI structure is:
 *   - 26-byte header (algorithm identifier for P-256)
 *   - 1 byte: 0x04 (uncompressed point indicator)
 *   - 32 bytes: X coordinate
 *   - 32 bytes: Y coordinate
 *
 * If publicKey is not available, falls back to parsing the attestationObject.
 */
function extractP256FromResponse(response) {
  // Prefer the publicKey field (available in modern browsers)
  if (response.response.publicKey) {
    const spkiBuffer = base64URLStringToBuffer(response.response.publicKey);
    const spkiBytes = new Uint8Array(spkiBuffer);

    // SPKI for P-256: 26-byte header + 65 bytes (04 || x(32) || y(32))
    // Total: 91 bytes
    if (spkiBytes.length === 91) {
      return {
        x: spkiBytes.slice(27, 59),  // After header(26) + 0x04(1)
        y: spkiBytes.slice(59, 91),
      };
    }

    // Some implementations may have a slightly different header length.
    // Look for the 0x04 uncompressed point marker in the last 65 bytes.
    const pointStart = spkiBytes.length - 65;
    if (spkiBytes[pointStart] === 0x04) {
      return {
        x: spkiBytes.slice(pointStart + 1, pointStart + 33),
        y: spkiBytes.slice(pointStart + 33, pointStart + 65),
      };
    }
  }

  // Fallback: parse from attestationObject via CBOR
  return extractP256FromAttestationObject(response.response.attestationObject);
}

/**
 * Extract P-256 public key from the CBOR-encoded attestationObject.
 * This is the fallback path when response.publicKey is not available.
 */
function extractP256FromAttestationObject(attestationObjectBase64) {
  const buffer = base64URLStringToBuffer(attestationObjectBase64);
  const bytes = new Uint8Array(buffer);

  // The attestationObject is CBOR-encoded. We need to find the authData field.
  // A minimal approach: search for the authData within the CBOR structure.
  // authData format: rpIdHash(32) + flags(1) + signCount(4) + attestedCredentialData
  // attestedCredentialData: aaguid(16) + credIdLen(2) + credId(credIdLen) + cosePubKey

  // Find authData by looking for the CBOR key "authData" (text string)
  const authDataOffset = findCBORField(bytes, 'authData');
  if (authDataOffset === -1) {
    throw new Error('Could not find authData in attestationObject');
  }

  const authData = decodeCBORByteString(bytes, authDataOffset);
  const flags = authData[32];
  const hasAttestedCredentialData = (flags & 0x40) !== 0;

  if (!hasAttestedCredentialData) {
    throw new Error('No attested credential data in attestation');
  }

  // Skip rpIdHash(32) + flags(1) + signCount(4) + aaguid(16) = 53 bytes
  const credIdLen = (authData[53] << 8) | authData[54];
  const coseKeyStart = 55 + credIdLen;
  const coseKeyBytes = authData.slice(coseKeyStart);

  // Parse COSE key — find the -2 (x) and -3 (y) entries
  // COSE map key -2 = 0x21 in CBOR, -3 = 0x22 in CBOR (negative int encoding)
  const x = findCOSEKeyParam(coseKeyBytes, -2);
  const y = findCOSEKeyParam(coseKeyBytes, -3);

  if (!x || !y || x.length !== 32 || y.length !== 32) {
    throw new Error('Could not extract P-256 public key from COSE key');
  }

  return { x, y };
}

/**
 * Find a text field in a CBOR map and return the offset of its value.
 * Simplified: searches for the UTF-8 text bytes of the key name.
 */
function findCBORField(bytes, fieldName) {
  const nameBytes = new TextEncoder().encode(fieldName);
  for (let i = 0; i < bytes.length - nameBytes.length; i++) {
    let match = true;
    for (let j = 0; j < nameBytes.length; j++) {
      if (bytes[i + j] !== nameBytes[j]) { match = false; break; }
    }
    if (match) {
      return i + nameBytes.length;
    }
  }
  return -1;
}

/**
 * Decode a CBOR byte string at the given offset.
 * Handles major type 2 (byte string) with 1-byte and 2-byte length.
 */
function decodeCBORByteString(bytes, offset) {
  const majorType = bytes[offset] >> 5;
  const additionalInfo = bytes[offset] & 0x1f;

  if (majorType !== 2) {
    // Not a byte string — try to skip ahead to find one
    // This handles cases where there's padding between the key and value
    for (let i = offset; i < Math.min(offset + 4, bytes.length); i++) {
      if ((bytes[i] >> 5) === 2) {
        return decodeCBORByteString(bytes, i);
      }
    }
    throw new Error(`Expected CBOR byte string at offset ${offset}, got major type ${majorType}`);
  }

  let length;
  let dataStart;

  if (additionalInfo < 24) {
    length = additionalInfo;
    dataStart = offset + 1;
  } else if (additionalInfo === 24) {
    length = bytes[offset + 1];
    dataStart = offset + 2;
  } else if (additionalInfo === 25) {
    length = (bytes[offset + 1] << 8) | bytes[offset + 2];
    dataStart = offset + 3;
  } else {
    throw new Error(`Unsupported CBOR byte string length encoding: ${additionalInfo}`);
  }

  return bytes.slice(dataStart, dataStart + length);
}

/**
 * Find a COSE key parameter value in a CBOR-encoded COSE_Key.
 * COSE parameters: -2 (x coord) is CBOR negative int 0x21, -3 (y coord) is 0x22.
 */
function findCOSEKeyParam(bytes, param) {
  // In CBOR, negative int n is encoded as major type 1 with value (-1 - n)
  // -2 -> 0x21 (major type 1, additional info 1)
  // -3 -> 0x22 (major type 1, additional info 2)
  const searchByte = 0x20 + (-1 - param);

  for (let i = 0; i < bytes.length - 33; i++) {
    if (bytes[i] === searchByte) {
      // Next should be a 32-byte byte string (0x5820 = byte string of length 32)
      if (bytes[i + 1] === 0x58 && bytes[i + 2] === 0x20) {
        return bytes.slice(i + 3, i + 3 + 32);
      }
    }
  }
  return null;
}

