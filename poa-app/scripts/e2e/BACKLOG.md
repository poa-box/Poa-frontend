# E2E test infrastructure — follow-up backlog

Tracking known limitations and improvements deferred from the initial
implementation. Order is rough priority.

## check-prod-leakage misses arrow-function consts

The auto-discovery regex matches `export function NAME` and `export class
NAME` only — `export const NAME = () => {...}` would slip through. No such
exports exist today, but a future contributor could add one and have it
leak undetected.

**Action:** either widen the regex to also match
`export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function)`,
or document the convention "use `function foo()` for E2E exports" in the
script header. Low priority.

## test-virtual-passkey duplicates the algorithm

The off-chain test reproduces the assertion-building logic instead of
importing it from `src/services/e2e/virtualPasskey.js` (the source uses
ESM + browser-only globals like `btoa`/`window`, which Node CommonJS can't
require directly). Drift risk: change the algorithm in one place and forget
the other and the test passes while real signatures fail at the bundler.

**Action:** split `virtualPasskey.js` into a pure-math module
(`virtualPasskeyCore.js`) and a browser-shim module that adds
`window.location.origin`/`hostname`. The core module would be Node-importable.
Test imports core directly. Defer until the test gives a false pass.

## On-chain validation of virtual passkey signatures — RESOLVED

The virtual passkey now validates end-to-end on Gnosis: deploy + first
vote both pass `validateUserOp` and the bundler accepts the UserOp.

The bug was a stale read of the contract source: `new-york/upgrades/
current/PasskeyAccount.sol` had a permissive signCount check, but the
deployed `geneva-v2` `WebAuthnLib.verifyWithSignCount` was tightened to
also reject `lastSignCount > 0 && newSignCount == 0` (treats counter=0
after a non-zero counter as "possible cloned key"). Since the deploy
UserOp seeded `signCount=1`, every subsequent virtual sig with the old
hardcoded `counter=[0,0,0,1]` or `[0,0,0,0]` failed. Fix in
`virtualPasskey.js`: emit `Math.floor(Date.now()/1000)` as the counter
— always strictly greater than any plausible stored signCount, fits in
uint32 until 2106. `test-virtual-passkey.js` was synced to match.

## Test artifact accumulation in the configured org

The agent's identity becomes a permanent member of the configured org and
every test run that creates tasks/proposals/etc. leaves on-chain artifacts.
There is no automatic cleanup.

**Action:** decide on a strategy — either (a) a cleanup script that closes
test tasks + revokes test proposals at the end of a run, (b) periodic manual
purge of `Test6` test artifacts, or (c) accept the noise as test cost. Worth
a deliberate decision before the agent runs frequently.

## Mainnet blast radius

The burner EOA + virtual passkey are real on-chain identities on Gnosis +
Arbitrum mainnet. If `~/.poa/e2e.env` leaks, anyone can drain funds and
impersonate the test account in the configured org. Mitigations in place:
file mode 0600, member-tier hat (not admin), small burner balance. Open
risks: machine compromise, accidental commit of the env file, Pimlico key
exfil.

**Action:** evaluate moving to Arbitrum Sepolia + Base Sepolia testnets
once a testnet deployment exists. Until then, keep funding minimal and
the hat low-permission.

## Pimlico mainnet spend cap

Every UserOp the agent runs costs real Pimlico-paymaster credits. A runaway
test loop could drain budget.

**Action:** set a per-day spend cap in the Pimlico dashboard. Document the
cap value somewhere visible (README or here).

## `setup-machine.js` rotate UX

Pass `--rotate` and the script prompts to type "rotate" to confirm. Two
gates for one destructive action is mild friction but defensible. Consider
folding into a single `--rotate=force` flag if the friction proves
annoying. Low priority.

## seedVirtualPasskey.js cold-start latency

First `/join` load in E2E mode pays ~1 subgraph + 1 RPC round-trip to
resolve the passkey factory address. Second load uses the localStorage
cache. Acceptable today.

**Action:** if cold-start latency matters, ship the factory address as a
constant in `e2eMode.js` with a one-time setup-machine resolution. Defer
until the slowness actually bites.
