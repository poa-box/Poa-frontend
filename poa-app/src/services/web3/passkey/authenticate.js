import { startAuthentication } from '@simplewebauthn/browser';

/** A dismissed/aborted ceremony is final. NotAllowedError also represents missing
 * credentials, so it cannot establish an RP mismatch or authorize another prompt. */
export async function authenticateWithRpFallback(optionsForRp, primaryRpId) {
  try {
    return await startAuthentication(optionsForRp(primaryRpId));
  } catch (error) {
    const fallback = window.location.hostname;
    const isSuffix = fallback === primaryRpId || fallback.endsWith(`.${primaryRpId}`);
    // Only the browser adapter's explicit RP rejection on an unrelated host
    // can use the hostname compatibility path. Generic SecurityError, transport
    // failures, aborts and user denials retain their original outcome.
    if (isSuffix || error?.code !== 'ERROR_INVALID_RP_ID' || error.cause?.name !== 'SecurityError') throw error;
    return startAuthentication(optionsForRp(fallback));
  }
}
