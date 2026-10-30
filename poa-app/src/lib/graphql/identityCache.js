// Frontend-owned TTL, seeding and request generations; no protocol inference here.
export const IDENTITY_TTL_MS = 5 * 60 * 1000;
export function emptyIdentity(address, now = 0) {
  return { address, username: null, avatarCid: null, bio: null, github: null, twitter: null,
    website: null, sourceChain: null, sourceChainId: null, resolvedAt: now, isEmpty: true };
}
const normalize = (address) => address ? String(address).toLowerCase() : null;
const identityRecord = (result, now) => ({
  address: result.address, username: result.username || null, avatarCid: result.metadata?.avatar || null,
  bio: result.metadata?.bio || null, github: result.metadata?.github || null, twitter: result.metadata?.twitter || null,
  website: result.metadata?.website || null, sourceChain: result.sourceChain || null, sourceChainId: result.sourceChainId || null,
  resolvedAt: now, isPartial: result.isComplete === false,
});

export function createIdentityCache({ fetchOne, fetchMany, onChange = () => {}, now = Date.now }) {
  const records = new Map();
  const pending = new Map();
  const invalidated = new Set();
  const stale = (record) => !record || record.isUnavailable || now() - record.resolvedAt > IDENTITY_TTL_MS;
  const unavailable = (key) => ({ ...(records.get(key) || emptyIdentity(key)), isEmpty: false, isUnavailable: true });
  const apply = (key, token, record) => {
    if (pending.get(key)?.token !== token) return records.get(key) || null;
    records.set(key, record); invalidated.delete(key); onChange(); return record;
  };
  const finish = (key, token) => { if (pending.get(key)?.token === token) pending.delete(key); };
  const seed = (address, partial) => {
    const key = normalize(address);
    if (!key) return false;
    const existing = records.get(key);
    if (existing && !existing.isEmpty && !stale(existing)) return false;
    records.set(key, { ...emptyIdentity(key, now()), ...partial, address: key,
      avatarCid: partial.avatarCid || partial.avatar || null, resolvedAt: now(), isSeed: true, isEmpty: false });
    return true;
  };
  const api = {
    getCached: (address) => records.get(normalize(address)) || null,
    invalidate(address) { const key = normalize(address); records.delete(key); pending.delete(key); invalidated.add(key); onChange(); },
    seedIdentity(address, partial) {
      if (seed(address, partial)) onChange();
    },
    seedIdentities(entries) {
      let changed = false;
      for (const entry of entries || []) if (entry?.address) changed = seed(entry.address, entry) || changed;
      if (changed) onChange();
    },
    resolveIdentity(address) {
      const key = normalize(address);
      if (!key) return Promise.resolve(null);
      const cached = records.get(key);
      if (cached && !cached.isSeed && !stale(cached)) return Promise.resolve(cached);
      if (pending.has(key)) return pending.get(key).promise;
      const token = Symbol();
      const promise = Promise.resolve().then(() => fetchOne(key, { fresh: invalidated.has(key) || !!cached })).then((result) => {
        const record = result?.address ? identityRecord(result, now()) : result?.isComplete === true
          ? emptyIdentity(key, now()) : unavailable(key);
        return apply(key, token, record);
      }, () => apply(key, token, unavailable(key))).finally(() => finish(key, token));
      pending.set(key, { token, promise });
      return promise;
    },
    resolveIdentities(addresses) {
      const keys = [...new Set((addresses || []).map(normalize).filter(Boolean))].filter((key) => {
        const record = records.get(key);
        return (!record || record.isSeed || stale(record)) && !pending.has(key);
      });
      if (!keys.length) return Promise.resolve();
      const tokens = new Map(keys.map((key) => [key, Symbol()]));
      const shared = Promise.resolve().then(() => fetchMany(keys, { fresh: keys.some((key) => invalidated.has(key) || records.has(key)) })).then((map) => {
        for (const key of keys) {
          const result = map.get(key);
          const record = result ? identityRecord({ address: key, ...result }, now()) : map.coverage?.status === 'complete'
            ? emptyIdentity(key, now()) : unavailable(key);
          apply(key, tokens.get(key), record);
        }
      }, () => { for (const key of keys) apply(key, tokens.get(key), unavailable(key)); });
      for (const key of keys) {
        const token = tokens.get(key);
        const promise = shared.then(() => records.get(key) || null).finally(() => finish(key, token));
        pending.set(key, { token, promise });
      }
      return shared;
    },
  };
  return api;
}
