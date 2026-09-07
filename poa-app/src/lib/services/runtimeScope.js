/** Identity boundaries for asynchronously published account services. */
export function serviceScope({ orgId, orgChainId, subgraphUrl, accountAddress, authType, isAuthenticated }) {
  return JSON.stringify([
    orgId || null,
    orgChainId || null,
    subgraphUrl || null,
    accountAddress?.toLowerCase() || null,
    authType || null,
    Boolean(isAuthenticated),
  ]);
}

export function createScopeGuard(scope, readCurrentScope) {
  return () => {
    if (readCurrentScope() !== scope) {
      const error = new Error('Your account or organization changed. Please try again.');
      error.userMessage = error.message;
      throw error;
    }
  };
}

/**
 * Reject a new call through a previously captured service after navigation or
 * account switching. Never cancel an operation that has already entered it.
 */
export function guardService(service, guard) {
  if (!service) return service;
  const methods = new Map();
  return new Proxy(service, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      if (!methods.has(property)) {
        methods.set(property, (...args) => {
          guard();
          return Reflect.apply(value, target, args);
        });
      }
      return methods.get(property);
    },
  });
}
