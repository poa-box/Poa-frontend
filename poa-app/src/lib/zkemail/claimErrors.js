import { canAbandonSubmissionRecovery } from '@poa-box/core/execute/recovery';

/** Retry is blocked only when dispatch could have occurred, never for a known pre-send refusal. */
export function claimSubmissionUnconfirmed(error) {
  if (error?.category === 'submission_unknown' || error?.nativeSubmission) return true;
  const submission = error?.submission;
  return Boolean(submission && submission.phase !== 'pre-submit'
    && !(submission.recovery && canAbandonSubmissionRecovery(submission.recovery)));
}
