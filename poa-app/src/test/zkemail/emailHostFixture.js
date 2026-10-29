import { buildAllowlist, domainHash, emailHash } from '@/lib/zkemail/allowlist';
import { buildCommand } from '@/lib/zkemail/prover';
import { credentialIdDigest, derivePasskeySalt } from '@poa-box/core/accounts/codecs';
import { USER_OPERATION_EVENTS } from '@poa-box/core/execute/outcome';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';

export const ACCOUNT = `0x${'11'.repeat(20)}`;
export const OTHER = `0x${'99'.repeat(20)}`;
export const MODULE = `0x${'44'.repeat(20)}`;
export const REGISTRY = `0x${'22'.repeat(20)}`;
export const FACTORY = `0x${'33'.repeat(20)}`;
export const ORG = `0x${'55'.repeat(32)}`;
export const HASH = `0x${'66'.repeat(32)}`;
export const TX = `0x${'77'.repeat(32)}`;
export const ZERO = `0x${'00'.repeat(20)}`;
export const DOMAIN_ROLE = '7';
export const EMAIL_ROLE = '9007199254740993';
export const SENDER = 'member@example.test';
export const GROTH16_STUB = { pi_a: ['1', '2', '1'], pi_b: [['3', '4'], ['5', '6'], ['1', '0']], pi_c: ['7', '8', '1'] };

// Synthetic public pointers only. The signing/creation boundaries never call WebAuthn.
const rawCredentialId = 'c3ludGhldGljLXB1YmxpYy1wb2ludGVy';
const credentialId = credentialIdDigest(`0x${Array.from(atob(rawCredentialId), c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')}`);
export const credential = { credentialId, rawCredentialId,
  publicKeyX: '0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296',
  publicKeyY: '0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5', salt: derivePasskeySalt(credentialId), accountAddress: ACCOUNT, username: 'member',
  orgName: 'Test organization', orgId: ORG, targetAddress: MODULE, flow: 'zkemail', credentialChainId: 100,
  registryAddress: REGISTRY, factoryAddress: FACTORY, initiator: { account: null, authType: null } };

export function deliveredMail({ sender = SENDER, claimer = ACCOUNT, suffix = '' } = {}) {
  return `received: synthetic delivery\r\nfrom: Member <${sender}>\r\nsubject: ${buildCommand(claimer)}\r\ndkim-signature: v=1; d=example.test; b=synthetic${suffix};\r\n\r\nSynthetic claim only${suffix}`;
}

export async function invitationFixture({ email = true, domain = true } = {}) {
  const built = await buildAllowlist({ orgId: ORG, entries: [
    ...(domain ? [{ type: 'domain', identifier: 'example.test', hatIds: [DOMAIN_ROLE] }] : []),
    ...(email ? [{ type: 'email', identifier: SENDER, hatIds: [EMAIL_ROLE] }] : []),
  ] });
  return { ...built, emailHash: await emailHash(SENDER), domainHash: await domainHash('example.test') };
}

/** ABI/protocol simulation only: these curve coordinates do not verify a Groth16 proof. */
export function simulatedProofResult(inputs, list, versionOverride) {
  const header = String.fromCharCode(...inputs.emailHeader.map(Number));
  const claimer = header.match(/Claim POP role for (0x[0-9a-f]{40})/i)?.[1] || ACCOUNT;
  const version = versionOverride || (inputs.atIndex ? 'v2' : 'v1');
  return { proof: GROTH16_STUB, publicSignals: version === 'v1'
    ? ['1', '2', BigInt(claimer).toString(), BigInt(list.domainHash).toString()]
    : ['1', '2', BigInt(claimer).toString(), BigInt(list.emailHash).toString(), BigInt(list.domainHash).toString()] };
}

export function exactOperationReceipt(hash, { success = true, sender = ACCOUNT, nonce = 1n, tx = TX, logs = true } = {}) {
  return { transactionHash: tx, status: 'success', blockNumber: 50n,
    logs: logs ? [{ address: ENTRY_POINT_ADDRESS,
      ...USER_OPERATION_EVENTS.encodeEventLog('UserOperationEvent', [hash, sender, ZERO, nonce, success, 10, 20]) }] : [] };
}
