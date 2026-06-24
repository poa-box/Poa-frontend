/**
 * Client-side ZK Email prover (domain + specific-address).
 *
 * Produces the proof tuples that `ZkEmailInvites` verifies, from a raw `.eml` the user controls —
 * entirely in the browser (no relayer). Two circuits:
 *   - PopRoleClaim   (v1, 3 signals) -> ZkEmailProof   -> claimRoleByDomain (lighter, ~17s).
 *   - PopRoleClaimV2 (v2, 4 signals, adds emailHash) -> ZkEmailProofV2 -> claimRoleByEmail (~25-40s).
 *
 * Artifacts (`PopRoleClaim{,V2}.wasm/.zkey`) are fetched from `NEXT_PUBLIC_ZKEMAIL_ARTIFACTS_URL` at
 * prove time (host on IPFS/CDN; never bundled).
 */

// Proving artifacts are hosted free on The Graph's IPFS: each ~8MB zkey part is pinned individually
// and a per-circuit MANIFEST (its own CID) lists the part CIDs + the wasm CID. `GATEWAY` is a URL
// template (`{cid}` placeholder). Override any of these via env when re-hosting (e.g. on Pinata).
const GATEWAY = process.env.NEXT_PUBLIC_ZKEMAIL_GATEWAY || 'https://api.thegraph.com/ipfs/api/v0/cat?arg={cid}';
const MANIFEST = {
  PopRoleClaim: process.env.NEXT_PUBLIC_ZKEMAIL_V1_MANIFEST || 'Qmbe9p35ZAVgxxMQJL43CJLtTbmc8dmVJEat3f9vfCaqxM',
  PopRoleClaimV2: process.env.NEXT_PUBLIC_ZKEMAIL_V2_MANIFEST || 'QmUrEdu9CEkJBmWBNz7qwSVgkS1gobknWR3m7RdfLnEvZA',
};
const MAX_HEADERS_LENGTH = 1024;
const FROM_WINDOW = 256; // == FROM_WINDOW in PopRoleClaimV2.circom
const COMMAND_PREFIX = 'Claim POP role for 0x';

/** The on-chain command the email subject must contain, binding the claim to `claimer`. */
export function buildCommand(claimer) {
  return `Claim POP role for ${claimer}`;
}

/** A `mailto:` link that pre-fills the verification email (subject carries the bound address). */
export function buildMailto({ to = '', claimer }) {
  return `mailto:${to}?subject=${encodeURIComponent(buildCommand(claimer))}`;
}

/** Parse the .eml header block — the signing domain (DKIM `d=`) + the From email address. */
export function parseEml(emlText) {
  if (!emlText || typeof emlText !== 'string') throw new Error('Empty email file');
  const headerBlock = emlText.split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, ' ');
  const header = (name) => {
    const m = headerBlock.match(new RegExp(`^${name}:[ \\t]*(.*)$`, 'im'));
    return m ? m[1].trim() : '';
  };
  const from = header('From');
  const emailMatch = from.match(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  const fromEmail = emailMatch ? emailMatch[0] : '';
  const fromDomain = emailMatch ? emailMatch[1].toLowerCase() : '';
  const dkim = header('DKIM-Signature');
  const dMatch = dkim.match(/(?:^|;)\s*d=([A-Za-z0-9.-]+)/);
  const dkimDomain = dMatch ? dMatch[1].toLowerCase() : fromDomain;
  return { from, fromEmail, dkimDomain };
}

const u256 = (s) => '0x' + BigInt(s).toString(16);
const b32 = (s) => '0x' + BigInt(s).toString(16).padStart(64, '0');

function _requireManifest(name) {
  const cid = MANIFEST[name];
  if (!GATEWAY || !cid || cid.startsWith('__')) {
    const v = name === 'PopRoleClaim' ? 'V1' : 'V2';
    throw new Error(`ZK proving artifacts are not configured for ${name} (set NEXT_PUBLIC_ZKEMAIL_${v}_MANIFEST).`);
  }
}

