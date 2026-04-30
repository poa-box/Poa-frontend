/**
 * Resolve the user-facing label for an org's participation token.
 * Orgs default to "Shares". An org admin can opt into showing the
 * ParticipationToken's on-chain symbol via the `useTokenSymbol` flag
 * stored in OrgMetadata.
 */

export const DEFAULT_TOKEN_LABEL = 'Shares';

/**
 * @param {Object} args
 * @param {boolean} [args.useTokenSymbol] - org metadata flag
 * @param {string} [args.symbol] - participation token symbol
 * @returns {string} The label to display
 */
export function resolveTokenLabel({ useTokenSymbol, symbol } = {}) {
  if (useTokenSymbol === true && symbol && typeof symbol === 'string' && symbol.trim()) {
    return symbol.trim();
  }
  return DEFAULT_TOKEN_LABEL;
}
