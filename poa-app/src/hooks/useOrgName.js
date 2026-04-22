import { useRouter } from 'next/router';
import { getDefaultOrgForHost } from '@/context/POContext';

/**
 * Resolve the active org name for the current page.
 *
 * Order of precedence:
 *   1. ?org= query param (canonical, preferred)
 *   2. ?userDAO= query param (legacy, kept for back-compat with old links)
 *   3. Host default (white-label domains — see HOST_DEFAULT_ORG in POContext)
 *
 * Returns '' when none apply, matching the previous inline read.
 */
export function useOrgName() {
  const router = useRouter();
  return router.query.org || router.query.userDAO || getDefaultOrgForHost() || '';
}
