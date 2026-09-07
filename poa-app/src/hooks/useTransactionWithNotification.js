import { useCallback, useMemo } from 'react';
import { useNotification } from '@/context/NotificationContext';
import { useRefreshEmit } from '@/context/RefreshContext';
import { usePOContext } from '@/context/POContext';
import { waitForSubgraphBlock } from '@/util/waitForSubgraph';

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
  const subgraphUrl = poContext?.subgraphUrl;

  /**
   * Execute a transaction with notification handling
   * @param {Function} transactionFn - Async function that returns a TransactionResult
   * @param {Object} options - Options for the transaction
   * @param {string} options.pendingMessage - Message to show while pending
   * @param {string} options.successMessage - Message to show on success
   * @param {string} [options.errorMessage] - Custom error message (uses parsed error if not provided)
   * @param {string} [options.refreshEvent] - Event to emit on success
   * @param {Object} [options.refreshData] - Data to include with refresh event
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
    }
  ) => {
    // Show pending notification with loading status (blue spinner)
    const pendingId = addNotification(pendingMessage, 'loading');

    try {
      const result = await transactionFn();

      if (result.success) {
        // Update pending notification to success
        updateNotification(pendingId, successMessage, 'success');

        // Wait for subgraph to index the tx block, then emit refresh event.
        // Fire-and-forget: don't block the caller (optimistic UI is already showing).
        // Max 2 _meta queries (~5s initial + 2s backup), then emit regardless.
        if (refreshEvent) {
          const emitRefresh = async () => {
            await waitForSubgraphBlock(subgraphUrl, result.blockNumber);
            emit(refreshEvent, {
              ...refreshData,
              transactionHash: result.txHash,
            });
          };
          emitRefresh();
        }
      } else {
        // Prefer the PARSED contract reason over the caller's generic static
        // errorMessage. The parser now decodes the real revert (e.g. "This task
        // requires an application before claiming") on both the EOA and passkey
        // paths; showing "Failed to claim task" instead would throw that away.
        const message = result.error?.userMessage || errorMessage || 'Transaction failed';
        updateNotification(pendingId, message, 'error');
      }

      return result;
    } catch (error) {
      // Thrown (non-TransactionResult) path. Prefer a parsed userMessage if the
      // throw carried one; otherwise keep the caller's intentional errorMessage
      // ahead of a raw exception string (so internal errors don't leak to users).
      const message = error?.userMessage || errorMessage || error?.message || 'An unexpected error occurred';
      updateNotification(pendingId, message, 'error');

      return {
        success: false,
        error,
      };
    }
  }, [addNotification, updateNotification, emit, subgraphUrl]);

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
        }
      );
    };
  }, [executeWithNotification]);

  return useMemo(() => ({
    executeWithNotification,
    createHandler,
  }), [executeWithNotification, createHandler]);
}
