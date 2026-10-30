/**
 * Client-side ZK Email prover (domain + specific-address).
 *
 * Produces the proof tuples that `ZkEmailInvites` verifies, from a raw `.eml` the user controls —
 * entirely in the browser (no relayer). Two circuits:
 *   - PopRoleClaim   (v1, 4 signals) -> ZkEmailProof   -> claimRoleByDomain (lighter, ~17s).
 *   - PopRoleClaimV2 (v2, 5 signals, adds emailHash + fromDomainHash) -> ZkEmailProofV2 -> claimRoleByEmail (~25-40s).
 *
 * Artifacts (`PopRoleClaim{,V2}.wasm/.zkey`) are fetched from `NEXT_PUBLIC_ZKEMAIL_ARTIFACTS_URL` at
 * prove time (host on IPFS/CDN; never bundled).
 */

import { EMAIL_CIRCUIT_RECIPES, buildEmailClaimCommand, buildCircuitInputHints, projectGroth16Proof } from '@poa-box/core/email/proof';
import { Buffer } from 'buffer';
import { rawEmailBytes } from '@/lib/zkemail/rawEmail';
import { retainEmailProofProjection } from '@/lib/zkemail/proofProjection';

// Proving artifacts are hosted free on The Graph's IPFS: each ~8MB zkey part is pinned individually
// and a per-circuit MANIFEST (its own CID) lists the part CIDs + the wasm CID. `GATEWAY` is a URL
// template (`{cid}` placeholder). Override any of these via env when re-hosting (e.g. on Pinata).
const GATEWAY = process.env.NEXT_PUBLIC_ZKEMAIL_GATEWAY || 'https://api.thegraph.com/ipfs/api/v0/cat?arg={cid}';
const MANIFEST = {
  PopRoleClaim: process.env.NEXT_PUBLIC_ZKEMAIL_V1_MANIFEST || 'QmcvZPhcdLA8NQUimRzTDCqFY7y1ujbQZ6AJjdPm2NozGc',
  PopRoleClaimV2: process.env.NEXT_PUBLIC_ZKEMAIL_V2_MANIFEST || 'QmU4MJG8rAsfXrGb2sdFCBwcBCosDoVTPKUE5bXowe7Gx4',
};
const MAX_HEADERS_LENGTH = EMAIL_CIRCUIT_RECIPES.v1.maxHeadersLength;


/** The on-chain command the email subject must contain, binding the claim to `claimer`. */
export function buildCommand(claimer) {
  return buildEmailClaimCommand(claimer);
}

/**
 * Warm the proving key for `kind` ('domain' -> PopRoleClaim v1, 'email' -> PopRoleClaimV2) so the
 * ~640 MB chunked download runs during the send-email dead time instead of blocking the Verify step.
 * Fire-and-forget: never throws, dedupes with the prove-time load (zkeyLoader), and is a no-op when
 * the manifest isn't configured. Repeat visits hit the IndexedDB cache and finish instantly.
 */
export async function prefetchCircuitArtifacts(kind) {
  const name = kind === 'email' ? 'PopRoleClaimV2' : 'PopRoleClaim';
  const cid = MANIFEST[name];
  if (!GATEWAY || !cid || cid.startsWith('__')) return;
  try {
    const { prefetchZkey } = await import('@/lib/zkemail/zkeyLoader');
    prefetchZkey(GATEWAY, cid);
  } catch (_) {
    /* best-effort warm-up only */
  }
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
  return { from, fromEmail, fromDomain, dkimDomain };
}


function _requireManifest(name) {
  const cid = MANIFEST[name];
  if (!GATEWAY || !cid || cid.startsWith('__')) {
    const v = name === 'PopRoleClaim' ? 'V1' : 'V2';
    throw new Error(`ZK proving artifacts are not configured for ${name} (set NEXT_PUBLIC_ZKEMAIL_${v}_MANIFEST).`);
  }
}

