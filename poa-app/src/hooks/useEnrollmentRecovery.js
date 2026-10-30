import { useCallback, useEffect, useRef, useState } from 'react';
import { readPendingEnrollment, pendingEnrollmentKey, enrollmentTarget, removePendingCredential } from '@/services/web3/passkey/passkeyStorage';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';
import { enrollmentInitiator } from '@/hooks/useEnrollmentScope';

/** Public saved pointers + read-only original-chain reconciliation. No credential/sign/send path. */
export function useEnrollmentRecovery({ auth, source, guard, onConfirmed, onRestart }) {
  const busy = useRef(false);
  const [resultScope, setResultScope] = useState(() => guard);
  const [restartReady, setRestartReady] = useState(false);
  const [tick, setTick] = useState(0);
  const [isChecking, setChecking] = useState(false);
  const [recoveryError, setError] = useState(null);
  const [recoveryStatus, setStatus] = useState(null);
  useEffect(() => {
    const refresh = () => setTick(value => value + 1);
    if (typeof window === 'undefined' || !window.addEventListener) return undefined;
    window.addEventListener('poa:enrollment', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('poa:enrollment', refresh); window.removeEventListener('storage', refresh); };
  }, []);
  useEffect(() => { setResultScope(() => guard); busy.current = false; setRestartReady(false); setChecking(false); setError(null); setStatus(null); }, [guard]);
  // Reading at render time masks a previous source immediately; no RPC until Check status.
  let pendingEnrollment = null;
  let storageError = null;
  try { pendingEnrollment = readPendingEnrollment(source); } catch (error) { storageError = error; }
  const refreshPending = useCallback(() => setTick(value => value + 1), []);
  const checkPendingEnrollment = useCallback(async (originalHash) => {
    guard();
    if (busy.current) return;
    busy.current = true;
    setResultScope(() => guard);
    setChecking(true); setError(null); setStatus(null);
    try {
      const saved = readPendingEnrollment(source);
      if (!saved) return;
      if (source.flow === 'zkemail' && (saved.provenance !== 'matched'
        || saved.credential.sourceProvenance !== 'observed' || !saved.credential.initiator)) {
        const [{ createChainClients }, { recoverLegacyEnrollment }] = await Promise.all([
          import('@/services/web3/utils/chainClients'), import('@/services/web3/domain/enrollmentRecovery'),
        ]);
        guard();
        const clients = createChainClients(source.chainId);
        await recoverLegacyEnrollment({ pending: saved, source, publicClient: clients?.publicClient, guard,
          originalTransactionHash: typeof originalHash === 'string' && originalHash ? originalHash
            : saved.credential.confirmation?.transactionHash || saved.credential.transactionHash });
        guard(); setStatus('reauthenticate'); return;
      }
      if (!['matched', 'legacy-qualified'].includes(saved.provenance)) throw new Error('Return to the original account setup to check its status. Its saved source has not been verified here.');
      const credential = saved.credential;
      if (pendingEnrollmentKey(credential) !== pendingEnrollmentKey(source)
        || !credential.initiator || JSON.stringify(credential.initiator) !== JSON.stringify(enrollmentInitiator(auth))) {
        throw new Error('Check this setup from the account and session that started it.');
      }
      // A saved success marker is not chain evidence after reload. Re-read the exact original
      // operation even if confirmation preceded a crash between journal clearing and activation.
      const [{ createChainClients }, { enrollmentJournal, reconcileEnrollment }, { reconcileUserOperationSubmission }] = await Promise.all([
        import('@/services/web3/utils/chainClients'), import('@/services/web3/domain/enrollmentSubmission'),
        import('@/services/web3/core/userOperationSubmission'),
      ]);
      guard();
      const clients = createChainClients(credential.credentialChainId);
      if (!clients?.publicClient || !clients?.bundlerClient) throw new Error('The original network is unavailable. Please try again.');
      if (await clients.publicClient.getChainId() !== credential.credentialChainId) throw new Error('The original network is unavailable. Please try again.');
      guard();
      const service = { ...clients, chainId: credential.credentialChainId, registryAddress: credential.registryAddress,
        factoryAddress: credential.factoryAddress, orgId: credential.orgId, scopeGuard: guard };
      const submission = enrollmentJournal(service, credential.accountAddress).read();
      let result;
      if (submission) result = await reconcileEnrollment(service, submission);
      else if (credential.confirmation) {
        const saved = credential.confirmation;
        if (saved.accountAddress?.toLowerCase() !== credential.accountAddress?.toLowerCase()
          || saved.sender?.toLowerCase() !== credential.accountAddress?.toLowerCase() || saved.chainId !== credential.credentialChainId
          || !saved.computedHash || saved.nonce == null || saved.entryPoint?.toLowerCase() !== ENTRY_POINT_ADDRESS.toLowerCase()) {
          throw new Error('The earlier confirmation could not be verified. Check the original account setup.');
        }
        result = await reconcileUserOperationSubmission({ ...saved, txHash: saved.transactionHash }, clients.bundlerClient, clients.publicClient);
      } else { setStatus('not-submitted'); return; }
      guard();
      const confirmation = { ...result.outcome, accountAddress: credential.accountAddress, chainId: credential.credentialChainId,
        transactionHash: result.receipt?.transactionHash };
      guard();
      setStatus(confirmation.status);
      if (confirmation.status === 'succeeded') {
        if (confirmation.accountAddress?.toLowerCase() !== credential.accountAddress?.toLowerCase()
          || confirmation.chainId !== credential.credentialChainId || !/^0x[0-9a-f]{64}$/i.test(confirmation.transactionHash || '')) {
          throw new Error('This confirmation does not match the saved account setup.');
        }
        if ((source.orgId?.toLowerCase() ?? null) !== (credential.orgId?.toLowerCase() ?? null) || source.flow !== credential.flow
          || enrollmentTarget(source) !== credential.targetAddress?.toLowerCase()) {
          throw new Error('Your account setup is confirmed. Return to the organization and flow where you started to continue.');
        }
        const activationJournal = enrollmentJournal(service, credential.accountAddress);
        const release = await activationJournal.acquire();
        try {
          guard();
          const latest = readPendingEnrollment(source);
          if (!latest || latest.key !== saved.key || latest.credential.credentialId !== credential.credentialId
            || latest.credential.accountAddress?.toLowerCase() !== credential.accountAddress.toLowerCase()
            || pendingEnrollmentKey(latest.credential) !== pendingEnrollmentKey(credential)
            || latest.credential.targetAddress !== credential.targetAddress || latest.credential.orgId !== credential.orgId
            || latest.credential.username !== credential.username || latest.credential.flow !== credential.flow
            || JSON.stringify(latest.credential.initiator) !== JSON.stringify(credential.initiator)
            || activationJournal.readPendingAccount()) throw new Error('Your saved account setup changed. Check it again.');
          onConfirmed?.({ ...credential, transactionHash: confirmation.transactionHash });
          guard();
          // This captured session owns activation; migration never reaches this path.
          await auth.activatePasskey({ ...credential, credentialChainId: credential.credentialChainId });
          removePendingCredential(credential.accountAddress, source, latest);
        } finally { await release(); }
      }
    } catch (error) { try { guard(); setError(error); } catch { /* New scope owns recovery UI. */ } }
    finally { try { guard(); busy.current = false; setChecking(false); refreshPending(); } catch { /* No stale state. */ } }
  }, [auth, source, guard, onConfirmed, refreshPending]);
  const restartExistingAccount = useCallback(async () => {
    guard();
    if (busy.current) return;
    busy.current = true; setResultScope(() => guard); setChecking(true); setError(null);
    try {
      const { restartEnrollmentWithExistingAccount } = await import('@/services/web3/domain/enrollmentRecovery');
      guard();
      const pending = readPendingEnrollment(source);
      if (!pending) throw new Error('Your saved account setup changed. Check it again.');
      restartEnrollmentWithExistingAccount({ auth, source, pending, guard });
      guard(); onRestart?.(); setRestartReady(true); setStatus('restart-ready');
    } catch (error) { try { guard(); setError(error); } catch { /* New scope owns UI. */ } }
    finally { try { guard(); busy.current = false; setChecking(false); } catch { /* New scope owns UI. */ } }
  }, [auth, source, guard, onRestart]);
  // tick is intentionally consumed by the render read above.
  void tick;
  const currentResult = resultScope === guard;
  return { pendingEnrollment, checkPendingEnrollment, isChecking: currentResult && isChecking, recoveryError: storageError || (currentResult ? recoveryError : null),
    recoveryStatus: currentResult ? recoveryStatus : null, refreshPending, restartExistingAccount, restartReady: currentResult && restartReady, canRestart: source.flow === 'zkemail', hasPendingEnrollment: Boolean(pendingEnrollment || storageError) };
}
