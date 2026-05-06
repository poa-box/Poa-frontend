/**
 * Seed the *pending* passkey storage so the agent enters the same vouch-first
 * onboarding flow as a real new user (`useVouchFirstOnboarding`). The page
 * detects `getPendingCredentialForOrg(orgName)` and routes through
 * `PasskeyOnboardingService.deployWithExistingCredential` — the production
 * path that uses `encodeOnboardingPaymasterData` to pay gas via the org's
 * paymaster budget for the target hat.
 *
 * We do NOT save to the active credentials store. That would put the agent on
 * the "existing passkey user joining a new org" branch, which is a different
 * flow that doesn't get paymaster sponsorship for unjoined accounts.
 */

import { createPublicClient, http, defineChain } from 'viem';
import {
  savePendingCredential,
  getPendingCredentialForOrg,
  savePasskeyCredential,
  hasStoredCredentials,
} from '../web3/passkey/passkeyStorage';
import { NETWORKS, DEFAULT_DEPLOY_NETWORK } from '../../config/networks';
import { getVirtualPasskeyCredential } from './virtualPasskey';
import { E2E_ORG_NAME } from './e2eMode';
import PasskeyAccountFactoryABI from '../../../abi/PasskeyAccountFactory.json';

const SUBGRAPH_HEADERS = { 'Content-Type': 'application/json' };
const FACTORY_CACHE_KEY = `poa-e2e-factory-${DEFAULT_DEPLOY_NETWORK}`;

async function fetchFactoryAddress() {
  // localStorage cache: factory addresses don't change post-deploy, so once
  // resolved a refresh shouldn't pay the subgraph round-trip again.
  const cached = typeof window !== 'undefined' ? localStorage.getItem(FACTORY_CACHE_KEY) : null;
  if (cached) return cached;

  const url = NETWORKS[DEFAULT_DEPLOY_NETWORK].subgraphUrl;
  const resp = await fetch(url, {
    method: 'POST',
    headers: SUBGRAPH_HEADERS,
    body: JSON.stringify({ query: '{ passkeyAccountFactories(first: 1) { id } }' }),
  });
  if (!resp.ok) throw new Error(`subgraph http ${resp.status}`);
  const json = await resp.json();
  const id = json?.data?.passkeyAccountFactories?.[0]?.id;
  if (!id) throw new Error('no factory in subgraph');
  if (typeof window !== 'undefined') localStorage.setItem(FACTORY_CACHE_KEY, id);
  return id;
}

let seedingPromise = null;

export async function ensureVirtualPasskeyPendingSeeded() {
  if (!E2E_ORG_NAME) return;
  // Once activated as a deployed account, don't keep advertising "pending —
  // not yet deployed" on /join. Tab refresh restores from active credentials.
  if (hasStoredCredentials()) return;
  if (getPendingCredentialForOrg(E2E_ORG_NAME)) return;

  if (seedingPromise) return seedingPromise;

  seedingPromise = (async () => {
    const cred = getVirtualPasskeyCredential();
    const hatId = process.env.NEXT_PUBLIC_E2E_HAT_ID || '';
    if (!hatId) throw new Error('NEXT_PUBLIC_E2E_HAT_ID not set');

    const factoryAddress = await fetchFactoryAddress();

    const deploy = NETWORKS[DEFAULT_DEPLOY_NETWORK];
    const chain = defineChain({
      id: deploy.chainId,
      name: deploy.name,
      nativeCurrency: deploy.nativeCurrency,
      rpcUrls: { default: { http: [deploy.rpcUrl] } },
    });
    const client = createPublicClient({ chain, transport: http(deploy.rpcUrl) });

    const accountAddress = await client.readContract({
      address: factoryAddress,
      abi: PasskeyAccountFactoryABI,
      functionName: 'getAddress',
      args: [cred.credentialId, cred.publicKeyX, cred.publicKeyY, cred.salt],
    });

    // Username is intentionally not seeded — `useVouchFirstOnboarding
    // .completeOnboarding(username)` takes the typed-in value as its
    // source of truth, so an empty string here would be silently submitted
    // if any future caller ever read pendingCredential.username directly.
    savePendingCredential({
      credentialId: cred.credentialId,
      rawCredentialId: cred.rawCredentialId,
      publicKeyX: cred.publicKeyX,
      publicKeyY: cred.publicKeyY,
      salt: cred.salt.toString(),
      accountAddress,
      selectedHatId: hatId,
      orgName: E2E_ORG_NAME,
    });

    return accountAddress;
  })().catch((err) => {
    seedingPromise = null;
    console.warn('[e2e] failed to seed virtual passkey pending:', err);
    throw err;
  });

  return seedingPromise;
}

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
