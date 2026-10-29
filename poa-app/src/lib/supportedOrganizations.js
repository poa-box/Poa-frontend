/** Wave G support is determined by indexed cutover, never an org name or event age. */
export const ORGANIZATION_SUPPORT_FIELDS = `membershipAuthority { id isRouterBound cutoverAt }`;

import { isAuthorityReady } from '@poa-box/core/reads/authority';

export function isSupportedOrganization(organization) {
  return isAuthorityReady(organization);
}

/** Keep each retained row intact, including its complete pre-cutover activity totals. */
export function supportedMemberships(memberships) {
  return (memberships || []).filter((row) => isSupportedOrganization(row?.organization));
}
