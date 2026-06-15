/**
 * Client-side ZK Email prover.
 *
 * Produces the `ZkEmailProof` tuple that `ZkEmailInvites.claimRoleByDomain` verifies, from a raw
 * `.eml` the user controls — entirely in the browser (no relayer, no server). The heavy Groth16
 * proving runs via snarkjs WASM.
 *
 * Pipeline:
 *   .eml ──▶ @zk-email/helpers (DKIM verify + circuit inputs) ──▶ snarkjs.groth16.fullProve
 *        ──▶ ZkEmailProof { pA, pB, pC, pubkeyHash, emailNullifier, domainName }
 *
 * The circuit (`circuits/PopRoleClaim.circom`) has 3 public signals: [pubkeyHash, emailNullifier,
 * claimerAddress]. The claimer is bound in-circuit from the signed subject "Claim POP role for
 * 0x<addr>", so a proof can only ever be redeemed to that address.
 *
 * Proving artifacts (`PopRoleClaim.wasm` + `PopRoleClaim.zkey`, the latter ~hundreds of MB) are
 * fetched from `NEXT_PUBLIC_ZKEMAIL_ARTIFACTS_URL` at prove time (host on IPFS/CDN; never bundled).
 */

const ARTIFACTS_URL = (process.env.NEXT_PUBLIC_ZKEMAIL_ARTIFACTS_URL || '').replace(/\/$/, '');
const MAX_HEADERS_LENGTH = 1024;
const COMMAND_PREFIX = 'Claim POP role for 0x';

/** The on-chain command the email subject must contain, binding the claim to `claimer`. */
export function buildCommand(claimer) {
  return `Claim POP role for ${claimer}`;
}

/** A `mailto:` link that pre-fills the verification email (subject carries the bound address). */
export function buildMailto({ to = '', claimer }) {
  const subject = encodeURIComponent(buildCommand(claimer));
  return `mailto:${to}?subject=${subject}`;
}

/**
 * Parse a raw RFC822 .eml header block. We only need the signing domain (the DKIM `d=` tag), which is
 * the domain the on-chain registry binds to `pubkeyHash`. Returns { from, fromEmail, dkimDomain }.
 */
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

/**
 * Generate the `ZkEmailProof` for `claimer` from a raw `.eml`. Fully client-side.
 * @param {{ emlText: string, claimer: string }} args
 * @returns {Promise<{ proof: Object, meta: { domain: string, nullifier: string } }>}
 */
export async function generateEmailProof({ emlText, claimer }) {
  if (!ARTIFACTS_URL) {
    throw new Error(
      'ZK proving is not configured: set NEXT_PUBLIC_ZKEMAIL_ARTIFACTS_URL to the hosted PopRoleClaim.wasm/.zkey location.',
    );
  }

  // Lazy-load so snarkjs + @zk-email/helpers stay out of the main/SSG bundle (only the /claim prove
  // path pulls them in).
  const [{ generateEmailVerifierInputs }, snarkjs] = await Promise.all([
    import('@zk-email/helpers/dist/input-generators'),
    import('snarkjs'),
  ]);

  // 1. DKIM-verify the email and derive the circuit inputs (fetches the sender's DKIM pubkey via DoH).
  const inputs = await generateEmailVerifierInputs(emlText, {
    ignoreBodyHashCheck: true,
    maxHeadersLength: MAX_HEADERS_LENGTH,
  });

  // 2. Locate the command in the canonicalized signed header (the circuit's `commandIndex` input).
  const headerBytes = inputs.emailHeader.map(Number);
  const prefix = Array.from(COMMAND_PREFIX, (c) => c.charCodeAt(0));
  let commandIndex = -1;
  for (let i = 0; i + prefix.length <= headerBytes.length; i++) {
    let ok = true;
    for (let j = 0; j < prefix.length; j++) {
      if (headerBytes[i + j] !== prefix[j]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      commandIndex = i;
      break;
    }
  }
  if (commandIndex < 0) {
    throw new Error(
      'The signed email must contain "Claim POP role for 0x<your address>" in its subject — send it from the address you want to verify.',
    );
  }
  inputs.commandIndex = String(commandIndex);

  // 3. Prove in-browser (snarkjs WASM). One-time artifact download (~hundreds of MB) + ~30s prove.
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    inputs,
    `${ARTIFACTS_URL}/PopRoleClaim.wasm`,
    `${ARTIFACTS_URL}/PopRoleClaim.zkey`,
  );

  // publicSignals = [pubkeyHash, emailNullifier, claimerAddress]
  if (BigInt(publicSignals[2]) !== BigInt(claimer)) {
    throw new Error('This proof is bound to a different address than your connected account.');
  }

  const { dkimDomain } = parseEml(emlText);
  if (!dkimDomain) throw new Error('Could not read the signing domain from the email.');

  const proofStruct = {
    pA: [u256(proof.pi_a[0]), u256(proof.pi_a[1])],
    // snarkjs returns G2 coordinates in the reverse order the Solidity verifier expects — swap each pair.
    pB: [
      [u256(proof.pi_b[0][1]), u256(proof.pi_b[0][0])],
      [u256(proof.pi_b[1][1]), u256(proof.pi_b[1][0])],
    ],
    pC: [u256(proof.pi_c[0]), u256(proof.pi_c[1])],
    pubkeyHash: b32(publicSignals[0]),
    emailNullifier: b32(publicSignals[1]),
    domainName: dkimDomain,
  };

  return { proof: proofStruct, meta: { domain: dkimDomain, nullifier: proofStruct.emailNullifier } };
}
