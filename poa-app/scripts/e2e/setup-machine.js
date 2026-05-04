#!/usr/bin/env node
/**
 * One-time machine-level setup for E2E mode.
 *
 * Generates a stable burner EOA + virtual passkey seed, writes them to
 * ~/.poa/e2e.env (mode 0600), and prints:
 *   - The EOA address (for funding on Gnosis)
 *   - The virtual passkey smart-account address (counterfactual on Arbitrum)
 *   - Two pre-built vouch URLs the user can paste into a browser to vouch from
 *     their existing member account.
 *
 * Idempotent: re-running detects the existing env file and does NOT regenerate
 * keys. Pass `--rotate` to regenerate (destructive — invalidates membership).
 *
 * Usage:
 *   node poa-app/scripts/e2e/setup-machine.js [--rotate]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

let ethers;
try {
  ({ ethers } = require('ethers'));
} catch {
  console.error('[setup-machine] Missing dependency `ethers`. Run `yarn install` from poa-app/ first.');
  process.exit(1);
}

const HOME_DIR = path.join(os.homedir(), '.poa');
const ENV_FILE = path.join(HOME_DIR, 'e2e.env');

// Mirrors the production fallbacks in poa-app/src/config/networks.js. The API
// key is the same one shipped in the public app bundle.
const GNOSIS_RPC_URL = process.env.NEXT_PUBLIC_GNOSIS_RPC_URL || 'https://rpc.gnosischain.com';
const GNOSIS_SUBGRAPH_URL = process.env.NEXT_PUBLIC_GNOSIS_SUBGRAPH_URL
  || 'https://gateway.thegraph.com/api/204b1629ba85581bdc48cc6701e821ff/subgraphs/id/576YA6oF16nA2uG5Q9KFfBSvJm4ZNKzWZkwh8eWXaxJs';

function parseEnvFile(content) {
  const out = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function serializeEnvFile(obj) {
  return Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
}

function prompt(question, { defaultValue } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const q = defaultValue ? `${question} [${defaultValue}] ` : question;
    rl.question(q, (answer) => {
      rl.close();
      resolve((answer || '').trim() || defaultValue || '');
    });
  });
}

function base64url(bytes) {
  return Buffer.from(bytes).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Derive a deterministic virtual-passkey credential from the 32-byte seed.
 * Mirrors the on-chain shape produced by the browser (passkeyCreate.js +
 * passkeyUtils.js): credentialId = keccak256(rawCredentialIdBytes), salt =
 * keccak256(credentialId || "poa-salt-v1").
 *
 * The runtime browser code MUST derive identical values from the same seed.
 */
function deriveVirtualCredential(seedHex) {
  const seed = Buffer.from(seedHex.startsWith('0x') ? seedHex.slice(2) : seedHex, 'hex');

  const rawCredentialIdBytes = crypto.createHash('sha256')
    .update(Buffer.concat([seed, Buffer.from('poa-virtual-credential-id-v1', 'utf8')]))
    .digest();
  const rawCredentialId = base64url(rawCredentialIdBytes);

  const credentialId = ethers.utils.keccak256(rawCredentialIdBytes);

  const ecdh = crypto.createECDH('prime256v1');
  const privKeyMaterial = crypto.createHash('sha256')
    .update(Buffer.concat([seed, Buffer.from('poa-virtual-passkey-priv-v1', 'utf8')]))
    .digest();
  ecdh.setPrivateKey(privKeyMaterial);
  const pub = ecdh.getPublicKey();
  const x = '0x' + pub.slice(1, 33).toString('hex');
  const y = '0x' + pub.slice(33, 65).toString('hex');

  const salt = ethers.utils.keccak256(
    ethers.utils.solidityPack(['bytes32', 'string'], [credentialId, 'poa-salt-v1'])
  );

  return { rawCredentialId, credentialId, publicKeyX: x, publicKeyY: y, salt };
}

// The hardcoded API key in config/networks.js is domain-locked at the gateway.
// The same Origin the production app sends is required from a Node script too.
const SUBGRAPH_HEADERS = {
  'Content-Type': 'application/json',
  'Origin': 'https://www.poa.box',
  'Referer': 'https://www.poa.box/',
};

async function gqlPost(url, query) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: SUBGRAPH_HEADERS,
    body: JSON.stringify({ query }),
  });
  if (!resp.ok) throw new Error(`Subgraph query failed: HTTP ${resp.status} ${url}`);
  const json = await resp.json();
  if (json.errors) throw new Error(`Subgraph error: ${JSON.stringify(json.errors)}`);
  return json.data;
}

async function fetchOrgMemberHat(orgName) {
  const data = await gqlPost(
    GNOSIS_SUBGRAPH_URL,
    `{ organizations(where: { name: "${orgName.replace(/"/g, '\\"')}" }, first: 1) { id name roleHatIds } }`,
  );
  const org = data?.organizations?.[0];
  if (!org) throw new Error(`Org "${orgName}" not found on Gnosis subgraph`);
  const memberHat = org.roleHatIds?.[0];
  if (!memberHat) throw new Error(`Org "${orgName}" has no roleHatIds — cannot resolve member hat`);
  return { orgId: org.id, memberHatId: memberHat };
}

