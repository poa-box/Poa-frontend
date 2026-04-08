/**
 * waitForSubgraph
 *
 * Standalone utility (not a hook) that polls a subgraph's _meta.block.number
 * until it has indexed at or beyond a target block.
 *
 * Designed to be called once per transaction inside executeWithNotification,
 * NOT per-subscriber. This keeps query volume low:
 *   - 1 check after initial delay (~5s, covers most indexing)
 *   - 1 backup check 2s later if needed
 *   - Then gives up (optimistic UI covers the gap, pollInterval catches up)
 */

const META_QUERY = '{ _meta { block { number } } }';

// Initial delay before first _meta check. The subgraph needs:
//   block confirmation + event processing + store write
// Arbitrum: ~0.25s blocks but indexing takes 3-8s
// Gnosis: ~5s blocks, indexing takes 5-12s
// Testnets: variable
const INITIAL_DELAY_MS = 5000;

// Backup poll delay if first check misses
const BACKUP_DELAY_MS = 2000;

/**
 * Check if the subgraph has indexed past a target block.
 * @param {string} url - Subgraph endpoint
 * @returns {Promise<number|null>} Indexed block number, or null on error
 */
async function getIndexedBlock(url) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: META_QUERY }),
    });
    const json = await res.json();
    return json?.data?._meta?.block?.number ?? null;
  } catch {
    return null;
  }
}

/**
 * Wait for the subgraph to index past a target block number.
 * Makes at most 2 _meta queries: one after ~5s, one backup 2s later.
 *
 * @param {string} subgraphUrl - Subgraph endpoint to poll
 * @param {number|bigint} blockNumber - Block number from transaction receipt
 * @returns {Promise<void>} Resolves when subgraph has caught up or after max attempts
 */
export async function waitForSubgraphBlock(subgraphUrl, blockNumber) {
  if (!subgraphUrl || blockNumber == null) return;

  const target = Number(blockNumber);
  if (!Number.isFinite(target) || target <= 0) return;

  // First check: wait ~block time + indexing overhead
  await new Promise(r => setTimeout(r, INITIAL_DELAY_MS));

  const firstCheck = await getIndexedBlock(subgraphUrl);
  if (firstCheck != null && firstCheck >= target) return;

  // Backup check: 2s later
  await new Promise(r => setTimeout(r, BACKUP_DELAY_MS));

  // Don't even need the result — we'll emit the event regardless.
  // But checking lets us log if there's a persistent indexing delay.
  const secondCheck = await getIndexedBlock(subgraphUrl);
  if (secondCheck != null && secondCheck < target) {
    console.warn(
      `[waitForSubgraph] Subgraph still behind after ${INITIAL_DELAY_MS + BACKUP_DELAY_MS}ms.`,
      `Target: ${target}, indexed: ${secondCheck}`
    );
  }
}
