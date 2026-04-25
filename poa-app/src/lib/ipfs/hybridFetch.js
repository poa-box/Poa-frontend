import { getVerifiedFetch } from './heliaClient';
import { recordOutcome } from './ipfsMetrics';

const HELIA_TIMEOUT_MS = 2000;
const GATEWAY_URL = 'https://api.thegraph.com/ipfs/api/v0/cat';
const GATEWAY_MAX_RETRIES = 3;
const GATEWAY_BASE_DELAY = 1000;

async function withRetry(fn, maxRetries = GATEWAY_MAX_RETRIES, baseDelay = GATEWAY_BASE_DELAY) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

async function tryHelia(cid) {
  const { verifiedFetch, disabled } = await getVerifiedFetch();
  if (disabled || !verifiedFetch) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HELIA_TIMEOUT_MS);
  try {
    const res = await verifiedFetch(`ipfs://${cid}`, { signal: controller.signal });
    if (!res.ok) {
      recordOutcome('p2pMiss');
      return null;
    }
    const buf = await res.arrayBuffer();
    recordOutcome('p2pHit');
    return new Uint8Array(buf);
  } catch (err) {
    if (err?.name === 'AbortError' || controller.signal.aborted) {
      recordOutcome('p2pTimeout');
    } else {
      recordOutcome('p2pMiss');
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function gatewayFetch(cid) {
  return withRetry(async () => {
    const url = `${GATEWAY_URL}?arg=${encodeURIComponent(cid)}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Gateway fetch failed: ${res.status} ${res.statusText}`);
    }
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  });
}

export async function hybridFetchBytes(cid) {
  const p2pBytes = await tryHelia(cid);
  if (p2pBytes) return p2pBytes;

  try {
    const bytes = await gatewayFetch(cid);
    recordOutcome('gatewayFallback');
    return bytes;
  } catch (err) {
    recordOutcome('gatewayFailure');
    throw err;
  }
}