/** Find a byte subsequence in the canonicalized header (returns start index or -1). */
function _find(header, bytes, from = 0) {
  for (let i = from; i + bytes.length <= header.length; i++) {
    let ok = true;
    for (let j = 0; j < bytes.length; j++) {
      if (header[i + j] !== bytes[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}
const _bytesOf = (s) => Array.from(s, (c) => c.charCodeAt(0));

/** DKIM-verify + derive base circuit inputs + the bound commandIndex. Shared by both circuits. */
async function _baseInputs(emlText, claimer) {
  const { generateEmailVerifierInputs } = await import('@zk-email/helpers/dist/input-generators');
  const inputs = await generateEmailVerifierInputs(emlText, {
    ignoreBodyHashCheck: true,
    maxHeadersLength: MAX_HEADERS_LENGTH,
  });
  const header = inputs.emailHeader.map(Number);

  const commandIndex = _find(header, _bytesOf(COMMAND_PREFIX));
  if (commandIndex < 0) {
    throw new Error(
      'The signed email must contain "Claim POP role for 0x<your address>" in its subject — send it from the address you want to verify.',
    );
  }
  inputs.commandIndex = String(commandIndex);
  return { inputs, header };
}

function _formatProof(proof) {
  return {
    pA: [u256(proof.pi_a[0]), u256(proof.pi_a[1])],
    // snarkjs returns G2 coordinates in the reverse order the Solidity verifier expects — swap each pair.
    pB: [
      [u256(proof.pi_b[0][1]), u256(proof.pi_b[0][0])],
      [u256(proof.pi_b[1][1]), u256(proof.pi_b[1][0])],
    ],
    pC: [u256(proof.pi_c[0]), u256(proof.pi_c[1])],
  };
}

/**
 * Generate a DOMAIN proof (`ZkEmailProof`) for `claimer`. Used for whole-domain allowlist entries.
 * @returns {Promise<{ proof: Object, meta: { domain: string, fromEmail: string, nullifier: string } }>}
 */
export async function generateDomainProof({ emlText, claimer }) {
  _requireManifest('PopRoleClaim');
  const { inputs } = await _baseInputs(emlText, claimer);
  const [{ loadZkey }, snarkjs] = await Promise.all([import('./zkeyLoader'), import('snarkjs')]);
  const { zkey, wasmUrl } = await loadZkey(GATEWAY, MANIFEST.PopRoleClaim); // chunked -> in-memory zkey
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, wasmUrl, zkey);
  // publicSignals = [pubkeyHash, emailNullifier, claimerAddress]
  if (BigInt(publicSignals[2]) !== BigInt(claimer)) {
    throw new Error('This proof is bound to a different address than your connected account.');
  }
  const { dkimDomain, fromEmail } = parseEml(emlText);
  if (!dkimDomain) throw new Error('Could not read the signing domain from the email.');
  return {
    proof: {
      ..._formatProof(proof),
      pubkeyHash: b32(publicSignals[0]),
      emailNullifier: b32(publicSignals[1]),
      domainName: dkimDomain,
    },
    meta: { domain: dkimDomain, fromEmail, nullifier: b32(publicSignals[1]) },
  };
}

/**
 * Generate a SPECIFIC-ADDRESS proof (`ZkEmailProofV2`) for `claimer`. Used for individual-email
 * allowlist entries; exposes `emailHash` (Poseidon commitment to the From address). The From-window
 * inputs are computed identically to `circuits/scripts/gen-inputs.mjs`.
 * @returns {Promise<{ proof: Object, meta: { domain: string, fromEmail: string, emailHash: string, nullifier: string } }>}
 */
export async function generateEmailAddressProof({ emlText, claimer }) {
  _requireManifest('PopRoleClaimV2');
  const { inputs, header } = await _baseInputs(emlText, claimer);
  const { dkimDomain, fromEmail } = parseEml(emlText);
  if (!fromEmail) throw new Error('Could not read the From email address from the email.');

  // Locate the From field + the email within a 256-byte window (matches PopRoleClaimV2 + gen-inputs).
  const fromIdx = _find(header, _bytesOf('from:'));
  if (fromIdx < 0) throw new Error('From field not found in the signed header.');
  let fromWindowIndex;
  if (fromIdx === 0) fromWindowIndex = 0;
  else if (header[fromIdx - 2] === 13 && header[fromIdx - 1] === 10) fromWindowIndex = fromIdx - 2;
  else throw new Error('From field not preceded by CRLF (unexpected canonicalization).');

  const emailIdx = _find(header, _bytesOf(fromEmail), fromWindowIndex);
  if (emailIdx < 0 || emailIdx + fromEmail.length > fromWindowIndex + FROM_WINDOW) {
    throw new Error('From email address is not within the signed From window.');
  }
  inputs.fromWindowIndex = String(fromWindowIndex);
  inputs.emailIndexInWindow = String(emailIdx - fromWindowIndex);

  const [{ loadZkey }, snarkjs] = await Promise.all([import('./zkeyLoader'), import('snarkjs')]);
  const { zkey, wasmUrl } = await loadZkey(GATEWAY, MANIFEST.PopRoleClaimV2); // chunked -> in-memory zkey
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, wasmUrl, zkey);
  // publicSignals = [pubkeyHash, emailNullifier, claimerAddress, emailHash]
  if (BigInt(publicSignals[2]) !== BigInt(claimer)) {
    throw new Error('This proof is bound to a different address than your connected account.');
  }
  if (!dkimDomain) throw new Error('Could not read the signing domain from the email.');
  return {
    proof: {
      ..._formatProof(proof),
      pubkeyHash: b32(publicSignals[0]),
      emailNullifier: b32(publicSignals[1]),
      domainName: dkimDomain,
      emailHash: b32(publicSignals[3]),
    },
    meta: { domain: dkimDomain, fromEmail, emailHash: b32(publicSignals[3]), nullifier: b32(publicSignals[1]) },
  };
}
