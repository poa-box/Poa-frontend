import { requireRawUint } from '@poa-box/core/amounts';
import { assertSourceRef } from '@poa-box/core/data/facts';

/** Select response-proven indexed metadata; requested block numbers are not proof. */
export async function pinIndexedSource({ source, query, document, variables }) {
  assertSourceRef(source);
  if (!source.indexed || !['latest', 'pinned'].includes(source.snapshot)) throw new Error('Indexed source required.');
  if (source.snapshot === 'pinned') return source;
  const data = await query(document, variables, source);
  const meta = data?._meta, block = meta?.block;
  if (meta?.hasIndexingErrors !== false || typeof meta.deployment !== 'string' || !meta.deployment
    || !/^0x[\da-f]{64}$/i.test(block?.hash)) throw new Error('Indexed snapshot unavailable.');
  const pinned = { ...source, snapshot: 'pinned', block: { number: requireRawUint(block.number), hash: block.hash,
    ...(block.timestamp != null ? { timestamp: requireRawUint(block.timestamp) } : {}),
  }, observedAt: Math.floor(Date.now() / 1000) };
  assertSourceRef(pinned);
  return pinned;
}
