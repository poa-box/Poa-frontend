/** Restore a returning virtual passkey without pre-creating enrollment records.
 * Fresh identities stay anonymous until the normal onboarding service creates
 * a credential and saves its observed chain/registry/factory/target scope.
 */
import { savePasskeyCredential, hasStoredCredentials } from '@/services/web3/passkey/passkeyStorage';
import { NETWORKS, DEFAULT_DEPLOY_NETWORK } from '@/config/networks';
import { getVirtualPasskeyCredential } from '@/services/e2e/virtualPasskey';

const SUBGRAPH_HEADERS = { 'Content-Type': 'application/json' };

let activationPromise = null;

/**
 * Restore the virtual passkey to the *active* credentials store when its
 * smart account has already been deployed (a returning agent — same seed,
 * already onboarded). Resolves to the credential object on success, or null
 * if the account isn't on-chain yet (in which case the pending/onboarding
 * flow is the right path — leave activation alone).
 *
 * Memoized: subsequent calls share the in-flight promise. Result is cached
 * via savePasskeyCredential; AuthContext picks it up via hasStoredCredentials.
 */
export async function ensureVirtualPasskeyActivated() {
  if (typeof window === 'undefined') return null;
  if (hasStoredCredentials()) return null;
  if (activationPromise) return activationPromise;

  activationPromise = (async () => {
    const cred = getVirtualPasskeyCredential();
    const accountAddress = await lookupDeployedAccount(cred.credentialId);
    if (!accountAddress) return null;

    const credentialData = {
      credentialId: cred.credentialId,
      rawCredentialId: cred.rawCredentialId,
      publicKeyX: cred.publicKeyX,
      publicKeyY: cred.publicKeyY,
      salt: cred.salt.toString(),
      accountAddress,
    };
    savePasskeyCredential(credentialData);
    return credentialData;
  })().catch((err) => {
    activationPromise = null;
    console.warn('[e2e] failed to activate virtual passkey:', err);
    return null;
  });

  return activationPromise;
}

const PASSKEY_LOOKUP_QUERY = `
  query FindAccountByCredentialId($credentialId: Bytes!) {
    passkeyCredentials(where: { credentialId: $credentialId }, first: 1) {
      account { id }
    }
  }
`;

async function lookupDeployedAccount(credentialId) {
  const url = NETWORKS[DEFAULT_DEPLOY_NETWORK].subgraphUrl;
  const resp = await fetch(url, {
    method: 'POST',
    headers: SUBGRAPH_HEADERS,
    body: JSON.stringify({ query: PASSKEY_LOOKUP_QUERY, variables: { credentialId } }),
  });
  if (!resp.ok) return null;
  const json = await resp.json();
  return json?.data?.passkeyCredentials?.[0]?.account?.id || null;
}
