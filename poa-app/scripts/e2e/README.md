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

Both addresses must be vouched once before the agent can claim hats.

## Running the agent

```
yarn dev:e2e             # auto-connects burner EOA
yarn dev:e2e-passkey     # skips EOA auto-connect; passkey vouch-first flow
```

The agent then drives `/join?org=Test6` (or whatever org was configured)
and the production code path takes over: `useVouchFirstOnboarding` →
`PasskeyOnboardingService.deployWithExistingCredential` for the passkey
case, or `quickJoinWithUser` for the EOA case.

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
