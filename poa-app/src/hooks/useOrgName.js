import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { getDefaultOrgForHost } from '@/config/hostDefaultOrg';

/**
 * Resolve the active org name for the current page.
 *
 * Order of precedence:
 *   1. ?org= query param (canonical, preferred)
 *   2. ?userDAO= query param (legacy, kept for back-compat with old links)
 *   3. Host default (white-label domains — see HOST_DEFAULT_ORG)
 *
 * SSR-safe: the initial render uses only `router.query`, which Next produces
 * identically on server and client. The `window.location`/`hostname` fallbacks
 * (needed for full-page loads where `router.isReady` lags) run inside an
 * effect, avoiding hydration mismatches in every consumer that builds a link
 * with this value.
 */
export function useOrgName() {
  const router = useRouter();
  const fromRouter = router.query.org || router.query.userDAO || '';
  const [fromBrowser, setFromBrowser] = useState('');

  useEffect(() => {
    if (fromRouter) return;
    let next = '';
    try {
      const params = new URLSearchParams(window.location.search);
      next = params.get('org') || params.get('userDAO') || '';
    } catch {}
    if (!next) next = getDefaultOrgForHost() || '';
    if (next) setFromBrowser(next);
  }, [fromRouter]);

  return fromRouter || fromBrowser || '';
}
