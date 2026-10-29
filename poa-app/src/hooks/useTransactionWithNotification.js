import { useCallback, useMemo, useRef, useEffect } from 'react';
import { useNotification } from '@/context/NotificationContext';
import { useRefreshEmit } from '@/context/RefreshContext';
import { usePOContext } from '@/context/POContext';
import { useAuth } from '@/context/authState';
import { waitForSubgraphBlock } from '@/util/waitForSubgraph';
import { captureNotificationScope, transactionMemberMessage, notificationWriteSource } from '@/hooks/transactionNotificationLifecycle';

/**
 * Hook for transaction execution with integrated notifications
 * Wraps service calls with loading states and automatic notifications.
 *
 * After a successful transaction, waits for the subgraph to index
 * the new block before emitting the refresh event. This centralizes
 * the _meta polling (max 2 queries) so subscribers can refetch immediately
 * with fresh data.
 */
export function useTransactionWithNotification() {
  const { addNotification, updateNotification } = useNotification();
  const { emit } = useRefreshEmit();
  const poContext = usePOContext();
  const auth = useAuth();
  const subgraphUrl = poContext?.subgraphUrl;
  const snapshot = useMemo(() => ({ auth, po: poContext }), [auth, poContext]);
  const current = useRef(snapshot);
  const mounted = useRef(true);
  current.current = snapshot;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  /**
   * Execute a transaction with notification handling
   * @param {Function} transactionFn - Async function that returns a TransactionResult
   * @param {Object} options - Options for the transaction
   * @param {string} options.pendingMessage - Message to show while pending
   * @param {string} options.successMessage - Message to show on success
   * @param {string} [options.errorMessage] - Custom error message (uses parsed error if not provided)
   * @param {string} [options.refreshEvent] - Event to emit on success
   * @param {Object} [options.refreshData] - Data to include with refresh event
   * @param {Object|Function} [options.writeSource] - Explicit { endpoint, chainId, account? }, or getter
   *   for the source selected inside an account service. Supplied sources never fall back to the org.
   * @returns {Promise<TransactionResult>}
   */
  const executeWithNotification = useCallback(async (
    transactionFn,
    {
      pendingMessage,
      successMessage,
      errorMessage,
      refreshEvent,
      refreshData = {},
      writeSource,
    }
  ) => {
    let scope;
    try { scope = captureNotificationScope(snapshot, () => mounted.current ? current.current : null); }
    catch (error) { return { success: false, error }; }
    const pendingId = addNotification(pendingMessage, 'loading');
    // The existing notification view supports loading/success/error. Use its dismissible
    // error state for unavailable page refresh, while retaining the original action outcome.
    const earlierCompletion = () => updateNotification(pendingId, 'Your earlier action was confirmed. Return to its account or organization to see the update.', 'error');

    try {
      scope.guard();
      const result = await transactionFn();

      if (result.success) {
        if (!scope.isCurrent()) { earlierCompletion(); return result; }
        // Keep the raw manager result and optimistic return timing unchanged.
        const finish = async () => {
          let source;
          try {
            source = writeSource === undefined ? { endpoint: subgraphUrl } : notificationWriteSource(
              typeof writeSource === 'function' ? writeSource() : writeSource, scope.snapshot);
          } catch {
            updateNotification(pendingId, 'Your action was confirmed. Refresh this account to see the update.', 'error');
            return;
          }
          if (refreshEvent) {
            try { await waitForSubgraphBlock(source.endpoint, result.blockNumber); } catch { /* Best effort indexing. */ }
          }
          if (!scope.isCurrent()) { earlierCompletion(); return; }
          updateNotification(pendingId, successMessage, 'success');
          if (refreshEvent && scope.isCurrent()) emit(refreshEvent, {
            ...refreshData, transactionHash: result.txHash,
            ...(writeSource === undefined ? {} : { chainId: source.chainId, subgraphUrl: source.endpoint }),
          });
        };
        void finish();
      } else {
        // Prefer the PARSED contract reason over the caller's generic static
        // errorMessage. The parser now decodes the real revert (e.g. "This task
        // requires an application before claiming") on both the EOA and passkey
        // paths; showing "Failed to claim task" instead would throw that away.
        const message = transactionMemberMessage(result.error, errorMessage || 'Transaction failed');
        updateNotification(pendingId, message, 'error');
      }

      return result;
    } catch (error) {
      // Thrown (non-TransactionResult) path. Prefer a parsed userMessage if the
      // throw carried one; otherwise keep the caller's intentional errorMessage
      // ahead of a raw exception string (so internal errors don't leak to users).
      const message = transactionMemberMessage(error, errorMessage);
      updateNotification(pendingId, message, 'error');

      return {
        success: false,
        error,
      };
    }
  }, [addNotification, updateNotification, emit, subgraphUrl, snapshot]);

  /**
   * Create a transaction handler for common operations
   * Returns a wrapped function that handles notifications automatically
   */
  const createHandler = useCallback((
    serviceFn,
    {
      pendingMessage,
      successMessage,
      errorMessage,
      refreshEvent,
      writeSource,
    }
  ) => {
    return async (...args) => {
      return executeWithNotification(
        () => serviceFn(...args),
        {
          pendingMessage,
          successMessage,
          errorMessage,
          refreshEvent,
          refreshData: { args },
          writeSource,
        }
      );
    };
  }, [executeWithNotification]);

  return useMemo(() => ({
    executeWithNotification,
    createHandler,
  }), [executeWithNotification, createHandler]);
}
