/** Shared stores live while subscribed; a small idle cache covers interrupted renders. */
export function createObservationCache(maxIdle = 8) {
  const entries = new Map();
  const prune = () => {
    const idle = [...entries].filter(([, entry]) => entry.users === 0);
    for (const [key] of idle.slice(0, Math.max(0, idle.length - maxIdle))) entries.delete(key);
  };
  return {
    get size() { return entries.size; },
    get(key, create) {
      let entry = entries.get(key);
      if (!entry) {
        const store = create();
        entry = { users: 0, store: { ...store, subscribe(listener) {
          entry.users++;
          entries.set(key, entry);
          const unsubscribe = store.subscribe(listener);
          return () => {
            unsubscribe();
            entry.users--;
            // React may immediately resubscribe in the same commit.
            queueMicrotask(() => { if (!entry.users && entries.get(key) === entry) entries.delete(key); });
          };
        } } };
        entries.set(key, entry);
      }
      prune();
      return entry.store;
    },
  };
}
