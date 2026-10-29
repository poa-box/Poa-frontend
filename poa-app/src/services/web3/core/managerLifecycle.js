import { createSubmissionJournal, pendingSubmissionError } from '@/services/web3/core/submissionJournal';
import { unknownSubmissionError, reconcileUserOperationSubmission } from '@/services/web3/core/userOperationSubmission';
import { TransactionResult, TransactionState, clearRecoveredSubmission } from '@/services/web3/core/TransactionManager';
import { assertSubmissionFence } from '@poa-box/core/execute/recovery';
import { managerIntentKey, DELEGATED_SUBMISSION_LEASE, snapshotExecutionArguments } from '@/services/web3/core/managerSubmissionScope';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';

/** Install atomic browser coordination at the manager boundary, including non-service callers. */
export function installManagerLifecycle(manager, { scopeGuard = () => {}, submissionContext, submissionJournal } = {}) {
  manager.submissionJournal = submissionJournal || createSubmissionJournal({
    accountAddress: manager.accountAddress, chainId: manager.chainId,
    entryPoint: ENTRY_POINT_ADDRESS, context: submissionContext,
  });
  const notify = manager._notifyState?.bind(manager);
  if (notify) manager._notifyState = (callback, state, data) => notify(typeof callback === 'function' ? (...args) => {
    try { callback(...args); } catch { /* Observers cannot change a known transaction outcome. */ }
  } : callback, state, data);
  let ownsLease = false;
  let currentIntent;
  manager.assertCurrent = () => { scopeGuard(); if (ownsLease) manager.submissionJournal.assertLease(); };
  manager.getPendingSubmission = () => manager.submissionJournal.read();
  manager.recordSubmission = submission => {
    manager.submissionJournal.assertLease();
    if (!manager.getPendingSubmission()) manager.submissionJournal.begin(currentIntent);
    const saved = manager.submissionJournal.write(submission);
    manager._submissionOwnerRecord = saved.recovery;
    return saved;
  };
  manager.settleSubmission = submission => {
    manager.submissionJournal.assertLease();
    const previous = manager.getPendingSubmission();
    const refuse = () => {
      manager._uncertainSubmission = pendingSubmissionError(previous || submission);
      throw manager._uncertainSubmission;
    };
    const same = previous && previous.chainId === submission.chainId && (submission.kind === 'transaction'
      ? previous.kind === 'transaction' && previous.nonce === submission.nonce && previous.txHash?.toLowerCase() === submission.txHash?.toLowerCase()
      : previous.kind !== 'transaction' && previous.computedHash?.toLowerCase() === submission.computedHash?.toLowerCase()
        && previous.nonce === submission.nonce && previous.entryPoint?.toLowerCase() === submission.entryPoint?.toLowerCase()
        && previous.accountAddress === submission.sender?.toLowerCase());
    // The active exclusive owner may settle its own exact identity, never an older/newer attempt.
    if (!same || !previous.recovery || !manager._submissionOwnerRecord) refuse();
    try { assertSubmissionFence(previous.recovery, manager._submissionOwnerRecord); }
    catch { refuse(); }
    if (JSON.stringify(previous.recovery) !== JSON.stringify(manager._submissionOwnerRecord)
      || manager.submissionJournal.clear(previous) !== true) refuse();
    manager._uncertainSubmission = null;
    return true;
  };
  manager.reconcileSubmission = async (submission = manager.getPendingSubmission() || manager.lastSubmission) => {
    scopeGuard();
    if (!submission || submission.chainId !== manager.chainId
      || (submission.accountAddress && submission.accountAddress.toLowerCase() !== manager.accountAddress.toLowerCase())
      || (submission.kind !== 'transaction' && submission.entryPoint?.toLowerCase() !== ENTRY_POINT_ADDRESS.toLowerCase())) throw new Error('Check this transaction on the network where it was submitted.');
    const result = await reconcileUserOperationSubmission(submission, manager.bundlerClient, manager.publicClient);
    scopeGuard();
    if (result.outcome.status !== 'unknown') {
      await clearRecoveredSubmission(manager.submissionJournal, submission, scopeGuard);
      scopeGuard();
      manager._uncertainSubmission = null;
    }
    scopeGuard();
    return result;
  };
  if (manager.fallbackTxManager) {
    const direct = manager.fallbackTxManager;
    const facade = Object.create(direct);
    facade.execute = (...args) => {
      manager.submissionJournal.assertLease();
      direct.submissionJournal = manager.submissionJournal;
      return direct.execute(args[0], args[1], args[2], { ...args[3], [DELEGATED_SUBMISSION_LEASE]: manager.submissionJournal });
    };
    facade.executeBatch = (transactions, options) => {
      manager.submissionJournal.assertLease();
      direct.submissionJournal = manager.submissionJournal;
      return direct.executeBatch(transactions, { ...options, [DELEGATED_SUBMISSION_LEASE]: manager.submissionJournal });
    };
    manager.fallbackTxManager = facade;
  }
  for (const name of ['execute', 'executeBatch']) {
    const original = manager[name].bind(manager);
    manager[name] = async (...args) => {
      let release;
      const options = args[name === 'execute' ? 3 : 1] || {};
      try {
        args = snapshotExecutionArguments(name, args);
        scopeGuard();
        release = await manager.submissionJournal.acquire();
        ownsLease = true;
        scopeGuard();
        manager.submissionJournal.abandonUnsent();
        const pending = manager.submissionJournal.readPendingAccount();
        if (pending) {
          manager.lastSubmission = pending;
          manager._uncertainSubmission = pendingSubmissionError(pending);
          const error = unknownSubmissionError(manager._uncertainSubmission);
          manager._notifyState?.(options.onStateChange, TransactionState.ERROR, { error });
          return TransactionResult.failure(error);
        }
        currentIntent = managerIntentKey(name, args);
        manager._submissionOwnerRecord = manager.submissionJournal.begin(currentIntent).recovery;
        manager._uncertainSubmission = null;
        return await original(...args);
      } catch (error) {
        const parsed = { category: 'account_unavailable', userMessage: error.userMessage || 'Account actions are unavailable. Check the earlier transaction or try again.', originalError: error };
        manager._notifyState?.(options.onStateChange, TransactionState.ERROR, { error: parsed });
        return TransactionResult.failure(parsed);
      } finally {
        if (release) {
          // Pre-broadcast cancellation/build errors are safe to abandon while still exclusively owned.
          try { manager.submissionJournal.abandonUnsent(); } catch { /* Keep unreadable state blocked. */ }
          ownsLease = false;
          await release();
        }
      }
    };
  }
}
