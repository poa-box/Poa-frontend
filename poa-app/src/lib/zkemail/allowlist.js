/** Core email commitments and tree codecs; retain the frontend's asynchronous API. */
import {
  ALLOWLIST_SCHEMA, LEAF_TYPES, buildAllowlist as coreBuildAllowlist,
  domainHash as coreDomainHash, emailHash as coreEmailHash,
  treeFromDoc, assertRootMatches, proofForDomain as coreProofForDomain,
  proofForEmailHash, summarize,
} from '@poa-box/core/zkemail';
export { ALLOWLIST_SCHEMA, LEAF_TYPES, treeFromDoc, assertRootMatches, proofForEmailHash, summarize };

export async function domainHash(domain) { return coreDomainHash(domain); }
export async function emailHash(email) { return coreEmailHash(email); }
export async function proofForDomain(tree, domain) { return coreProofForDomain(tree, domain); }

export async function buildAllowlist({ orgId, entries }) {
  return coreBuildAllowlist({ orgId, entries });
}
