/**
 * passkeyUtils.js
 * Shared passkey credential utilities.
 */

import { keccak256, toHex } from 'viem';
import { base64URLStringToBuffer } from '@simplewebauthn/browser';

/**
 * Compute a bytes32 credentialId from a raw WebAuthn credential ID.
 * credentialId = keccak256(rawIdBytes)
 *
 * @param {string} rawCredentialIdBase64 - base64url-encoded raw credential ID
 * @returns {string} bytes32 hex string
 */
export function computeCredentialId(rawCredentialIdBase64) {
  const rawIdBytes = new Uint8Array(base64URLStringToBuffer(rawCredentialIdBase64));
  return keccak256(toHex(rawIdBytes));
}
