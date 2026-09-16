export function walletIdentity(snapshot) {
  return `${snapshot?.account?.address?.toLowerCase() || ''}:${snapshot?.account?.connector?.uid || ''}`;
}
export function assertWalletIdentity(expected, snapshot) {
  if (expected !== walletIdentity(snapshot)) throw new Error('Your account changed. Please try again.');
}
export function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('The request was cancelled.', 'AbortError');
}
/** Wait for an actual ready island; failures/cancellation never replay an intent. */
export function createWalletRuntimeGate({ readCurrent, request, timeoutMs = 30000 }) {
  const waiters = new Set();
  let failure = null;
  return {
    publish(value) {
      if (!value) return;
      failure = null;
      for (const waiter of [...waiters]) waiter.resolve(value);
    },
    fail(error) {
      failure = error;
      for (const waiter of [...waiters]) waiter.reject(error);
    },
    reset() { failure = null; },
    wait({ signal } = {}) {
      try { throwIfAborted(signal); } catch (error) { return Promise.reject(error); }
      if (failure) return Promise.reject(failure);
      const ready = readCurrent();
      if (ready) return Promise.resolve(ready);
      return new Promise((resolve, reject) => {
        const finish = (callback, value) => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', cancel);
          waiters.delete(waiter);
          callback(value);
        };
        const cancel = () => finish(reject, new DOMException('The request was cancelled.', 'AbortError'));
        const timer = setTimeout(() => finish(reject, new Error('Account tools are still loading. Please try again.')), timeoutMs);
        const waiter = { resolve: (value) => finish(resolve, value), reject: (error) => finish(reject, error) };
        waiters.add(waiter);
        signal?.addEventListener('abort', cancel, { once: true });
        try { request(); } catch (error) { waiter.reject(error); }
      });
    },
  };
}
