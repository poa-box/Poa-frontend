/**
 * ZK Email allowlist — build / parse / prove.
 *
 * The org "allowed emails" allowlist (whole domains + specific addresses -> role hat IDs) is a JSON
 * file on IPFS, committed on-chain by a single merkle root. This module builds that file + its merkle
 * tree, and produces the merkle proof a member submits when claiming.
 *
 * CRITICAL coordination (must match exactly, all verified):
 *   - Merkle leaf == `ZkEmailInvites._leaf` == OpenZeppelin StandardMerkleTree over
 *     `['uint8','bytes32','uint256[]']` = [kind, id, hatIds], kind 0=domain, 1=email.
 *   - domain id = keccak256(utf8(lowercase(domain)))  (== contract `keccak256(bytes(_lower(domain)))`).
 *   - email  id = emailHash(address) = Poseidon(packBytes(lowercase(address) zero-padded to 192 bytes))
 *     == the `emailHash` public signal of `circuits/PopRoleClaimV2.circom` (verified equal for a real
 *     proof). The 192 + little-endian 31-byte packing here MUST equal `EMAX`/`PackBytes` in the circuit.
 */
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { keccak256, stringToBytes } from 'viem';

export const ALLOWLIST_SCHEMA = 'poa.zkemail.allowlist/1';
export const LEAF_TYPES = ['uint8', 'bytes32', 'uint256[]'];
const EMAIL_PAD = 192; // == EMAX in PopRoleClaimV2.circom
const CHUNKS = 7; // ceil(192 / 31)

const norm = (s) => String(s || '').trim().toLowerCase();
const sortHats = (hatIds) => hatIds.map((h) => BigInt(h)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** keccak256 of the lowercased ASCII domain — the contract's domain-leaf identifier. */
export function domainHash(domain) {
  return keccak256(stringToBytes(norm(domain)));
}

/**
 * emailHash(address) — Poseidon commitment matching `PopRoleClaimV2.circom`'s `emailHash` signal.
 * Lowercase, zero-pad to 192 bytes, pack into 7 little-endian 31-byte field chunks, Poseidon(7).
 * @returns {Promise<string>} 0x-padded bytes32
 */
export async function emailHash(address) {
  const { buildPoseidon } = await import('circomlibjs');
  const poseidon = await buildPoseidon();
  const bytes = new Uint8Array(EMAIL_PAD);
  bytes.set(new TextEncoder().encode(norm(address)).slice(0, EMAIL_PAD));
  const chunks = [];
  for (let i = 0; i < CHUNKS; i++) {
    let acc = 0n;
    for (let j = 0; j < 31; j++) {
      const idx = 31 * i + j;
      acc += (idx < EMAIL_PAD ? BigInt(bytes[idx]) : 0n) << BigInt(8 * j);
    }
    chunks.push(acc);
  }
  return '0x' + BigInt(poseidon.F.toString(poseidon(chunks))).toString(16).padStart(64, '0');
}

/**
 * Build the allowlist JSON + merkle tree from editor entries.
 * @param {{ orgId: string, entries: Array<{type:'domain'|'email', identifier:string, hatIds:Array<string|bigint>, roleIndexes?:number[]}> }} args
 * @returns {Promise<{ doc: object, json: string, tree: StandardMerkleTree, root: string }>}
 */
export async function buildAllowlist({ orgId, entries }) {
  const rows = [];
  for (const e of entries) {
    const hatIds = sortHats(e.hatIds);
    const id = e.type === 'domain' ? domainHash(e.identifier) : await emailHash(e.identifier);
    rows.push({ ...e, id, hatIds });
  }
  const tree = StandardMerkleTree.of(
    // uint256[] values as decimal strings (BigInt isn't JSON-serializable in the tree dump).
    rows.map((r) => [r.type === 'domain' ? 0 : 1, r.id, r.hatIds.map((h) => h.toString())]),
    LEAF_TYPES,
  );
  const docEntries = rows.map((r) => ({
    type: r.type,
    identifier: r.identifier,
    [r.type === 'email' ? 'emailHash' : 'domainHash']: r.id,
    hatIds: r.hatIds.map((h) => '0x' + h.toString(16)),
    roleIndexes: r.roleIndexes || [],
  }));
  const doc = {
    schema: ALLOWLIST_SCHEMA,
    orgId,
    root: tree.root,
    leafTypes: LEAF_TYPES,
    entries: docEntries,
    treeDump: tree.dump(), // lets the member side reload the exact tree without recomputing emailHashes
  };
  return { doc, json: JSON.stringify(doc), tree, root: tree.root };
}

/** Reload the exact tree from a fetched allowlist doc (prefers the dumped tree). */
export function treeFromDoc(doc) {
  if (doc?.treeDump) return StandardMerkleTree.load(doc.treeDump);
  throw new Error('Allowlist file is missing its merkle tree dump.');
}

/** Recompute the root from a doc and assert it matches `onchainRoot` (anti-swapped-CID guard). */
export function assertRootMatches(doc, onchainRoot) {
  const tree = treeFromDoc(doc);
  if (tree.root.toLowerCase() !== String(onchainRoot).toLowerCase()) {
    throw new Error('Allowlist file does not match the active on-chain root.');
  }
  return tree;
}

/** Merkle proof + hatIds for a DOMAIN entry, or null if the domain is not in the allowlist. */
export function proofForDomain(tree, domain) {
  const dh = domainHash(domain).toLowerCase();
  for (const [i, v] of tree.entries()) {
    if (Number(v[0]) === 0 && String(v[1]).toLowerCase() === dh) {
      return { hatIds: v[2].map((h) => h.toString()), proof: tree.getProof(i) };
    }
  }
  return null;
}

/** Merkle proof + hatIds for a SPECIFIC-address entry by its emailHash, or null. */
export function proofForEmailHash(tree, eHash) {
  const target = String(eHash).toLowerCase();
  for (const [i, v] of tree.entries()) {
    if (Number(v[0]) === 1 && String(v[1]).toLowerCase() === target) {
      return { hatIds: v[2].map((h) => h.toString()), proof: tree.getProof(i) };
    }
  }
  return null;
}

/** Human-readable summary for the join UI: which domains + how many specific addresses are invited. */
export function summarize(doc) {
  const domains = (doc.entries || []).filter((e) => e.type === 'domain').map((e) => e.identifier);
  const emails = (doc.entries || []).filter((e) => e.type === 'email').map((e) => e.identifier);
  return { domains, emails };
}
