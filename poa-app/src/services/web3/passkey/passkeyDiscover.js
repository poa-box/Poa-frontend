/**
 * passkeyDiscover.js
 * WebAuthn discoverable credential authentication for passkey sign-in.
 * Triggers the OS passkey picker and looks up the account from the subgraph.
 */

import { bufferToBase64URLString } from '@simplewebauthn/browser';
import { derivePasskeySalt } from '@poa-box/core/accounts/codecs';
import { readCredentialFacts } from '@poa-box/core/reads/protocol';
import { computeCredentialId } from '@/services/web3/passkey/passkeyUtils';
import { findPendingCredentialByCredentialId } from '@/services/web3/passkey/passkeyStorage';
import { getAllSubgraphUrls } from '@/config/networks';
import { getWebAuthnRpId } from '@/config/passkey';
import { authenticateWithRpFallback } from '@/services/web3/passkey/authenticate';

/**
 * Trigger WebAuthn discoverable authentication and look up the account from the subgraph.
 * This allows sign-in even when localStorage has no stored credentials.
 *
 * @returns {Object} Credential data: { credentialId, rawCredentialId, accountAddress, salt }
 */
export async function discoverPasskeyCredential() {
  // Generate a random challenge (not verified server-side)
  const challengeBytes = crypto.getRandomValues(new Uint8Array(32));
  const challenge = bufferToBase64URLString(challengeBytes);

  // A cancelled picker is final; only explicit RP mismatch permits compatibility fallback.
  const primaryRpId = getWebAuthnRpId();

  const opts = (rpId) => ({
    optionsJSON: {
      challenge,
      rpId,
      allowCredentials: [],
      userVerification: 'required',
      timeout: 120000,
    },
  });

  const assertion = await authenticateWithRpFallback(opts, primaryRpId);

  // Extract the raw credential ID
  const rawCredentialId = assertion.rawId;

  // Compute on-chain credentialId
  const credentialId = computeCredentialId(rawCredentialId);

  // Derive salt deterministically (same as during account creation)
  const salt = BigInt(derivePasskeySalt(credentialId)).toString();

  // Look up the account address across ALL chain subgraphs
  let account;
  let lookupError;
  try {
    account = await lookupAccountByCredentialId(credentialId);
  } catch (error) {
    lookupError = error;
  }
  if (account) {
    return { credentialId, rawCredentialId, ...account, salt };
  }

  // Fallback: check pending credentials for undeployed accounts (vouch-first flow)
  const pendingMatch = findPendingCredentialByCredentialId(credentialId);
  if (pendingMatch) {
    return {
      credentialId,
      rawCredentialId,
      accountAddress: pendingMatch.accountAddress,
      publicKeyX: pendingMatch.publicKeyX,
      publicKeyY: pendingMatch.publicKeyY,
      salt,
    };
  }

  if (lookupError) throw lookupError;
  throw new Error('No account found for this passkey. You may need to create an account first.');
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