// The smart account address is computed on the *deploy chain* (Gnosis, where
// the org lives). The Arbitrum factory produces a different CREATE2 output
// because its beacon proxy differs — vouching that address would be useless.
async function fetchFactoryAddress() {
  const data = await gqlPost(GNOSIS_SUBGRAPH_URL, '{ passkeyAccountFactories(first: 1) { id } }');
  const id = data?.passkeyAccountFactories?.[0]?.id;
  if (!id) throw new Error(`Gnosis subgraph returned no PasskeyAccountFactory`);
  return ethers.utils.getAddress(id);
}

async function computeSmartAccountAddress(factoryAddress, cred) {
  const provider = new ethers.providers.JsonRpcProvider(GNOSIS_RPC_URL);
  const factory = new ethers.Contract(
    factoryAddress,
    ['function getAddress(bytes32 credentialId, bytes32 pubKeyX, bytes32 pubKeyY, uint256 salt) view returns (address)'],
    provider,
  );
  return factory.getAddress(cred.credentialId, cred.publicKeyX, cred.publicKeyY, cred.salt);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const rotate = args.has('--rotate');

  if (!fs.existsSync(HOME_DIR)) {
    fs.mkdirSync(HOME_DIR, { recursive: true, mode: 0o700 });
  }

  let env = {};
  const fileExists = fs.existsSync(ENV_FILE);

  if (fileExists && !rotate) {
    env = parseEnvFile(fs.readFileSync(ENV_FILE, 'utf8'));
    console.log(`[setup-machine] Found existing ${ENV_FILE} — keys preserved.`);
  } else {
    if (rotate && fileExists) {
      console.log('[setup-machine] --rotate: regenerating keys. Existing on-chain registrations and Test6 membership will be invalidated.');
      const confirm = await prompt('Type "rotate" to confirm: ');
      if (confirm !== 'rotate') {
        console.error('[setup-machine] Aborted.');
        process.exit(1);
      }
    }
    env.POA_E2E_BURNER_PK = '0x' + crypto.randomBytes(32).toString('hex');
    env.POA_E2E_PASSKEY_SEED = '0x' + crypto.randomBytes(32).toString('hex');
    env.POA_E2E_PIMLICO_API_KEY = env.POA_E2E_PIMLICO_API_KEY || '';
    console.log('[setup-machine] Generated new burner private key + passkey seed.');
  }

  const reconfigure = args.has('--reconfigure');

  if (!env.POA_E2E_PIMLICO_API_KEY || reconfigure) {
    const key = await prompt('Pimlico API key (Gnosis + Arbitrum mainnet) — leave empty to set later: ');
    if (key) env.POA_E2E_PIMLICO_API_KEY = key;
  }

  if (!env.POA_E2E_ORG_NAME || reconfigure) {
    env.POA_E2E_ORG_NAME = await prompt('Org name to vouch into', { defaultValue: env.POA_E2E_ORG_NAME || 'Test6' });
  }
  if (!env.POA_E2E_BASE_URL || reconfigure) {
    env.POA_E2E_BASE_URL = await prompt('App URL where you will vouch from your member account', { defaultValue: env.POA_E2E_BASE_URL || 'https://www.poa.box' });
  }

  const orgName = env.POA_E2E_ORG_NAME;
  const baseUrl = env.POA_E2E_BASE_URL;

  // Always re-resolve orgId/hatId from the subgraph — role-config changes in
  // the org would otherwise leave stale cached values in ~/.poa/e2e.env.
  console.log(`[setup-machine] Resolving member hat for "${orgName}" from Gnosis subgraph…`);
  const { orgId, memberHatId: hatId } = await fetchOrgMemberHat(orgName);
  env.POA_E2E_ORG_ID = orgId;
  env.POA_E2E_HAT_ID = hatId;

  fs.writeFileSync(ENV_FILE, serializeEnvFile(env), { mode: 0o600 });
  fs.chmodSync(ENV_FILE, 0o600);
  console.log(`[setup-machine] Wrote ${ENV_FILE} (mode 0600).`);

  const burnerAddress = new ethers.Wallet(env.POA_E2E_BURNER_PK).address;

  console.log('[setup-machine] Deriving virtual passkey credential…');
  const cred = deriveVirtualCredential(env.POA_E2E_PASSKEY_SEED);

  console.log('[setup-machine] Querying Arbitrum subgraph for PasskeyAccountFactory address…');
  const factoryAddress = await fetchFactoryAddress();

  console.log('[setup-machine] Computing counterfactual smart-account address from factory…');
  const smartAccountAddress = await computeSmartAccountAddress(factoryAddress, cred);

  const buildVouchUrl = (addr) =>
    `${baseUrl.replace(/\/$/, '')}/join?org=${encodeURIComponent(orgName)}&vouch=${addr}&hatId=${encodeURIComponent(hatId)}`;

  console.log('');
  console.log(`Burner EOA:           ${burnerAddress}`);
  console.log(`Passkey smart account: ${smartAccountAddress}`);
  console.log('');
  console.log('Vouch URLs (open in your member browser, click Vouch):');
  console.log(`  EOA:     ${buildVouchUrl(burnerAddress)}`);
  console.log(`  Passkey: ${buildVouchUrl(smartAccountAddress)}`);
  console.log('');
  console.log('Fund the burner with ~0.5 xDAI on Gnosis. See scripts/e2e/README.md.');
}

main().catch((err) => {
  console.error('[setup-machine] Failed:', err);
  process.exit(1);
});
