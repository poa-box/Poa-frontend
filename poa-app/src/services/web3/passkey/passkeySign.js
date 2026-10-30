/** Frontend passkey configuration and E2E seam; ceremony validation is shared. */
import { startAuthentication } from '@simplewebauthn/browser';
import { getWebAuthnAssertion as getAssertion } from '@poa-box/core/browser/passkeys';
import { pad, toHex } from 'viem';
import { registrationChallenge, packPasskeySignature } from '@poa-box/core/accounts/codecs';
import { computeCredentialId } from '@/services/web3/passkey/passkeyUtils';
import { getWebAuthnRpId } from '@/config/passkey';

async function getWebAuthnAssertion(challengeHash, rawCredentialIdBase64) {
  if (process.env.NEXT_PUBLIC_E2E_MODE === 'true') {
    const { signVirtualAssertion } = await import('@/services/e2e/virtualPasskey');
    return signVirtualAssertion(challengeHash);
  }
  return getAssertion(challengeHash, rawCredentialIdBase64, {
    rpId: getWebAuthnRpId(),
    origin: window.location.origin,
    hostname: window.location.hostname,
    adapter: { startAuthentication },
  });
}

export async function signUserOpWithPasskey(userOpHash, rawCredentialIdBase64) {
  const auth = await getWebAuthnAssertion(userOpHash, rawCredentialIdBase64);
  return packPasskeySignature(computeCredentialId(auth.rawId), {
    authenticatorData: toHex(auth.authenticatorData),
    clientDataJSON: toHex(auth.clientDataJSON),
    challengeIndex: auth.challengeIndex,
    typeIndex: auth.typeIndex,
    r: pad(toHex(auth.r), { size: 32 }),
    s: pad(toHex(auth.s), { size: 32 }),
  });
}

export function computeRegistrationChallenge({ accountAddress, username, nonce, deadline, chainId, registryAddress }) {
  return registrationChallenge({ user: accountAddress, username, nonce, deadline, chainId, registryAddress }, 'passkey');
}

export async function signRegistrationChallenge(challengeHash, rawCredentialIdBase64) {
  const auth = await getWebAuthnAssertion(challengeHash, rawCredentialIdBase64);
  return {
    authenticatorData: toHex(auth.authenticatorData),
    clientDataJSON: toHex(auth.clientDataJSON),
    challengeIndex: BigInt(auth.challengeIndex),
    typeIndex: BigInt(auth.typeIndex),
    r: pad(toHex(auth.r), { size: 32 }),
    s: pad(toHex(auth.s), { size: 32 }),
  };
}
