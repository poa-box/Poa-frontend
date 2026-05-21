/**
 * White-label host → default org name mapping.
 *
 * Lifted out of POContext to break a circular import (POContext used to
 * own this map and `useOrgName` imported `getDefaultOrgForHost` from it;
 * once POContext started calling `useOrgName`, the cycle became real).
 */

// White-label hosts that auto-select an org when no ?org= / ?userDAO= is passed.
// Explicit query params still win, so support can always override.
const HOST_DEFAULT_ORG = {
  'dao.kublockchain.com': 'KUBI',
  'poa.earth': 'Test6',
  'www.poa.earth': 'Test6',
};

export function getDefaultOrgForHost() {
  if (typeof window === 'undefined') return '';
  return HOST_DEFAULT_ORG[window.location.hostname] || '';
}

// Inverse of HOST_DEFAULT_ORG for the explore page's Visit button: send users
// to an org's white-label domain instead of the default poa.box home route.
const ORG_WHITE_LABEL_URL = {
  KUBI: 'https://dao.kublockchain.com',
};

export function getVisitUrlForOrg(orgId) {
  if (orgId && ORG_WHITE_LABEL_URL[orgId]) return ORG_WHITE_LABEL_URL[orgId];
  return `/home?org=${encodeURIComponent(orgId)}`;
}
