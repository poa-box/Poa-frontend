export const ORGANIZATION_PREFETCH_KEY = '__poaOrganizationPrefetchV1';

/**
 * Runs in the initial HTML, before React, Apollo or account code is available.
 * Keep this function self-contained: the server serializes its source. It only
 * downloads public responses; normal lookup still validates name/ID/precedence.
 */
export function startOrganizationPrefetch(config) {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('newOrg') === 'true' || window[config.key]) return;
    // Duplicate query keys become arrays in Next. Let the normal router handle
    // those instead of speculating about a different organization.
    if (['org', 'userDAO', 'orgId', 'chainId'].some((key) => params.getAll(key).length > 1)) return;
    const given = params.get('org') || params.get('userDAO') || config.hosts[window.location.hostname] || '';
    const name = config.aliases[given.trim().toLowerCase()] || given;
    if (!name) return;
    let sources = config.sources;
    const pinnedId = params.get('orgId');
    const pinnedChain = Number(params.get('chainId'));
    if (/^0x[0-9a-f]{64}$/.test(pinnedId || '') && sources.some((source) => source.chainId === pinnedChain)) {
      sources = sources.filter((source) => source.chainId === pinnedChain);
    }
    const body = JSON.stringify({ query: config.query, variables: { ...config.variables, name } });
    const entries = new Map();
    const startedAt = Date.now();
    window[config.key] = {
      take(url, requestedBody, signal) {
        const entry = entries.get(url);
        if (!entry || body !== requestedBody || Date.now() - startedAt >= 30000) return null;
        entries.delete(url); // One navigation owns the response, never a lasting data cache.
        const cancel = () => entry.controller.abort();
        signal?.addEventListener('abort', cancel, { once: true });
        if (signal?.aborted) cancel();
        return entry.promise.finally(() => signal?.removeEventListener('abort', cancel));
      },
    };
    for (const { url } of sources) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const promise = fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: controller.signal,
      }).then(async (response) => ({ ok: response.ok, status: response.status, json: await response.json() }))
        .finally(() => clearTimeout(timeout));
      entries.set(url, { controller, promise });
      // A blocked/failed speculative request is optional. A later consumer can
      // make its ordinary request; never leave an unhandled rejection behind.
      promise.catch(() => entries.delete(url));
    }
    setTimeout(() => {
      for (const entry of entries.values()) entry.controller.abort();
      entries.clear();
      delete window[config.key];
    }, 30000);
  } catch { /* Unsupported or restricted browsers retain the normal read path. */ }
}

export function takeOrganizationPrefetch(url, body, signal) {
  if (typeof window === 'undefined') return null;
  try { return window[ORGANIZATION_PREFETCH_KEY]?.take(url, body, signal) || null; }
  catch { return null; }
}

/** Escape HTML-sensitive text, including configurable endpoint/name values. */
export function organizationPrefetchScript(config) {
  const payload = JSON.stringify({ ...config, key: ORGANIZATION_PREFETCH_KEY })
    .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `(${startOrganizationPrefetch.toString()})(${payload})`;
}
