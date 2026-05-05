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
import { savePendingCredential, getPendingCredentialForOrg } from '../web3/passkey/passkeyStorage';
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
