import { normalizeInboxEmail } from '@/lib/zkemail/rawEmail';

export const INBOX_REQUEST_TIMEOUT_MS = 10_000;

/** A bounded convenience read. Missing/malformed mail never starts a proof. */
export async function fetchClaimEmail(url, claimer, { signal, timeoutMs = INBOX_REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  let timeout;
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  const abort = () => {
    controller.abort();
    rejectAbort(new Error('Claim inbox request cancelled or timed out.'));
  };
  signal?.addEventListener('abort', abort, { once: true });
  timeout = setTimeout(abort, timeoutMs);
  try {
    if (signal?.aborted) abort();
    const data = await Promise.race([aborted, (async () => {
      const response = await fetch(`${url}/claim-email?claimer=${encodeURIComponent(claimer)}`, { signal: controller.signal });
      return response.ok ? response.json() : null;
    })()]);
    if (data?.status !== 'ready' || typeof data.eml !== 'string' || !data.eml.trim()) return null;
    return normalizeInboxEmail(data.eml);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
