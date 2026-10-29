import { assertSourceRef, requireCompleteSnapshot } from '@poa-box/core/data/facts';
import { requireRawUint } from '@poa-box/core/amounts';
import { FETCH_CURRENT_MEMBER_TOTAL_STATE } from '@poa-box/core/graph/documents/indexed-completeness';
import { apolloProtocolQuery } from '@/lib/graphql/coreQuery';
import { pinIndexedSource } from '@/lib/graphql/indexedSnapshot';
import { organizationTotalsKey } from '@/lib/graphql/organizationTotalsScope';
export { organizationTotalsKey } from '@/lib/graphql/organizationTotalsScope';

const caches = new WeakMap();
const TTL = 30000;
const unavailable = () => ({ status: 'unavailable', receivedKeys: [], missingIds: [], failedIds: [], issues: [{ code: 'TOTAL_SOURCE_UNAVAILABLE' }] });
const address = value => typeof value === 'string' && /^0x[\da-f]{40}$/i.test(value) && !/^0x0{40}$/i.test(value);

// UI counts stay exact, with numeric singular/plural behavior for ordinary counts.
export function displayIndexedCount(raw) {
  const value = requireRawUint(raw);
  return BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value;
}

/** Shared endpoint-scoped reads. Core owns all folds, reconciliation and paging.
 * A finite latest-scope cache deduplicates mounted consumers; pinned keys include
 * the exact block. Explicit refresh starts a new generation, including during an older read. */
export function readOrganizationTotals(options) {
  const { query = apolloProtocolQuery, force = false, source, authority, kinds = ['members', 'holders', 'education'] } = options;
  // Validate before cache lookup; an account-scoped or unsupported request must
  // not inherit a previously cached organization result.
  try {
    assertSourceRef(source);
    if (!source.indexed || !['latest', 'pinned'].includes(source.snapshot) || source.account !== undefined
      || !/^0x[\da-f]{64}$/i.test(source.orgId) || !address(authority)
      || !kinds.length || kinds.some(kind => !['members', 'holders', 'education'].includes(kind))) throw new Error('Organization binding unavailable.');
  } catch (error) { return Promise.reject(error); }
  let cache = caches.get(query);
  if (!cache) { cache = new Map(); caches.set(query, cache); }
  const key = organizationTotalsKey(options), existing = cache.get(key);
  if (!force && existing && (existing.pending || existing.until > Date.now())) return existing.promise;
  const entry = { pending: true, until: 0 };
  entry.promise = load(options, query).then(result => {
    entry.pending = false; entry.until = Date.now() + TTL;
    return result;
  }, error => { if (cache.get(key) === entry) cache.delete(key); throw error; });
  cache.set(key, entry);
  if (cache.size > 100) {
    for (const [old, value] of cache) { if (!value.pending && old !== key) cache.delete(old); if (cache.size <= 100) break; }
  }
  return entry.promise;
}

async function load({ source, authority, token, hub, kinds = ['members', 'holders', 'education'], pageSize = 250, maxPages = 100 }, query) {
  if (source.account !== undefined || !source.orgId || !address(authority)) throw new Error('Organization binding unavailable.');
  const pinned = await pinIndexedSource({ source: { ...source, contract: authority }, query,
    document: FETCH_CURRENT_MEMBER_TOTAL_STATE, variables: { orgId: source.orgId.toLowerCase() } });
  const snapshots = {}, coverage = {}, totals = { members: null, holders: null, completions: null, learners: null };
  await Promise.all(kinds.map(async kind => {
    const contract = { members: authority, holders: token, education: hub }[kind];
    if (!address(contract)) { coverage[kind] = unavailable(); return; }
    const expected = { ...pinned, contract };
    try {
      const reader = kind === 'members' ? (await import('@poa-box/core/reads/member-totals')).readCurrentMemberTotals
        : kind === 'holders' ? (await import('@poa-box/core/reads/token')).readTokenHolderTotals
          : (await import('@poa-box/core/reads/education')).readEducationCompletionTotals;
      const snapshot = await reader({ source: expected, query, pageSize, maxPages });
      snapshots[kind] = snapshot; coverage[kind] = snapshot.coverage;
      const data = requireCompleteSnapshot(snapshot, { scope: expected, indexed: true, snapshot: 'pinned', block: pinned.block });
      const fields = kind === 'education' ? [['completions', data.completions], ['learners', data.learners]] : [[kind, data.total]];
      for (const [name, fact] of fields) if (fact?.state === 'known') totals[name] = displayIndexedCount(fact.value);
    } catch { if (!coverage[kind] || coverage[kind].status === 'complete') coverage[kind] = unavailable(); }
  }));
  return { source: pinned, snapshots, coverage, totals };
}
