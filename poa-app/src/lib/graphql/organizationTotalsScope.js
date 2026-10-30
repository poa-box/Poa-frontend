/** Exact frontend cache/lifecycle identity; no protocol projection. */
export function organizationTotalsKey({ source, authority, token, hub, kinds = ['members', 'holders', 'education'], pageSize = 250, maxPages = 100 }) {
  return JSON.stringify([source.chainId, source.endpoint, source.orgId?.toLowerCase(), authority?.toLowerCase(),
    token?.toLowerCase(), hub?.toLowerCase(), source.snapshot, source.block?.number, source.block?.hash?.toLowerCase(),
    source.block?.timestamp, [...kinds].sort(), pageSize, maxPages]);
}
