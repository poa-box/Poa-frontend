import { createSubmissionJournal, pendingSubmissionError } from '@/services/web3/core/submissionJournal';
import { unknownSubmissionError, reconcileUserOperationSubmission } from '@/services/web3/core/userOperationSubmission';
import { TransactionResult, TransactionState } from '@/services/web3/core/TransactionManager';
import { assertSubmissionFence, canAbandonSubmissionRecovery } from '@poa-box/core/execute/recovery';
import { managerIntentKey, DELEGATED_SUBMISSION_LEASE, snapshotExecutionArguments } from '@/services/web3/core/managerSubmissionScope';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';

const leases = new WeakMap();

/** One account lease and settlement policy for every transport and recovery surface.
 * Capabilities are in-process only; a saved record can never delegate a live lease. */
export function createSubmissionController({ journal, accountAddress, chainId, entryPoint = ENTRY_POINT_ADDRESS,
  scopeGuard = () => {}, clients = () => ({}) }) {
  let active, callbacks = {}, owner, intent;
  const assertCurrent = () => { scopeGuard(); if (active) journal.assertLease(); };
  const withLease = async (run, capability, { settlement = false } = {}) => {
    if (!settlement) scopeGuard();
    const delegated = capability && leases.get(capability)?.journal === journal;
    if (capability && !delegated) throw new Error('Stale signing session.');
    const release = delegated ? null : await journal.acquire();
    const lease = capability || Object.freeze({});
    if (!delegated) leases.set(lease, { journal });
    try { if (!settlement) scopeGuard(); journal.assertLease(); return await run(lease); }
    finally { if (release) { leases.delete(lease); await release(); } }
  };
  const capture = async record => {
    journal.assertLease();
    await callbacks.onRecoveryRecord?.(record);
    return record;
  };
  const startAttempt = recovery => {
    const state = leases.get(active);
    if (state && state.attemptId !== recovery.attemptId) {
      Object.assign(state, { attemptId: recovery.attemptId, delivery: null, settled: null });
    }
  };
  const deliver = result => {
    const state = leases.get(active);
    // Share delivery with delegated transports; a deliberate rebuild starts a new attempt.
    const delivery = () => Promise.resolve().then(() => callbacks.onOutcome?.(result));
    return state ? (state.delivery ||= delivery()) : delivery();
  };
  const settle = async (submission, result) => {
    journal.assertLease();
    const previous = journal.read();
    const same = previous && previous.chainId === submission.chainId && (submission.kind === 'transaction'
      ? previous.kind === 'transaction' && previous.nonce === submission.nonce && previous.txHash?.toLowerCase() === submission.txHash?.toLowerCase()
      : previous.kind !== 'transaction' && previous.computedHash?.toLowerCase() === submission.computedHash?.toLowerCase()
        && previous.nonce === submission.nonce && previous.entryPoint?.toLowerCase() === submission.entryPoint?.toLowerCase()
        && previous.accountAddress === submission.sender?.toLowerCase());
    if (!same || !previous.recovery || !owner) throw pendingSubmissionError(previous || submission);
    try { assertSubmissionFence(previous.recovery, owner); } catch { throw pendingSubmissionError(previous); }
    if (JSON.stringify(previous.recovery) !== JSON.stringify(owner)) throw pendingSubmissionError(previous);
    try { await capture(previous); await deliver(result); }
    catch { throw pendingSubmissionError(previous); }
    if (journal.clear(previous) !== true) throw pendingSubmissionError(previous);
    const state = leases.get(active);
    if (state) state.settled = result;
    return true;
  };
  return {
    assertCurrent, withLease,
    session: run => withLease(async capability => {
      journal.abandonUnsent();
      const pending = journal.readPendingAccount();
      if (pending) throw pendingSubmissionError(pending);
      return run(capability);
    }),
    get capability() { return active; },
    async record(submission) {
      journal.assertLease();
      if (!journal.read()) journal.begin(intent);
      const saved = journal.write(submission);
      owner = saved.recovery;
      startAttempt(owner);
      return capture(saved);
    },
    settle,
    async run(name, args, execute) {
      args = snapshotExecutionArguments(name, args);
      const options = args[name === 'execute' ? 3 : 1] || {};
      if (!journal) { scopeGuard(); return execute(...args); }
      return withLease(async capability => {
        active = capability; callbacks = options;
        const state = leases.get(capability);
        try {
          const delegated = options[DELEGATED_SUBMISSION_LEASE] === capability;
          if (!delegated) journal.abandonUnsent();
          const pending = delegated ? null : journal.readPendingAccount();
          if (pending) return TransactionResult.failure(unknownSubmissionError(pendingSubmissionError(pending)));
          intent = managerIntentKey(name, args);
          const existing = journal.read();
          owner = (existing || journal.begin(intent)).recovery;
          startAttempt(owner);
          if (!delegated || !existing) await options.onIntent?.(intent, capability);
          assertCurrent();
          const result = await execute(...args);
          if (result?.success === false && journal.read()?.recovery && canAbandonSubmissionRecovery(journal.read().recovery)) result.submissionState = 'not-submitted';
          // Also covers definite refusals before a transport identity exists.
          if (!state.delivery) await deliver(result);
          return result?.success === false && state.settled?.outcome?.status === 'succeeded'
            ? TransactionResult.success(state.settled.receipt) : result;
        } catch (error) {
          if (state.settled?.outcome?.status === 'succeeded') return TransactionResult.success(state.settled.receipt);
          const saved = journal.read();
          if (!state.delivery) await deliver({ success: false, error,
            ...(saved?.recovery && canAbandonSubmissionRecovery(saved.recovery) ? { submissionState: 'not-submitted' } : {}) });
          throw error;
        } finally {
          try { journal.abandonUnsent(); } catch { /* Unreadable state remains blocked. */ }
          active = null; callbacks = {}; owner = null;
        }
      }, options[DELEGATED_SUBMISSION_LEASE]);
    },
    async recover(submission, { detached = false, onRecoveryRecord, onOutcome, candidateTxHash } = {}) {
      scopeGuard();
      if (!submission || submission.chainId !== chainId
        || submission.accountAddress?.toLowerCase() !== accountAddress?.toLowerCase()
        || (submission.kind !== 'transaction' && submission.entryPoint?.toLowerCase() !== entryPoint.toLowerCase())) {
        throw new Error('Check this transaction on the network where it was submitted.');
      }
      if (candidateTxHash && !/^0x[0-9a-f]{64}$/i.test(candidateTxHash)) throw new Error('Invalid transaction reference');
      if (onRecoveryRecord) await withLease(() => onRecoveryRecord(submission));
      const unsent = submission.recovery && canAbandonSubmissionRecovery(submission.recovery);
      const { publicClient, bundlerClient } = unsent ? {} : await clients();
      scopeGuard();
      const result = unsent ? { submission, outcome: { status: 'aborted' } }
        : await reconcileUserOperationSubmission(submission, bundlerClient, publicClient, candidateTxHash ? { candidateTxHash } : {});
      scopeGuard();
      let settlement = 'retained';
      await withLease(async () => {
        // The role sink is durable before account recovery removes its only journal.
        await onOutcome?.(result);
        scopeGuard();
        if (result.outcome.status !== 'unknown') {
          if (!detached) {
            if (await journal.clear(submission) !== true) throw pendingSubmissionError(submission);
            settlement = 'cleared';
          } else if (!journal.read()) settlement = 'already-absent';
        }
      });
      scopeGuard();
      return { ...result, settlement };
    },
  };
}

