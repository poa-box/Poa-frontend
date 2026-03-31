/**
 * passkeySign.js
 * Sign ERC-4337 UserOp hashes and registration challenges using WebAuthn (passkey).
 */

import { startAuthentication, base64URLStringToBuffer, bufferToBase64URLString } from '@simplewebauthn/browser';
import { encodeAbiParameters, parseAbiParameters, keccak256, pad, toBytes, toHex } from 'viem';
import { computeCredentialId } from './passkeyUtils';

// P-256 curve order
const P256_N = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');

// EIP-712 constants matching UniversalAccountRegistry.sol
const DOMAIN_TYPEHASH = keccak256(
  toBytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
);
const NAME_HASH = keccak256(toBytes('UniversalAccountRegistry'));
const VERSION_HASH = keccak256(toBytes('1'));
const REGISTER_PASSKEY_TYPEHASH = keccak256(
  toBytes('RegisterPasskeyAccount(address user,string username,uint256 nonce,uint256 deadline)')
);

/**
 * Perform a WebAuthn assertion (biometric prompt) and parse the response.
 *
 * @param {string} challengeHash - bytes32 hex string to sign
 * @param {string} rawCredentialIdBase64 - base64url credential ID for allowCredentials
 * @returns {Object} { authenticatorData, clientDataJSON, challengeIndex, typeIndex, r, s, rawId }
 */
async function getWebAuthnAssertion(challengeHash, rawCredentialIdBase64) {
  const hashBytes = toBytes(challengeHash);
  const challenge = bufferToBase64URLString(hashBytes);

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

  const authenticatorDataBuffer = base64URLStringToBuffer(assertion.response.authenticatorData);
  const authenticatorData = new Uint8Array(authenticatorDataBuffer);

  const clientDataJSONBuffer = base64URLStringToBuffer(assertion.response.clientDataJSON);
  const clientDataJSON = new Uint8Array(clientDataJSONBuffer);

  const signatureBuffer = base64URLStringToBuffer(assertion.response.signature);
  const signatureBytes = new Uint8Array(signatureBuffer);
  const { r, s } = parseDERSignature(signatureBytes);

  const clientDataString = new TextDecoder().decode(clientDataJSON);
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

  const authEncoded = encodeAbiParameters(
    parseAbiParameters('(bytes, bytes, uint256, uint256, bytes32, bytes32)'),
    [[
      toHex(auth.authenticatorData),
      toHex(auth.clientDataJSON),
      BigInt(auth.challengeIndex),
      BigInt(auth.typeIndex),
      pad(toHex(auth.r), { size: 32 }),
      pad(toHex(auth.s), { size: 32 }),
    ]]
  );

  return credentialIdBytes32 + authEncoded.slice(2);
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
  // Domain separator: keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, chainId, verifyingContract))
  const domainSeparator = keccak256(
    encodeAbiParameters(
      parseAbiParameters('bytes32, bytes32, bytes32, uint256, address'),
      [DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, BigInt(chainId), registryAddress]
    )
  );

  // Struct hash: keccak256(abi.encode(TYPEHASH, user, keccak256(username), nonce, deadline))
  const structHash = keccak256(
    encodeAbiParameters(
      parseAbiParameters('bytes32, address, bytes32, uint256, uint256'),
      [REGISTER_PASSKEY_TYPEHASH, accountAddress, keccak256(toBytes(username)), nonce, deadline]
    )
  );

  // EIP-712 digest: keccak256("\x19\x01" || domainSeparator || structHash)
  return keccak256(
    `0x1901${domainSeparator.slice(2)}${structHash.slice(2)}`
  );
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
