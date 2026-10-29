// Host lifecycle and transport scheduling only. Core owns protocol proof validation.
export function assertRoleObservationActive(signal) {
  if (signal?.aborted) {
    const error = new Error('Role review was cancelled.');
    error.name = 'AbortError';
    throw error;
  }
}

export function roleObservationKey(value) {
  const ordered = item => Array.isArray(item) ? item.map(ordered)
    : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map(key => [key, ordered(item[key])])) : item;
  return JSON.stringify(ordered(value));
}

export function createRoleReadQueue(limit = 3) {
  let active = 0;
  const pending = [];
  const drain = () => {
    while (active < limit && pending.length) {
      const entry = pending.shift();
      entry.signal?.removeEventListener('abort', entry.cancel);
      if (entry.signal?.aborted) { entry.cancel(); continue; }
      active++;
      Promise.resolve().then(() => { assertRoleObservationActive(entry.signal); return entry.read(); })
        .then(value => { assertRoleObservationActive(entry.signal); return value; })
        .then(entry.resolve, entry.reject).finally(() => { active--; drain(); });
    }
  };
  return (read, signal) => new Promise((resolve, reject) => {
    const entry = { read, signal, resolve, reject, cancel: () => {
      const index = pending.indexOf(entry);
      if (index >= 0) pending.splice(index, 1);
      try { assertRoleObservationActive(signal); } catch (error) { reject(error); }
    } };
    if (signal?.aborted) { entry.cancel(); return; }
    signal?.addEventListener('abort', entry.cancel, { once: true });
    pending.push(entry);
    drain();
  });
}

// One bound for every role observer, including overlapping organizations/providers.
export const roleRead = createRoleReadQueue();
export const roleProofRead = createRoleReadQueue();

/** Coalesce work without giving any consumer ownership of another's cancellation.
 * A same-commit React resubscription can reclaim work before the last-user abort.
 * Failed/aborted work is never retained; successful caches hold original evidence.
 */
export function shareRoleObservation(cache, key, run, { signal, retain = () => false,
  now = () => Math.floor(Date.now() / 1000), maxAge = 30, maxEntries = 8 } = {}) {
  assertRoleObservationActive(signal);
  let entry = cache.get(key);
  if (entry?.settled && (now() < entry.at || now() - entry.at > maxAge)) {
    cache.delete(key); entry = null;
  }
  if (!entry) {
    entry = { controller: new AbortController(), users: 0, settled: false, at: now() };
    cache.set(key, entry);
    entry.promise = Promise.resolve().then(() => {
      assertRoleObservationActive(entry.controller.signal);
      return run(entry.controller.signal);
    }).then(value => {
      assertRoleObservationActive(entry.controller.signal);
      entry.settled = true;
      if (!retain(value) && cache.get(key) === entry) cache.delete(key);
      // Bound idle snapshots, never truncate the rows inside a snapshot.
      for (const [oldKey, old] of cache) {
        if (cache.size <= maxEntries) break;
        if (old !== entry && old.settled && !old.users) cache.delete(oldKey);
      }
      return value;
    }, error => { throw error; }).catch(error => {
      if (cache.get(key) === entry) cache.delete(key);
      entry.controller.abort();
      throw error;
    });
  }
  entry.users++;
  return new Promise((resolve, reject) => {
    let done = false;
    const release = () => {
      if (done) return false;
      done = true;
      signal?.removeEventListener('abort', cancel);
      entry.users--;
      queueMicrotask(() => {
        if (!entry.users && !entry.settled) {
          if (cache.get(key) === entry) cache.delete(key);
          entry.controller.abort();
        }
      });
      return true;
    };
    const cancel = () => {
      if (!release()) return;
      try { assertRoleObservationActive(signal); } catch (error) { reject(error); }
    };
    signal?.addEventListener('abort', cancel, { once: true });
    entry.promise.then(value => { if (release()) resolve(value); }, error => { if (release()) reject(error); });
  });
}
