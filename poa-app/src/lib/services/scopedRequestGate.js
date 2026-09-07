// Invalidates old requests immediately when a scope changes, including A→B→A,
// and rejects older refresh completions within the same scope.
export function createScopedRequestGate() {
  let scope;
  let generation = 0;
  let request = 0;
  return {
    setScope(next) {
      if (next !== scope) { scope = next; generation++; }
    },
    start(expectedScope) {
      if (scope !== expectedScope) return null;
      const capturedGeneration = generation;
      const capturedRequest = ++request;
      return () => generation === capturedGeneration && request === capturedRequest;
    },
  };
}
