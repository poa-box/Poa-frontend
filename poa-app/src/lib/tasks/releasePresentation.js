import { ReleaseReason } from '@/util/releaseGate';

/** Copy only. Authorization comes from the scope-qualified core task policy. */
export function releasePresentation(decision, task, address, releasesIndexed) {
  const isClaimer = !!address && task?.claimedBy?.toLowerCase() === address.toLowerCase();
  if (decision?.state === 'allowed') return { allowed: true, isClaimer,
    reason: isClaimer ? ReleaseReason.SELF_RELEASE : ReleaseReason.THIRD_PARTY_EXPIRED };
  const reason = !releasesIndexed ? ReleaseReason.INDEXER_TOO_OLD
    : task?.isIndexing || decision?.state === 'unknown' ? ReleaseReason.INDEXING
      : decision?.reasons.includes('CLAIM_NOT_EXPIRED') ? ReleaseReason.CLAIM_NOT_EXPIRED
        : decision?.reasons.includes('MISSING_PERMISSION') ? ReleaseReason.NEEDS_ASSIGN
          : task?.status === 'Submitted' ? ReleaseReason.SUBMITTED_MUST_REJECT_FIRST : ReleaseReason.NOT_CLAIMED;
  return { allowed: false, isClaimer, reason };
}
