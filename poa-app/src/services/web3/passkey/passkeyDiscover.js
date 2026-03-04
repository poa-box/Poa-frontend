/**
 * passkeyDiscover.js
 * WebAuthn discoverable credential authentication for passkey sign-in.
 * Triggers the OS passkey picker and looks up the account from the subgraph.
 */

import { startAuthentication, bufferToBase64URLString } from '@simplewebauthn/browser';
import { keccak256, encodePacked } from 'viem';
import { computeCredentialId } from './passkeyUtils';
import { findPendingCredentialByCredentialId } from './passkeyStorage';

const SUBGRAPH_URL = process.env.NEXT_PUBLIC_SUBGRAPH_URL ||
  'https://api.studio.thegraph.com/query/73367/poa-2/version/latest';

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

  // Trigger WebAuthn discoverable authentication (no allowCredentials = OS shows passkey picker)
  const assertion = await startAuthentication({
    optionsJSON: {
      challenge,
      rpId: window.location.hostname,
      allowCredentials: [],
      userVerification: 'required',
      timeout: 120000,
    },
  });

  // Extract the raw credential ID
  const rawCredentialId = assertion.rawId;

  // Compute on-chain credentialId
  const credentialId = computeCredentialId(rawCredentialId);

  // Derive salt deterministically (same as during account creation)
  const salt = BigInt(
    keccak256(encodePacked(['bytes32', 'string'], [credentialId, 'poa-salt-v1']))
  ).toString();

  // Look up the account address from the subgraph
  const accountAddress = await lookupAccountByCredentialId(credentialId);
  if (accountAddress) {
    return { credentialId, rawCredentialId, accountAddress, salt };
  }

  // Fallback: check pending credentials for undeployed accounts (vouch-first flow)
  const pendingMatch = findPendingCredentialByCredentialId(credentialId);
  if (pendingMatch) {
    return {
      credentialId,
      rawCredentialId,
      accountAddress: pendingMatch.accountAddress,
      salt,
    };
  }

  throw new Error('No account found for this passkey. You may need to create an account first.');
}

/**
 * Query the subgraph to find the account address for a given credentialId.
 */
async function lookupAccountByCredentialId(credentialId) {
  const query = `
    query FindAccountByCredentialId($credentialId: Bytes!) {
      passkeyCredentials(where: { credentialId: $credentialId }, first: 1) {
        account {
          id
        }
      }
    }
  `;

  const response = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { credentialId } }),
  });

  const { data } = await response.json();
  const credential = data?.passkeyCredentials?.[0];
  return credential?.account?.id || null;
}
