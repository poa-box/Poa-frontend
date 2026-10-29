/** Frontend configuration and E2E seam for the shared WebAuthn runtime. */
import { startRegistration } from '@simplewebauthn/browser';
import { createPasskeyCredential as createCredential } from '@poa-box/core/browser/passkeys';
import { WEBAUTHN_RP_NAME, getWebAuthnRpId } from '@/config/passkey';

export async function createPasskeyCredential(username) {
  if (process.env.NEXT_PUBLIC_E2E_MODE === 'true') {
    const { getVirtualPasskeyCredential } = await import('@/services/e2e/virtualPasskey');
    const cred = getVirtualPasskeyCredential();
    return {
      credentialId: cred.credentialId,
      publicKeyX: cred.publicKeyX,
      publicKeyY: cred.publicKeyY,
      rawCredentialId: cred.rawCredentialId,
      salt: cred.salt,
    };
  }

  return createCredential(username, {
    rpId: getWebAuthnRpId(),
    rpName: WEBAUTHN_RP_NAME,
    origin: window.location.origin,
    hostname: window.location.hostname,
    adapter: { startRegistration },
  });
}
