/**
 * Client-side ZK Email prover.
 *
 * Produces the email-tx-builder `EmailProof` tuple that `ZkEmailInvites.claimRoleByDomain` verifies,
 * from a raw `.eml` the user controls — entirely in the browser (no relayer). The heavy Groth16
 * proving runs in a Web Worker (see useZkEmailClaim) so the UI never blocks.
 *
 * STATUS of the cryptographic step: real proof generation requires the deployed verifier + the
 * registered zk-email blueprint/circuit for the POP command "Claim POP role for {ethAddr}". Those
 * artifacts are stood up as part of the contract/infra rollout (they are NOT live yet). Until then:
 *   - `parseEml` + `buildCommand` + the EmailProof assembly are REAL and final.
 *   - `generateProofData` is the one isolated boundary: it calls @zk-email/sdk in production and a
 *     deterministic MOCK in dev / E2E (NEXT_PUBLIC_E2E_MODE) so the whole flow is exercisable now.
 * Swapping the mock for the SDK is the only change once the blueprint is registered.
 */

const ZERO_BYTES32 = '0x' + '0'.repeat(64);

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
 * Parse a raw RFC822 .eml into the fields we surface + need. Header-only parse (no body needed for
 * the subject command). Returns { from, fromDomain, subject, dkimDomain }.
 */
export function parseEml(emlText) {
  if (!emlText || typeof emlText !== 'string') {
    throw new Error('Empty email file');
  }
  // Unfold headers (RFC822 continuation lines start with whitespace) and split at the blank line.
  const headerBlock = emlText.split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, ' ');
  const header = (name) => {
    const m = headerBlock.match(new RegExp(`^${name}:[ \\t]*(.*)$`, 'im'));
    return m ? m[1].trim() : '';
  };
  const from = header('From');
  const emailMatch = from.match(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  const fromEmail = emailMatch ? emailMatch[0] : '';
  const fromDomain = emailMatch ? emailMatch[1].toLowerCase() : '';
  // DKIM-Signature carries the signing domain in its `d=` tag (what the proof actually attests).
  const dkim = header('DKIM-Signature');
  const dMatch = dkim.match(/(?:^|;)\s*d=([A-Za-z0-9.-]+)/);
  const dkimDomain = dMatch ? dMatch[1].toLowerCase() : fromDomain;

  return { from, fromEmail, fromDomain, subject: header('Subject'), dkimDomain };
}

function isE2E() {
  return typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_E2E_MODE === 'true';
}

/**
 * THE ONE CRYPTOGRAPHIC BOUNDARY. Generate the Groth16 proof + public fields from the .eml.
 *
 * Production path (once the blueprint is registered + verifier deployed):
 *   const sdk = (await import('@zk-email/sdk')).initZkEmailSdk();
 *   const blueprint = await sdk.getBlueprint(blueprintSlug);            // e.g. "hudsonhrh/pop-role-claim@v1"
 *   const prover = blueprint.createProver({ isLocal: true });           // browser WASM, no server
 *   const proof = await prover.generateProof(emlText);
 *   return mapBlueprintProofToEmailProof(proof);                        // -> EmailProof tuple
 *
 * Dev/E2E path: a deterministic placeholder so the claim UX + gasless submission are testable without
 * the (not-yet-deployed) circuit. The placeholder is obviously invalid on-chain — it never verifies.
 */
async function generateProofData({ emlText, claimer, blueprintSlug }) {
  if (isE2E() || !blueprintSlug) {
    // Deterministic mock keyed off the email + claimer so nullifiers differ per (email, address).
    const seed = `${parseEml(emlText).fromEmail}:${claimer}`;
    const h = await sha256Hex(seed);
    return {
      publicKeyHash: ZERO_BYTES32,
      emailNullifier: '0x' + h,
      accountSalt: '0x' + (await sha256Hex(`salt:${seed}`)),
      isCodeExist: true,
      proof: '0x', // placeholder — a real proof is ~256 bytes of Groth16 calldata
      __mock: true,
    };
  }
  // Real client-side proving lives behind a dynamic import so it is only loaded when actually proving
  // and never blocks the static build. Requires `yarn add @zk-email/sdk` + the registered blueprint.
  throw new Error(
    'ZK Email proving is not wired yet: register the POP blueprint and install @zk-email/sdk (see prover.js).',
  );
}

/**
 * Assemble the full EmailProof the contract expects. `claimer` is bound into the command so a proof
 * can only ever be redeemed to that address.
 * @returns {Promise<{ proof: Object, meta: Object }>}
 */
export async function generateEmailProof({ emlText, claimer, blueprintSlug = '' }) {
  const parsed = parseEml(emlText);
  if (!parsed.dkimDomain) throw new Error('Could not read the sending domain from the email (no DKIM-Signature).');

  const data = await generateProofData({ emlText, claimer, blueprintSlug });

  const proof = {
    domainName: parsed.dkimDomain,
    publicKeyHash: data.publicKeyHash,
    timestamp: 0,
    maskedCommand: buildCommand(claimer),
    emailNullifier: data.emailNullifier,
    accountSalt: data.accountSalt,
    isCodeExist: data.isCodeExist,
    proof: data.proof,
  };
  return { proof, meta: { domain: parsed.dkimDomain, fromEmail: parsed.fromEmail, isMock: !!data.__mock } };
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
