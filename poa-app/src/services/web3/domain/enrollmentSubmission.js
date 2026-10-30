import { keccak256, toUtf8Bytes } from 'ethers/lib/utils';
import { createSubmissionJournal, pendingSubmissionError } from '@/services/web3/core/submissionJournal';
import { submitUserOperation, confirmUserOperation, reconcileUserOperationSubmission, unknownSubmissionError } from '@/services/web3/core/userOperationSubmission';
import { getUserOpHash } from '@/services/web3/passkey/userOpBuilder';
import { resolveAccountDeployment } from '@/services/web3/passkey/accountReadiness';
import { savePendingCredential, pendingEnrollmentKey, readPendingEnrollment, enrollmentTarget, requirePendingEnrollment } from '@/services/web3/passkey/passkeyStorage';
import { decodeRevertData } from '@/lib/errors/contractErrors';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';

export const enrollmentStorageKey = service => pendingEnrollmentKey(service);

export function enrollmentJournal(service, accountAddress) {
  return service.submissionJournal || createSubmissionJournal({ accountAddress, chainId: service.chainId,
    entryPoint: ENTRY_POINT_ADDRESS, context: { orgId: service.orgId, authType: 'passkey' } });
}

/** Public credential pointers live separately from the allowlisted submission identity. */
export function persistPending(service, credential, accountAddress, username) {
  savePendingCredential({ credentialId: credential.credentialId, rawCredentialId: credential.rawCredentialId,
    publicKeyX: credential.publicKeyX, publicKeyY: credential.publicKeyY, salt: credential.salt.toString(),
    accountAddress, username, orgName: credential.orgName || service.orgName || null, orgId: service.orgId || null,
    targetAddress: enrollmentTarget(service),
    initiator: credential.initiator ?? service.initiator ?? null, confirmation: credential.confirmation ?? null,
    flow: credential.flow || (service.zkEmailInvitesAddress ? 'zkemail' : 'onboarding'), credentialChainId: service.chainId,
    registryAddress: service.registryAddress, factoryAddress: service.factoryAddress });
}

/** One host lifecycle for both enrollment send paths. No ambiguous send is retried. */
export async function submitEnrollment(service, { credential, accountAddress, username, prepare, onConfirming }) {
  const guard = service.scopeGuard || (() => {});
  const journal = enrollmentJournal(service, accountAddress);
  guard();
  const release = await journal.acquire();
  let submitted;
  try {
    guard();
    const earlier = readPendingEnrollment(service);
    if (earlier && (!['matched', 'legacy-qualified'].includes(earlier.provenance)
      || earlier.credential.credentialId !== credential.credentialId)) {
      throw new Error('Finish or check your earlier account setup before creating another account.');
    }
    if (earlier) requirePendingEnrollment(service, { flow: service.zkEmailInvitesAddress ? 'zkemail' : 'onboarding', username });
    journal.abandonUnsent();
    const pending = journal.readPendingAccount();
    if (pending) throw pendingSubmissionError(pending);
    const deployment = await resolveAccountDeployment({ credential: { ...credential, accountAddress },
      factoryAddress: service.factoryAddress, publicClient: service.publicClient, chainId: service.chainId, guard });
    guard();
    persistPending(service, credential, accountAddress, username);
    try { journal.begin(keccak256(toUtf8Bytes(JSON.stringify([
      'enrollment', service.chainId, enrollmentTarget(service), service.orgId || null,
      accountAddress.toLowerCase(), credential.credentialId, username,
    ])))); } catch (cause) { throw new Error('Transaction status could not be saved before signing.', { cause }); }
    journal.signing();
    const userOp = await prepare(deployment.initCode, {
      prepareForSigning: operation => {
        guard(); journal.assertLease();
        if (operation.sender?.toLowerCase() !== accountAddress.toLowerCase()) throw new Error('The saved account does not match.');
        journal.prepare({ chainId: service.chainId, entryPoint: ENTRY_POINT_ADDRESS, sender: operation.sender,
          nonce: operation.nonce, computedHash: getUserOpHash(operation, ENTRY_POINT_ADDRESS, service.chainId) });
      },
    });
    guard();
    submitted = await submitUserOperation({ bundlerClient: service.bundlerClient, userOp,
      computedHash: getUserOpHash(userOp, ENTRY_POINT_ADDRESS, service.chainId),
      entryPoint: ENTRY_POINT_ADDRESS, chainId: service.chainId, beforeSend: () => { guard(); journal.assertLease(); },
      // Always save returned identity, even if navigation happened during send.
      onSubmission: submission => { service.lastSubmission = journal.write(submission); },
    });
    onConfirming?.();
    const confirmed = await confirmUserOperation(submitted, service.bundlerClient);
    persistEnrollmentOutcome(service, confirmed, accountAddress, submitted.submission);
    if (!await journal.clear(service.lastSubmission)) throw new Error('The saved action changed. Check its status again.');
    // Canonical confirmation owns the original result even if the page changed while waiting.
    if (confirmed.outcome.status === 'failed') {
      const decoded = confirmed.outcome.revertReason && decodeRevertData(confirmed.outcome.revertReason);
      const message = decoded?.message || 'Your account action could not be completed. Please try again.';
      throw Object.assign(new Error(message), { category: 'contract_revert', userMessage: message, outcome: confirmed.outcome });
    }
    return confirmed;
  } catch (error) {
    if (error.submission?.phase === 'pre-submit' && !await journal.clear(service.lastSubmission)) {
      error = Object.assign(new Error('Check the earlier transaction before trying again.'), { cause: error });
    }
    // A progress callback can become stale after dispatch. Keep its original public
    // submission recoverable rather than reporting a definite failure.
    const pending = journal.read();
    const unknown = unknownSubmissionError(error) || (pending && unknownSubmissionError(pendingSubmissionError(pending)));
    if (unknown) Object.assign(error, { category: unknown.category, userMessage: unknown.userMessage, submission: pending || unknown.submission });
    throw error;
  } finally {
    try { journal.abandonUnsent(); } catch { /* Unreadable state remains blocked. */ }
    await release();
  }
}