/** Bind the controller once; transport classes contain only transport-specific work. */
export function installManagerLifecycle(manager, { scopeGuard = () => {}, submissionContext, submissionJournal,
  submissionStorage, submissionLocks, direct = false } = {}) {
  manager.submissionJournal = submissionJournal || (manager.accountAddress && manager.chainId ? createSubmissionJournal({
    accountAddress: manager.accountAddress, chainId: manager.chainId, entryPoint: ENTRY_POINT_ADDRESS,
    context: submissionContext, storage: submissionStorage, locks: submissionLocks,
  }) : null);
  manager._notifyState = (callback, state, data = {}) => {
    try { manager.assertCurrent(); } catch { return; }
    if (state === TransactionState.AWAITING_SIGNATURE) manager.submissionJournal?.signing();
    if (typeof callback !== 'function') return;
    try { Promise.resolve(callback(state, data)).catch(() => {}); } catch { /* Observers cannot alter a known outcome. */ }
  };
  const controller = manager.submissionController = createSubmissionController({ journal: manager.submissionJournal,
    accountAddress: manager.accountAddress, chainId: manager.chainId, scopeGuard, clients: () => manager });
  manager.assertCurrent = controller.assertCurrent;
  manager.getPendingSubmission = () => manager.submissionJournal?.read() || null;
  manager.recordSubmission = async submission => {
    const saved = await controller.record(submission);
    manager.lastSubmission = saved;
    return saved;
  };
  manager.settleSubmission = async (...args) => {
    try { const result = await controller.settle(...args); manager._uncertainSubmission = null; return result; }
    catch (error) { manager._uncertainSubmission = error; throw error; }
  };
  manager.reconcileSubmission = async (submission = manager.getPendingSubmission() || manager.lastSubmission, options) => {
    const result = await controller.recover(submission, options);
    if (result.outcome.status !== 'unknown') manager._uncertainSubmission = null;
    return result;
  };
  if (manager.fallbackTxManager) {
    const directManager = manager.fallbackTxManager;
    const facade = Object.create(directManager);
    // The direct fallback shares the exact same journal and live capability.
    if (directManager.submissionController) installManagerLifecycle(directManager, { scopeGuard, submissionJournal: manager.submissionJournal, direct: true });
    for (const name of ['execute', 'executeBatch']) facade[name] = (...args) => {
      const index = name === 'execute' ? 3 : 1;
      args[index] = { ...args[index], [DELEGATED_SUBMISSION_LEASE]: controller.capability };
      return directManager[name](...args);
    };
    manager.fallbackTxManager = facade;
  }
  for (const name of direct ? ['execute'] : ['execute', 'executeBatch']) {
    // Rebinding a direct fallback replaces the binding, never nests lock acquisition.
    manager._transportMethods ||= {};
    const original = manager._transportMethods[name] ||= manager[name].bind(manager);
    manager[name] = async (...args) => {
      try { return await controller.run(name, args, original); }
      catch (error) {
        const parsed = unknownSubmissionError(error) || { category: 'account_unavailable',
          userMessage: error.userMessage || 'Account actions are unavailable. Check the earlier transaction or try again.', originalError: error };
        manager._notifyState?.(args[name === 'execute' ? 3 : 1]?.onStateChange, TransactionState.ERROR, { error: parsed });
        return TransactionResult.failure(parsed);
      }
    };
  }
}
