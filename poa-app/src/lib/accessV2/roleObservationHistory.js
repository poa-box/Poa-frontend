/** Bounded host cache for source-pinned transport values. Core alone discovers
 * history and validates proof. Canonical block reads are never cached. */
import { roleObservationKey } from '@/lib/accessV2/roleObservationWork';

export function createRoleTransportCache(cache, { scope, endpoint, rpcEndpoint,
  now = () => Math.floor(Date.now() / 1000), maxEntries = 512 } = {}) {
  const pending = new Map(), touched = new Set();
  const identity = [scope, endpoint, rpcEndpoint];
  return {
    async read(request, read, pin) {
      // Hash-qualified calls/pages and exact transaction lookups may be reused.
      // Their original values are retained; core rechecks canonicality independently.
      if (!pin?.hash && pin !== 'exact-transaction') return read();
      const key = roleObservationKey([identity, pin, request]);
      touched.add(key);
      const retained = cache.get(key), at = now();
      if (retained && at >= retained.at && at - retained.at <= 30) return retained.value;
      if (retained) cache.delete(key);
      if (!pending.has(key)) pending.set(key, Promise.resolve().then(read));
      return pending.get(key);
    },
    async commit() {
      for (const [key, promise] of pending) {
        const value = await promise;
        if (value != null) cache.set(key, { value, at: now() });
      }
      while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
    },
    discard() { for (const key of touched) cache.delete(key); },
  };
}
