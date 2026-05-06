/**
 * E2E burner wallet — wagmi `mock` connector seeded with a private key from env.
 *
 * Only registered when E2E_ENABLED. Provides a synthetic EOA the test agent can
 * drive without any wallet popup. Wagmi's built-in `mock` connector handles
 * sign/send via a viem account; we just construct that account from
 * NEXT_PUBLIC_E2E_BURNER_PK (populated from ~/.poa/e2e.env via next.config.mjs).
 */
import { mock } from 'wagmi/connectors';
import { privateKeyToAccount } from 'viem/accounts';
import { E2E_BURNER_PK } from './e2eMode';

export function burnerConnector() {
  if (!E2E_BURNER_PK) {
    throw new Error('E2E burner key missing. Run `yarn e2e:setup`.');
  }
  const pk = E2E_BURNER_PK.startsWith('0x') ? E2E_BURNER_PK : `0x${E2E_BURNER_PK}`;
  const account = privateKeyToAccount(pk);
  return mock({
    accounts: [account.address],
    features: { defaultConnected: true, reconnect: true },
  });
}