/** Recovery only reads the original network and never invokes credential/sign/send callbacks. */
export async function reconcileEnrollment(service, submission) {
  service.scopeGuard?.();
  if (submission?.chainId !== service.chainId || submission?.entryPoint?.toLowerCase() !== ENTRY_POINT_ADDRESS.toLowerCase()
    || !submission.accountAddress || submission.sender?.toLowerCase() !== submission.accountAddress.toLowerCase()) {
    throw new Error('Check this action using its original account and network.');
  }
  if (await service.publicClient.getChainId() !== service.chainId) throw new Error('This network is unavailable. Please try again.');
  service.scopeGuard?.();
  const journal = enrollmentJournal(service, submission.accountAddress);
  const saved = journal.read();
  if (saved?.computedHash?.toLowerCase() !== submission.computedHash?.toLowerCase()) throw new Error('The saved action does not match.');
  const result = await reconcileUserOperationSubmission(saved, service.bundlerClient, service.publicClient);
  service.scopeGuard?.();
  if (result.outcome.status !== 'unknown') {
    const release = await journal.acquire();
    try {
      service.scopeGuard?.();
      if (JSON.stringify(journal.read()) !== JSON.stringify(saved)) throw new Error('The saved action changed. Check its status again.');
      persistEnrollmentOutcome(service, result, submission.accountAddress, saved);
      service.scopeGuard?.();
      if (!await journal.clear(saved)) throw new Error('The saved action changed. Check its status again.');
    } finally { await release(); }
  }
  return result;
}

/** Save public confirmation before clearing recovery identity, including when the original UI left. */
function persistEnrollmentOutcome(service, result, accountAddress, submission) {
  const sender = result.outcome.sender || (result.outcome.code === 'OUTER_REVERTED' ? accountAddress : null);
  const pending = readPendingEnrollment(service);
  if (!pending || !['matched', 'legacy-qualified'].includes(pending.provenance)
    || sender?.toLowerCase() !== pending.credential.accountAddress?.toLowerCase()) {
    throw new Error('The confirmed action does not match the saved account setup.');
  }
  savePendingCredential({ ...pending.credential, confirmation: {
    status: result.outcome.status, accountAddress: sender,
    chainId: service.chainId, transactionHash: result.receipt.transactionHash,
    computedHash: submission.computedHash, entryPoint: submission.entryPoint, sender: submission.sender, nonce: submission.nonce,
  } });
}
