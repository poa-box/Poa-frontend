import { startAuthentication } from '@simplewebauthn/browser';
import { authenticateWithRpFallback as authenticate } from '@poa-box/core/browser/passkeys';

/** Preserve the browser's explicit RP rejection policy through the shared runtime. */
export function authenticateWithRpFallback(optionsForRp, primaryRpId) {
  return authenticate(optionsForRp, primaryRpId, {
    hostname: window.location.hostname,
    adapter: { startAuthentication },
  });
}
