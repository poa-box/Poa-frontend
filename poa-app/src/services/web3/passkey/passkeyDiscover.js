/**
 * passkeyDiscover.js
 * WebAuthn discoverable credential authentication for passkey sign-in.
 * Triggers the OS passkey picker and looks up the account from the subgraph.
 */

import { startAuthentication } from '@simplewebauthn/browser';
import { discoverPasskeyCredential as discoverCredential } from '@poa-box/core/browser/passkeys';
import { readCredentialFacts } from '@poa-box/core/reads/protocol';
import { findPendingCredentialByCredentialId } from '@/services/web3/passkey/passkeyStorage';
import { getAllSubgraphUrls } from '@/config/networks';
import { getWebAuthnRpId } from '@/config/passkey';

/**
 * Trigger WebAuthn discoverable authentication and look up the account from the subgraph.
 * This allows sign-in even when localStorage has no stored credentials.
 *
 * @returns {Object} Credential data: { credentialId, rawCredentialId, accountAddress, salt }
 */
export function discoverPasskeyCredential() {
  return discoverCredential({
    rpId: getWebAuthnRpId(),
    origin: window.location.origin,
    hostname: window.location.hostname,
    adapter: { startAuthentication },
    lookupAccount: lookupAccountByCredentialId,
    findPendingCredentialByCredentialId,
  });
}

/**
 * Query ALL chain subgraphs to find the account address for a given credentialId.
 * Accounts may be deployed on any chain, so we query all mainnet subgraphs in parallel.
 */
async function lookupAccountByCredentialId(credentialId) {
  const sources = getAllSubgraphUrls();
  const results = await Promise.allSettled(sources.map(source => lookupCredentialSource(source, credentialId)));
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) return result.value;
  }
  // Unavailable is not evidence that a member has no account.
  if (results.some(result => result.status === 'rejected')) {
    throw new Error('We couldn’t check this passkey’s account. Check your connection and try again.');
  }
  return null;
}

async function lookupCredentialSource(source, credentialId) {
  const facts = await readCredentialFacts({
    source: { chainId: source.chainId, endpoint: source.url, indexed: true, snapshot: 'latest', method: 'graph' },
    credentialId, pageSize: 100,
    query: async (query, variables, scope) => {
      const response = await fetch(scope.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }) });
      if (!response.ok) throw new Error('Account lookup unavailable.');
      const body = await response.json();
      // Structured errors let core select only its exact missing-key schema fallback.
      return body.errors?.length ? { errors: body.errors } : body.data;
    },
  });
  if (facts.coverage.status !== 'complete') throw new Error('Account lookup incomplete.');
  const credential = facts.data.find(row => row.active);
  if (!credential) return null;
  const key = value => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value) && !/^0x0{64}$/.test(value);
  return {
    accountAddress: credential.account.id, credentialChainId: source.chainId,
    ...(key(credential.publicKeyX) && key(credential.publicKeyY)
      ? { publicKeyX: credential.publicKeyX, publicKeyY: credential.publicKeyY } : {}),
  };
}
