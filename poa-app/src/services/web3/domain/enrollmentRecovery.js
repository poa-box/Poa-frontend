import { providers } from 'ethers';
import { readPendingEmailRecovery, migratePendingEmailCredential, pendingEmailRestartGuidance } from '@poa-box/core/email';
import { apolloProtocolQuery } from '@/lib/graphql/coreQuery';
import { getNetworkByChainId } from '@/config/networks';
import { listPendingSubmissions } from '@/services/web3/core/submissionJournal';
import { pendingEnrollmentKey, readEnrollmentMigration, saveEnrollmentMigration, saveEnrollmentRestart } from '@/services/web3/passkey/passkeyStorage';

const META = 'query EnrollmentRecoveryBlock { _meta { block { number hash } } }';
const blocked = () => new Error('The original account setup could not be verified. Sign in with an existing account to start a fresh email claim. Your saved setup will be kept.');

/** Host transport only; exact-call, credential and canonical-state validation live in core. */
export async function recoverLegacyEnrollment({ pending, source, publicClient, originalTransactionHash,
  guard, query = apolloProtocolQuery, provider, now = () => Math.floor(Date.now() / 1000) }) {
  guard();
  if (source.flow !== 'zkemail' || !source.subgraphUrl || !/^0x[0-9a-f]{64}$/i.test(originalTransactionHash || '')
    || !pending.credential.rawCredentialId) throw blocked();
  const chainId = source.chainId;
  if (await publicClient.getChainId() !== chainId) throw blocked();
  guard();
  const transport = provider || new providers.Web3Provider({ request: request => publicClient.request(request) }, chainId);
  const meta = await query(META, {}, { endpoint: source.subgraphUrl, chainId, indexed: true, snapshot: 'latest', method: 'enrollment-recovery-block' });
  guard();
  const block = meta?._meta?.block;
  if (!block?.hash || block.number == null) throw blocked();
  const selected = await transport.getBlock(Number(block.number));
  guard();
  if (!selected || selected.hash?.toLowerCase() !== block.hash.toLowerCase()
    || now() < selected.timestamp || now() - selected.timestamp > 60) throw blocked();
  const scope = { chainId, orgId: source.orgId, account: pending.credential.accountAddress,
    contract: source.targetAddress, contracts: { registry: source.registryAddress, factory: source.factoryAddress } };
  const at = now();
  const indexed = { ...scope, endpoint: source.subgraphUrl, indexed: true, method: 'pending-email-recovery',
    snapshot: 'pinned', block: { number: String(block.number), hash: block.hash }, observedAt: at };
  const rpcSource = { ...indexed, endpoint: getNetworkByChainId(chainId)?.rpcUrl, indexed: false, method: 'pending-email-provenance' };
  const raw = pending.credential.rawCredentialId;
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) throw blocked();
  const rawCredentialBytes = Uint8Array.from(atob(raw.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
  const proof = await readPendingEmailRecovery({ scope, legacy: pending.credential, rawCredentialBytes,
    originalTransactionHash, source: indexed, rpcSource, provider: transport, query, freshness: { now: now(), maxAgeSeconds: 30 } });
  guard();
  if (proof.status !== 'ready') throw blocked();
  const migrated = migratePendingEmailCredential({ scope, legacy: pending.credential, legacyRecordId: pending.key,
    proof: proof.data, freshness: { now: now(), maxAgeSeconds: 30 },
    hasUnresolvedSubmission: listPendingSubmissions(pending.credential.accountAddress).length > 0,
    existing: readEnrollmentMigration(proof.data.recoveryId) });
  guard();
  if (migrated.status !== 'ready') throw blocked();
  saveEnrollmentMigration(migrated.data.record, pending);
  return migrated.data;
}

export function restartEnrollmentWithExistingAccount({ auth, source, pending, guard }) {
  guard();
  const guidance = pendingEmailRestartGuidance();
  if (source.flow !== 'zkemail' || !pendingEnrollmentKey(source) || !source.orgId || !source.targetAddress || !source.subgraphUrl
    || auth.isAuthHydrated !== true || !auth.isAuthenticated || !auth.accountAddress
    || !['eoa', 'passkey'].includes(auth.authType)) throw new Error('Sign in with an existing account, then choose this option again.');
  if (listPendingSubmissions(pending.credential.accountAddress).length || listPendingSubmissions(auth.accountAddress).length) {
    throw new Error('Check the earlier transaction in account settings before starting a fresh email claim.');
  }
  guard();
  const auditId = saveEnrollmentRestart({ pending, accountAddress: auth.accountAddress, source });
  return { ...guidance, auditId };
}
