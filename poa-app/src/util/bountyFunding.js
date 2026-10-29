import { projectTreasuryBountyTotals } from '@poa-box/core/reads/treasury';
import { requireRawUint } from '@poa-box/core/amounts';

/** The old nested array cannot prove all live tasks. Canonical root-stream evidence is required. */
export function committedBountiesByToken(_projects, evidence) {
  if (!evidence?.snapshot || !evidence?.assets) return null;
  const totals = projectTreasuryBountyTotals({ ...evidence.snapshot, data: evidence.snapshot.data.filter(row => {
    try { return requireRawUint(row.bountyPayout) !== '0'; } catch { return true; }
  }).map(row => ({ ...row,
    bountyToken: typeof row.bountyToken === 'string' ? row.bountyToken.toLowerCase() : row.bountyToken })) }, evidence.assets);
  if (totals.state !== 'known') return null;
  return Object.fromEntries(totals.value.map(total => [total.asset.address.toLowerCase(), total.rawAmount]));
}

/** Display-only shortfall; unknown balance/commitment stays unknown. */
export function bountyShortfall(balance, committed) {
  try {
    const difference = BigInt(requireRawUint(committed)) - BigInt(requireRawUint(balance));
    return difference > 0n ? difference.toString() : '0';
  } catch { return null; }
}
