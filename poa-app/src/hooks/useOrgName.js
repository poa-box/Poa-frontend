import { useRouter } from 'next/router';
import { getDefaultOrgForHost } from '@/config/hostDefaultOrg';

/**
 * Resolve the active org name for the current page.
 *
 * Order of precedence:
 *   1. ?org= query param (canonical, preferred)
 *   2. ?userDAO= query param (legacy, kept for back-compat with old links)
 *   3. Host default (white-label domains — see HOST_DEFAULT_ORG in POContext)
 *
 * Returns '' when none apply, matching the previous inline read.
 *
 * Falls back to parsing window.location.search directly when router.query
 * is empty. Some browser environments don't fire `router.isReady` reliably
 * on full page loads (notably with `output: 'export'` + trailing-slash
 * redirects), so this fallback prevents the page from getting stuck in a
 * pre-router-ready state.
 */
export function useOrgName() {
  const router = useRouter();
  let fromQuery = router.query.org || router.query.userDAO;
  if (!fromQuery && typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      fromQuery = params.get('org') || params.get('userDAO') || '';
    } catch {}
  }
  return fromQuery || getDefaultOrgForHost() || '';
}
