# E2E test infrastructure

Lets an AI agent (or any headless flow) drive the dApp end-to-end without a
real wallet, biometric prompt, or per-workspace env files.

## One-time machine setup

```
yarn e2e:setup
```

Generates a stable burner EOA + virtual passkey seed at `~/.poa/e2e.env`
(mode 0600). Re-running is idempotent. Pass `--rotate` to regenerate keys
(destructive — invalidates org membership and on-chain registrations) or
`--reconfigure` to re-prompt for org / Pimlico key / base URL.

The script prints:

1. **Burner EOA address** — fund with ~0.5 xDAI on Gnosis. Covers gas for
   the EOA path; UserOps from the passkey path are paymaster-sponsored, so
   the smart account does not need direct funding.
2. **Vouch URL for the EOA** — open in your member browser, click Vouch.
3. **Vouch URL for the passkey smart account** — same.

Vouch requirements come from the role’s current configuration. Only members of
the configured voucher role or group can vouch; an admin label alone is insufficient.

## Running the agent

```
yarn dev:e2e             # auto-connects burner EOA
yarn dev:e2e-passkey     # skips EOA auto-connect; activates virtual passkey
```

**EOA mode** auto-connects the burner via `E2EAutoConnect`; agent is
immediately signed in.

**Passkey mode** has two phases:
1. *Fresh identity.* The app leaves an undeployed virtual passkey anonymous. Drive
   `/join/?org=Test6`, choose account creation, and enter a unique username. The
   normal onboarding service creates the virtual credential and persists a scoped
   pending enrollment. Nothing writes a legacy pending hint before this flow.
   Organization creation/join may require vouches for the predicted address;
   only members of the role's configured voucher subject can provide them.
2. *Returning identity.* `ensureVirtualPasskeyActivated()` finds an indexed account
   by the current credential ID and restores it into AuthContext. UserOperations
   use the same service and signing path as normal passkey users. A fresh identity
   must be tested in an isolated browser storage context so an earlier stored
   credential cannot restore the old account.

To use fresh test identities without rotating the machine-level configuration,
provide nonempty `NEXT_PUBLIC_E2E_BURNER_PK` and/or
`NEXT_PUBLIC_E2E_PASSKEY_SEED` values to the single dev-server process. The E2E
configuration only fills missing variables from `~/.poa/e2e.env`; it does not
replace process overrides. Keep those test secrets out of logs and committed
files. A new EOA needs native funds on the organization chain for direct wallet
registration/join calls; sponsored passkey creation uses the configured org or
solidarity budget.

## Managed email acceptance

Use the same public inbox pair as `.github/workflows/deploy-ipfs.yml` before
starting the dev server or building the app:

```sh
NEXT_PUBLIC_ZKEMAIL_INBOX=claim@poa.box
NEXT_PUBLIC_ZKEMAIL_INBOX_URL=https://poa-zkemail-claim-inbox.caffe-jump0d.workers.dev
```

Send the approved verification email from the invited address to that managed
inbox and let the page pick up the received message automatically. Do not use a
same-account self-send for this acceptance check. Retries can reuse the stored
received message without sending another email.

If either setting is absent, the app deliberately shows the expanded manual
`.eml` fallback. That tests manual upload, not managed-inbox delivery. With the
pair configured, manual upload remains an optional collapsed fallback.

## Production safety

```
yarn build && yarn e2e:check
```

The leakage check auto-discovers every named export in `src/services/e2e/`
and asserts none of them appear in `out/`. CI should run this on every PR.

## Files

- `setup-machine.js` — Generates keys, queries Gnosis subgraph for the org's
  member hat, calls `PasskeyAccountFactory.getAddress` on Gnosis to compute
  the smart-account address, prints both vouch URLs.
- `check-prod-leakage.js` — Bundle scanner. Auto-discovers E2E exports.
- `~/.poa/e2e.env` (not in repo) — Single source of truth for the agent's
  identity. Shared across all workspaces. Mode 0600.

## Caveats

- **Mainnet, real funds.** The burner EOA + virtual passkey become real
  on-chain identities. Cap Pimlico spend in the dashboard. Keep
  `~/.poa/e2e.env` at 0600.
- **Test artifacts accumulate** in the configured org. Tests should be
  idempotent or self-cleaning where possible.
- **Virtual passkey signer** (`src/services/e2e/virtualPasskey.js`) is a
  from-scratch P-256 + WebAuthn assertion implementation. The math is
  deterministic but has no on-chain validation test yet — first claim
  attempt is the validator.
