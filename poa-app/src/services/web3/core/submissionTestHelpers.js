/** Offline Web Locks model: availability/ownership is atomic, with no lease timers. */
export function fakeBrowserLocks() {
  const held = new Map();
  return {
    held,
    async request(name, options, callback) {
      if (options.mode !== 'exclusive' || !options.ifAvailable) throw new Error('Unexpected lock policy');
      if (held.has(name)) return callback(null);
      const token = {};
      held.set(name, token);
      try { return await callback({ name, mode: 'exclusive' }); }
      finally { if (held.get(name) === token) held.delete(name); }
    },
  };
}
export function recoveryTestStorage() {
  const rows = new Map();
  return { rows, getItem: key => rows.get(key) || null, setItem: (key, value) => rows.set(key, value),
    removeItem: key => rows.delete(key), get length() { return rows.size; }, key: index => [...rows.keys()][index] };
}
export function deferredRecoveryTest() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
