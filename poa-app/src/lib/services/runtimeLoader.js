/** Share module work across provider scopes; a failed import can be retried. */
export function createRuntimeLoader(importRuntime) {
  let pending;
  return () => {
    if (!pending) {
      pending = Promise.resolve().then(importRuntime).catch((error) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };
}
