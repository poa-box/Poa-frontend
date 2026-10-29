import { requireRawUint } from '@poa-box/core/amounts';

/** Preserve exact indexed units separately from rounded, member-facing balances. */
export function indexedParticipationBalance(raw, { chainId, address, endpoint, orgId }) {
  let value = null;
  try { if (raw != null) value = requireRawUint(raw); } catch { /* Unknown is not zero. */ }
  return { participationTokenBalanceWei: value,
    participationTokenBalanceAsset: { chainId, address, endpoint, orgId } };
}
