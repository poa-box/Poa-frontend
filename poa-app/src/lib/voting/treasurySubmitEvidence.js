import { assertPlanScope } from '@poa-box/core/data/facts';
import { buildTreasuryTransferBatch } from '@/lib/voting/treasuryBatches';

/** Transient review evidence is never draft data. Refresh, rebuild and compare actual calls. */
export async function refreshReviewedTreasuryTransfer({ reviewed, refetch, request, scope }) {
  if (!reviewed || typeof refetch !== 'function') throw new Error('Refresh treasury details before proposing this move.');
  try { assertPlanScope(reviewed.scope, scope); } catch {
    throw new Error('The organization changed. Review this move again.');
  }
  const previous = buildTreasuryTransferBatch({ ...request, evidence: reviewed });
  const response = await refetch();
  const fresh = response?.planningEvidence;
  if (!fresh) throw new Error('Current treasury details could not be verified. Please refresh and review this move again.');
  try { assertPlanScope(fresh.scope, scope); } catch {
    throw new Error('The organization changed. Review this move again.');
  }
  const current = buildTreasuryTransferBatch({ ...request, evidence: fresh });
  if (JSON.stringify(previous.batch) !== JSON.stringify(current.batch)) {
    throw new Error('Treasury details changed. Review the payment source and payout rounds again.');
  }
  return fresh;
}
