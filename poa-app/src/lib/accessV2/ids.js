/**
 * accessV2/ids — subject-id namespace arithmetic (ACCESS-V2-SPEC.md §1).
 *
 * PURE. Mirrors `src/libs/AccessV2Ids.sol` in the contracts repo one-for-one.
 *
 * Two namespaces share one id space and are told apart STRUCTURALLY (no lookup):
 *
 *   id >= 2^224                 -> LEGACY: a real Hats id, ADOPTED verbatim by a migrated org.
 *                                  Every Hats id embeds a nonzero tophat domain in bits 224..255.
 *   id <  2^224, bits 64..223   -> V2-NATIVE: `(uint160(authority) << 64) | localSeq`. The owning
 *   nonzero                        authority address IS the id, so the router needs no registry
 *                                  lookup and two orgs can never mint the same subject id.
 *
 * Everything here works on DECIMAL STRINGS via BigInt: subject ids are up to 256 bits, so they
 * must never touch Number. The subgraph keys `Subject.id` by the decimal string verbatim.
 */

import { normalizeSubjectId, classifySubjectId, localSequence, embeddedAuthority as coreEmbeddedAuthority, composeSubjectId as coreComposeSubjectId, predictNextSubjectIds as corePredictNextSubjectIds, HATS_NAMESPACE_FLOOR, AUTHORITY_ADDR_SHIFT } from '@poa-box/core/authority/ids';
export { HATS_NAMESPACE_FLOOR, AUTHORITY_ADDR_SHIFT };

/**
 * Coerce anything id-shaped (BigInt, decimal string, hex string, number) to BigInt.
 * Returns null rather than throwing — subgraph rows are the caller here and a malformed
 * row must degrade to "unknown", never crash a page.
 *
 * @param {bigint|string|number|null|undefined} id
 * @returns {bigint|null}
 */
export function toSubjectBigInt(id) {
  try { return BigInt(normalizeSubjectId(id)); } catch { return null; }
}

/** Canonical string form of a subject id (decimal, matching `Subject.id`). */
export function toSubjectId(id) {
  const b = toSubjectBigInt(id);
  return b === null ? null : b.toString();
}

/** True for the legacy/Hats namespace — an ADOPTED id on a migrated org. */
export function isLegacyAdoptedId(id) {
  try { return ['adopted', 'structural'].includes(classifySubjectId(id).namespace); } catch { return false; }
}

/**
 * True only for a Hats TOP HAT, not for one of its child roles.
 *
 * A top hat is the root of an organisation's Hats tree. Its id is the non-zero tree domain in
 * bits 224..255 with every lower bit clear. Migration adopts it into MembershipAuthority because
 * the executor wears it, but it remains structural organisation ownership — the legacy UI never
 * included it in `roleHatIds`, and access-v2 user-facing role surfaces must not include it either.
 *
 * This structural check is deliberately stronger than matching a name. Decentral Park's top hat
 * was created with the malformed Hats details string `ipfs://Decentral Park `, but an IPFS-looking
 * name is not proof that an arbitrary role is structural.
 */
export function isLegacyTopHatId(id) {
  try { return classifySubjectId(id).namespace === 'structural'; } catch { return false; }
}

/** User-facing subjects exclude structural Hats roots but include child hats and v2-native ids. */
export function isUserFacingSubjectId(id) {
  return toSubjectBigInt(id) !== null && !isLegacyTopHatId(id);
}

/** True for a v2-native id (below the Hats floor AND carrying an embedded authority address). */
export function isV2NativeId(id) {
  try { return classifySubjectId(id).namespace === 'native'; } catch { return false; }
}

/**
 * The authority address embedded in a v2-native id (bits 64..223), lowercased 0x-hex.
 * Returns null for legacy ids and for ids with no embedded address.
 */
export function embeddedAuthority(id) {
  try { return coreEmbeddedAuthority(id); } catch { return null; }
}

/** The local sequence number (low 64 bits) of a v2-native id. */
export function localSeq(id) {
  try { const sequence = localSequence(id); return sequence === null ? null : BigInt(sequence); } catch { return null; }
}

/**
 * Compose a v2-native subject id.
 * @param {string} authority - 0x address of the org's MembershipAuthority proxy
 * @param {bigint|number|string} seq - local sequence (1-based)
 * @returns {string} decimal id string
 */
export function composeSubjectId(authority, seq) {
  return coreComposeSubjectId(authority, seq);
}

/** Evidence-bearing allocation path. Host must supply actual chain/org/source coverage. */
export function predictSubjectIdsFromSnapshot(input) {
  return corePredictNextSubjectIds(input);
}
