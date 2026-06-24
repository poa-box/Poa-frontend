/**
 * Chunked zkey loader for in-browser proving.
 *
 * The proving key (~400-650 MB) is split into fixed-size parts (see circuits/scripts/split-zkey.mjs)
 * hosted under NEXT_PUBLIC_ZKEMAIL_ARTIFACTS_URL. This fetches the parts in parallel (resumable +
 * cacheable), reassembles them into one Uint8Array, caches it in IndexedDB (localforage) keyed by the
 * manifest sha256, and returns it as snarkjs's `{ type: 'mem', data }` fastfile — so proving uses
 * standard snarkjs with no fork and no fastfile chunk-format coupling.
 */
import localforage from 'localforage';

const CONCURRENCY = 6;
const RETRIES = 4;

const store = localforage.createInstance({ name: 'pop-zkey-cache', storeName: 'zkeys' });

async function fetchBytes(url, onRetry) {
  let lastErr;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      lastErr = e;
      if (onRetry) onRetry(attempt + 1, e);
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/** Fetch parts [0..numParts) with a bounded concurrency pool. */
async function fetchParts(baseUrl, name, numParts, onProgress) {
  const parts = new Array(numParts);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < numParts) {
      const i = next++;
      parts[i] = await fetchBytes(`${baseUrl}/${name}.zkey.part${i}`);
      done += 1;
      if (onProgress) onProgress({ phase: 'download', done, total: numParts });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, numParts) }, worker));
  return parts;
}

/**
 * Load a chunked zkey from `baseUrl` for circuit `name` (e.g. "PopRoleClaim", "PopRoleClaimV2").
 * @param {string} baseUrl  NEXT_PUBLIC_ZKEMAIL_ARTIFACTS_URL (no trailing slash)
 * @param {string} name     circuit name (the split-zkey manifest `name`)
 * @param {(p:{phase:string,done?:number,total?:number})=>void} [onProgress]
 * @returns {Promise<{ type: 'mem', data: Uint8Array }>}
 */
export async function loadZkey(baseUrl, name, onProgress) {
  if (!baseUrl) throw new Error('Artifacts URL not configured.');

  const manifestRes = await fetch(`${baseUrl}/${name}.zkey.manifest.json`, { cache: 'force-cache' });
  if (!manifestRes.ok) throw new Error(`zkey manifest for ${name} -> HTTP ${manifestRes.status}`);
  const manifest = await manifestRes.json();
  const cacheKey = `${name}:${manifest.sha256 || manifest.totalSize}`;

  // Cached reassembled zkey?
  try {
    const cached = await store.getItem(cacheKey);
    if (cached) {
      if (onProgress) onProgress({ phase: 'cache-hit' });
      return { type: 'mem', data: new Uint8Array(cached) };
    }
  } catch (_) {
    /* cache unavailable — fall through to download */
  }

  const parts = await fetchParts(baseUrl, name, manifest.numParts, onProgress);

  if (onProgress) onProgress({ phase: 'assemble' });
  const data = new Uint8Array(manifest.totalSize);
  let offset = 0;
  for (const part of parts) {
    data.set(part, offset);
    offset += part.length;
  }
  if (offset !== manifest.totalSize) {
    throw new Error(`chunked zkey size mismatch for ${name}: got ${offset}, expected ${manifest.totalSize}`);
  }

  try {
    await store.setItem(cacheKey, data.buffer);
  } catch (_) {
    /* IndexedDB quota exceeded — proceed without caching */
  }
  return { type: 'mem', data };
}
