import { readSubjectCreationProvenance, recoverSubjectCreationHistory } from '@poa-box/core/governance';
import { planningReadQueue } from '@/lib/accessV2/planningReadQueue';

const caches = new WeakMap();
const MAX_PROPOSALS = 12;

/** Exact indexed IDs only. Unproven rows remain unknown and block allocation in core. */
export async function recoverPlanningSubjectHistory({ history, scope, provider, rpcSource, query, now }) {
  let cache = caches.get(provider);
  if (!cache) { cache = new Map(); caches.set(provider, cache); }
  const read = planningReadQueue(3);
  const candidates = history.data.filter(row => row.wasExecuted !== true && row.status !== 'Executed');
  const proofs = await Promise.all(candidates.slice(0, MAX_PROPOSALS).map(row => read(async () => {
    // The hash-pinned snapshot fixes the indexed transaction identity. The cached
    // proof retains its exact transaction/inclusion hashes; JSON never becomes proof.
    const key = JSON.stringify([scope, history.source, rpcSource, row.id]);
    const previous = cache.get(key);
    if (previous && now() - previous.at <= 30 && now() >= previous.at) return previous.proof;
    const prefix = `${scope.contract.toLowerCase()}-`;
    if (!row.id.toLowerCase().startsWith(prefix)) return null;
    const result = await readSubjectCreationProvenance({ scope, source: history.source, rpcSource,
      query, provider, proposalId: row.id.slice(prefix.length), freshness: { now: now(), maxAgeSeconds: 30 } });
    if (result.status !== 'ready') return null;
    if (cache.size >= 128) cache.delete(cache.keys().next().value);
    cache.set(key, { proof: result.data, at: now() });
    return result.data;
  })));
  return recoverSubjectCreationHistory(history, proofs.filter(Boolean));
}