/** DKIM verification remains a lazy browser engine; canonical hints consume its signed bytes. */
async function _baseInputs(emlText, claimer, version) {
  const [{ generateEmailVerifierInputsFromDKIMResult }, { verifyDKIMSignature }] = await Promise.all([
    import('@zk-email/helpers/dist/input-generators'), import('@zk-email/helpers/dist/dkim'),
  ]);
  const verified = await verifyDKIMSignature(Buffer.from(rawEmailBytes(emlText)));
  const inputs = generateEmailVerifierInputsFromDKIMResult(verified, {
    ignoreBodyHashCheck: true, maxHeadersLength: MAX_HEADERS_LENGTH,
  });
  const parsed = parseEml(emlText);
  if (!parsed.fromEmail) throw new Error('Could not read the From email address from the email.');
  if (!parsed.fromDomain) throw new Error('Could not read the sender’s email domain.');
  let hints;
  try { hints = buildCircuitInputHints({
    version, emailHeader: inputs.emailHeader,
    // The helper's emailHeaderLength includes SHA padding; use the verified raw header length.
    signedHeaderLength: verified.headers.length,
    fromEmail: parsed.fromEmail, dkimDomain: verified.signingDomain || parsed.dkimDomain, claimer,
  }); } catch (error) {
    if (/bound claim command/i.test(error.message) && /^subject:[^\r\n]*=\?/im.test(emlText)) {
      throw new Error('Your email provider encoded the subject in a format this verification cannot use. Send a fresh email with the exact plain-text subject shown above.');
    }
    throw error;
  }
  for (const key of ['commandIndex', 'fromWindowIndex', 'emailIndexInWindow', 'atIndex']) inputs[key] = hints[key];
  return { inputs, parsed };
}

/**
 * Generate a DOMAIN proof (`ZkEmailProof`) for `claimer`. Used for whole-domain allowlist entries.
 * @returns {Promise<{ proof: Object, meta: { domain: string, fromEmail: string, nullifier: string } }>}
 */
export async function generateDomainProof({ emlText, claimer, onProgress }) {
  _requireManifest('PopRoleClaim');
  const { inputs, parsed } = await _baseInputs(emlText, claimer, 'v1');
  const [{ loadZkey }, snarkjs] = await Promise.all([import('@/lib/zkemail/zkeyLoader'), import('snarkjs')]);
  const { zkey, wasmUrl } = await loadZkey(GATEWAY, MANIFEST.PopRoleClaim, onProgress);
  if (onProgress) onProgress({ phase: 'prove' });
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, wasmUrl, zkey);
  const projection = projectGroth16Proof({ version: 'v1', proof, publicSignals, claimer });
  return {
    proof: retainEmailProofProjection(projection),
    meta: { domain: parsed.fromDomain, fromEmail: parsed.fromEmail,
       nullifier: projection.proof.emailNullifier },
  };
}

/**
 * Generate a SPECIFIC-ADDRESS proof (`ZkEmailProofV2`) for `claimer`. Used for individual-email
 * allowlist entries; exposes `emailHash` (Poseidon commitment to the From address). The From-window
 * inputs are computed identically to `circuits/scripts/gen-inputs.mjs`.
 * @returns {Promise<{ proof: Object, meta: { domain: string, fromEmail: string, emailHash: string, nullifier: string } }>}
 */
export async function generateEmailAddressProof({ emlText, claimer, onProgress }) {
  _requireManifest('PopRoleClaimV2');
  const { inputs, parsed } = await _baseInputs(emlText, claimer, 'v2');
  const [{ loadZkey }, snarkjs] = await Promise.all([import('@/lib/zkemail/zkeyLoader'), import('snarkjs')]);
  const { zkey, wasmUrl } = await loadZkey(GATEWAY, MANIFEST.PopRoleClaimV2, onProgress);
  if (onProgress) onProgress({ phase: 'prove' });
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, wasmUrl, zkey);
  const projection = projectGroth16Proof({ version: 'v2', proof, publicSignals, claimer });
  return {
    proof: retainEmailProofProjection(projection),
    meta: { domain: parsed.fromDomain, fromEmail: parsed.fromEmail,
      emailHash: projection.proof.emailHash, nullifier: projection.proof.emailNullifier },
  };
}
