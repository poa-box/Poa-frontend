#!/usr/bin/env node
/**
 * Off-chain validation of the virtual passkey math.
 *
 * Verifies:
 *   1. (r, s) ECDSA signature is valid against (x, y) over
 *      sha256(authenticatorData || sha256(clientDataJSON)).
 *   2. `challengeIndex` / `typeIndex` byte offsets land on the right JSON values.
 *   3. authenticatorData has flags=0x05 (UP|UV) and length=37.
 *   4. signature s value is low-s normalized.
 *
 * LIMITATION — drift risk:
 * This test duplicates the assertion-building logic from
 * src/services/e2e/virtualPasskey.js rather than importing it (the source
 * file uses ESM + browser-only globals like btoa/window). If you change
 * the algorithm in virtualPasskey.js — info strings, flags byte, JSON shape
 * — update the equivalents here too, or this test will pass while real
 * signatures fail with AA25 at the bundler. See BACKLOG.md for the proper
 * fix (split pure math into its own importable module).
 *
 * Exit code 0 = pass. Non-zero = mismatch.
 */

const crypto = require('crypto');

let p256, sha256;
try {
  ({ p256 } = require('@noble/curves/p256'));
  ({ sha256 } = require('@noble/hashes/sha2'));
} catch (e) {
  console.error('[test-virtual-passkey] Missing @noble deps. Run `yarn install` from poa-app/.');
  process.exit(1);
}

// Test seed (deterministic; matches the derivation in virtualPasskey.js)
const SEED_HEX = '0x' + '11'.repeat(32);
const TEST_CHALLENGE_HEX = '0x' + 'fa'.repeat(32);

function utf8(s) { return new TextEncoder().encode(s); }
function concat(...arrs) {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}
function base64url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function hexToBytes(h) { return Buffer.from(h.startsWith('0x') ? h.slice(2) : h, 'hex'); }

function deriveCredential(seedHex) {
  const seed = hexToBytes(seedHex);
  const privKey = sha256(concat(seed, utf8('poa-virtual-passkey-priv-v1')));
  const pub = p256.getPublicKey(privKey, false); // 65 bytes: 04 || X(32) || Y(32)
  return {
    privKey,
    x: pub.slice(1, 33),
    y: pub.slice(33, 65),
  };
}

function signAssertion(challengeHex, privKey, hostname = 'localhost', origin = 'http://localhost:3000') {
  const challengeBytes = hexToBytes(challengeHex);
  const challengeB64 = base64url(challengeBytes);
  const clientDataJSONStr = `{"type":"webauthn.get","challenge":"${challengeB64}","origin":"${origin}","crossOrigin":false}`;
  const clientDataJSON = utf8(clientDataJSONStr);

  const rpIdHash = sha256(utf8(hostname));
  const flags = new Uint8Array([0x05]);
  const counter = new Uint8Array([0, 0, 0, 1]);
  const authenticatorData = concat(rpIdHash, flags, counter);

  const clientDataHash = sha256(clientDataJSON);
  const signedHash = sha256(concat(authenticatorData, clientDataHash));

  const sig = p256.sign(signedHash, privKey, { lowS: true });
  const findIndex = (s, key) => {
    const i = s.indexOf(`"${key}":"`);
    return i === -1 ? -1 : i + key.length + 4;
  };
  return {
    authenticatorData,
    clientDataJSON,
    clientDataJSONStr,
    challengeIndex: findIndex(clientDataJSONStr, 'challenge'),
    typeIndex: findIndex(clientDataJSONStr, 'type'),
    r: sig.r,
    s: sig.s,
    signedHash,
    challengeB64,
  };
}

let failed = 0;
function check(label, ok, details) {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}${details ? ` — ${details}` : ''}`);
    failed++;
  }
}

console.log('[test-virtual-passkey] Deriving credential…');
const cred = deriveCredential(SEED_HEX);

console.log('[test-virtual-passkey] Signing assertion for test challenge…');
const auth = signAssertion(TEST_CHALLENGE_HEX, cred.privKey);

console.log('[test-virtual-passkey] Validating assertion shape…');
check('challengeIndex points inside clientDataJSON', auth.challengeIndex > 0 && auth.challengeIndex < auth.clientDataJSON.length);
check('typeIndex points inside clientDataJSON', auth.typeIndex > 0 && auth.typeIndex < auth.clientDataJSON.length);

const challengeAtIndex = auth.clientDataJSONStr.slice(auth.challengeIndex, auth.challengeIndex + auth.challengeB64.length);
check('clientDataJSON[challengeIndex:] starts with the base64url challenge',
  challengeAtIndex === auth.challengeB64,
  `expected ${auth.challengeB64.slice(0, 16)}…, got ${challengeAtIndex.slice(0, 16)}…`);

const typeAtIndex = auth.clientDataJSONStr.slice(auth.typeIndex, auth.typeIndex + 'webauthn.get'.length);
check('clientDataJSON[typeIndex:] starts with "webauthn.get"', typeAtIndex === 'webauthn.get');

console.log('[test-virtual-passkey] Verifying P-256 signature against public key…');
const pubKeyUncompressed = concat(new Uint8Array([0x04]), cred.x, cred.y);
const verified = p256.verify({ r: auth.r, s: auth.s }, auth.signedHash, pubKeyUncompressed);
check('p256.verify(sig, signedHash, pubKey) returns true', verified);

check('flags byte = 0x05 (UP|UV)', auth.authenticatorData[32] === 0x05);
check('authenticatorData length = 37 bytes', auth.authenticatorData.length === 37);
check('signature low-s normalized', auth.s <= (p256.CURVE.n / 2n));

if (failed > 0) {
  console.error(`\n[test-virtual-passkey] FAIL: ${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\n[test-virtual-passkey] OK: all checks passed. Math matches the on-chain WebAuthnLib expectations.');
console.log('  rpIdHash uses runtime window.location.hostname; that one only validates against a real chain.');
