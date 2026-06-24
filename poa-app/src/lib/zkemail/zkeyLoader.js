/**
 * Chunked zkey loader for in-browser proving.
 *
 * The proving key (~400-650 MB) is split into ~8 MB parts (circuits/scripts/split-zkey.mjs), each pinned
 * individually on IPFS (The Graph's free endpoint caps uploads at ~10 MB, so per-part CIDs rather than a
 * directory). A per-circuit MANIFEST (JSON, its own CID) lists the part CIDs + the wasm CID + sha256.
 *
 * This fetches the manifest, then the parts in parallel (with retries) via a gateway, reassembles them
 * byte-perfectly into one Uint8Array, caches it in IndexedDB (localforage, keyed by sha256), and returns
 * it as snarkjs's `{ type: 'mem', data }` fastfile — standard snarkjs 0.7.6, no fork.
 *
 * `gateway` is a URL template with a `{cid}` placeholder, e.g.
 *   https://api.thegraph.com/ipfs/api/v0/cat?arg={cid}   (default; CORS-enabled, serves Graph-pinned CIDs)
 *   https://ipfs.io/ipfs/{cid}
 */
import localforage from 'localforage';

const CONCURRENCY = 6;
const RETRIES = 4;

const store = localforage.createInstance({ name: 'pop-zkey-cache', storeName: 'zkeys' });

function fileUrl(gateway, cid) {
  return gateway.includes('{cid}') ? gateway.replace('{cid}', cid) : `${gateway.replace(/\/$/, '')}/${cid}`;
}

async function fetchBytes(url) {
  let lastErr;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function fetchParts(gateway, cids, onProgress) {
  const parts = new Array(cids.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < cids.length) {
      const i = next++;
      parts[i] = await fetchBytes(fileUrl(gateway, cids[i]));
      done += 1;
      if (onProgress) onProgress({ phase: 'download', done, total: cids.length });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cids.length) }, worker));
  return parts;
}

/**
 * Load a chunked zkey from `gateway` given its `manifestCid`.
 * @returns {Promise<{ zkey: { type: 'mem', data: Uint8Array }, wasmUrl: string }>}
 */
export async function loadZkey(gateway, manifestCid, onProgress) {
  if (!gateway || !manifestCid) throw new Error('ZK artifacts gateway/manifest CID not configured.');

  const manifestRes = await fetch(fileUrl(gateway, manifestCid), { cache: 'force-cache' });
  if (!manifestRes.ok) throw new Error(`zkey manifest ${manifestCid} -> HTTP ${manifestRes.status}`);
  const manifest = await manifestRes.json();
  const wasmUrl = fileUrl(gateway, manifest.wasmCid);
  const cacheKey = `${manifest.name}:${manifest.sha256 || manifest.totalSize}`;

  try {
    const cached = await store.getItem(cacheKey);
    if (cached) {
      if (onProgress) onProgress({ phase: 'cache-hit' });
      return { zkey: { type: 'mem', data: new Uint8Array(cached) }, wasmUrl };
    }
  } catch (_) {
    /* cache unavailable — re-download */
  }

  const parts = await fetchParts(gateway, manifest.parts, onProgress);
  if (onProgress) onProgress({ phase: 'assemble' });

  const data = new Uint8Array(manifest.totalSize);
  let offset = 0;
  for (const part of parts) {
    data.set(part, offset);
    offset += part.length;
  }
  if (offset !== manifest.totalSize) {
    throw new Error(`chunked zkey size mismatch for ${manifest.name}: got ${offset}, expected ${manifest.totalSize}`);
  }

  // Integrity: verify the reassembled key against the manifest sha256. A flaky gateway (or a host that
  // silently corrupts binary — e.g. UTF-8-mangled uploads) can return same-size-but-wrong bytes that the
  // length check misses; feeding those to snarkjs fails with a cryptic witness error. Fail loudly instead.
  if (manifest.sha256 && globalThis.crypto && globalThis.crypto.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    if (hex !== manifest.sha256) {
      throw new Error(
        `chunked zkey sha256 mismatch for ${manifest.name}: got ${hex.slice(0, 12)}…, expected ${manifest.sha256.slice(0, 12)}…`,
      );
    }
  }

  try {
    await store.setItem(cacheKey, data.buffer);
  } catch (_) {
    /* IndexedDB quota — proceed uncached */
  }
  return { zkey: { type: 'mem', data }, wasmUrl };
}
