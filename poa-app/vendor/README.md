# Core package integration

The application installs exact **`@poa-box/core@2.2.0` from npm**. The Yarn lock
records its registry URL and SHA-512 integrity. Its published archive is byte-for-byte
identical to the reviewed candidate used for 12 fresh Test6 transactions:
SHA-256 `4d2c3b8ebb5d50bf20184ecbceaa316aa5f8e43675bf7793fdea97f8988b913d`.
All 434 installed files match the published payload, and there is one core copy.

This combines the protocol APIs with optional `@poa-box/core/browser/*` adapters
and `@poa-box/core/workflows`. There is no separate browser dependency or release.
Core 2.1.0’s 364 compiled files are unchanged. [Core PR #40](https://github.com/poa-box/poa-cli/pull/40)
is merged; the registry payload was independently verified before the frontend
switched to the exact published version. The candidate archive remains local,
ignored evidence and is no longer tracked or selected as a dependency.

See [the integration guide](../../docs/browser-package-integration.md). Current
receipt, metadata, package and browser verification is recorded in
`.context/core22-live-variety/` at the repository root. Earlier consolidation
verification remains in `.context/core-consolidation/`.

## Previous published core 2.1.0 integration

The previous dependency installed exact **`@poa-box/core@2.1.0` from npm**. The published
archive is byte-for-byte identical to the reviewed candidate (SHA-256
`f64e7bbbbcb6ead53a48bfc012cbe03a1e223ebf870066f8c6062c1f51f50849`), and
all 371 installed files match its payload. It preserves the published 2.0.0
execution/recovery fixes and adds the frontend's staged role-operation API.

[Core release PR #39](https://github.com/poa-box/poa-cli/pull/39) published this
version from commit `e83140f7c3788d832d3b60fe7f0d0898ee660a4d`.
The Yarn lock records its registry URL and SHA-512 integrity. Published `2.0.0`
lacks the role-operation imports used here. Historical archives remain local
diagnostic evidence, are ignored by Git, and are not application dependencies.

Fresh acceptance covers production WebAuthn signing and cancellation in Chrome,
Test6 passkey and direct-wallet poll creation/ballots with canonical receipts,
reload persistence, production build and the E2E leakage guard. The detailed
local report is `.context/registry-integration/report.html` at the repository root.
These checks do not establish physical biometric-device support, a live email
backend, passkey cash-out, or eventless native-transfer history.

## Historical October 19 candidate notes

The notes below describe the older local artifact and its verification at that
time. Its archive is preserved locally; it is not the registry's released 2.0.0
artifact and is no longer the selected dependency.

### Previous unpublished core 2.0.0 integration candidate

The frontend selects **`poa-box-core-2.0.0-integration-0a792a4fa9cd.tgz`** through its unique relative file dependency. Package version `2.0.0` remains unpublished.

- SHA-256: `0a792a4fa9cdc7f76c017512a0cf16de794af3ec46142434d358b72f21e79ca7`.
- Core source HEAD: `4e350519be1ddb19ca39feddf3f48bf7bd72a71d` (the independent repeated-email-claim compatibility repair), plus the uncommitted integration implementation, repairs, types and documentation recorded in `../../.context/integration-simplification/results/integrate-package.artifact.json` and the final source freeze.
- Exact selection: `file:vendor/poa-box-core-2.0.0-integration-0a792a4fa9cd.tgz`; the matching Yarn lock entry records this archive's exact SHA-1. All 371 installed package files are compared with the archive payload by SHA-256.
- Final integration evidence: `../../.context/integration-simplification/results/integrate-package.json`, with detailed checks, source freeze, independent consumer results and archive hashes alongside it. Diagnostic installs/build logs stay under `.context/tmp/` in the respective workspaces.

Both Poa and the independent consumer use `@poa-box/core/governance/role-operations`: bounded evidence, read-only review, explicit preparation/publication, exact staged status and final revalidation. Core retains protocol rules, immutable handles, source attribution and complete canonical voting-class meaning (including exact decimal balances/IDs). React state, scoped caches, draft/recovery persistence, consent and wallet transport remain in the host. An exact created proof completes a create-only request; `review-configuration` permits a separately requested review and does not require an empty second vote.

The archive ships `README.md`, `docs/role-operations.md`, `docs/agents.md`, `docs/operation-manifest.v1.json`, its schema and `docs/frontend-adoption.md`. The independent public-package example is `examples/role-consumer` in the core workspace `/Users/hudsonheadley/conductor/workspaces/poa-cli/halifax-v1`. Its explicit-archive verifier installs a fresh isolated copy, exercises synthetic indexed/RPC fixtures, strict declarations, packaged recipes and a browser bundle/VM without signing or network.

Use Node **22.23.2** and existing Yarn **1.22.22** from `poa-app/`:

```sh
yarn install --offline --frozen-lockfile --ignore-scripts --non-interactive
```

Each same-version unpublished archive has a unique filename to avoid stale Yarn archive caches. Serialize installations/builds and any later authorized dev server. Preserve all prior archives and evidence; no source aliases, workspace links or manual installed-package edits are used.

Offline/production acceptance and actual live acceptance are separate. This package phase performs no browser/dev server/signing or Test6 submission. New Test6 staged creation, actual-ID configuration, GIF and root independent live/design review remain pending with the sole live owner. The prior 54 confirmed Test6 submissions are historical evidence and were not replayed. This archive neither publishes a release nor establishes deployed counter/history completeness, email/backend availability, eventless-native inflows or passkey cashout.

## Historical candidates retained as evidence

These archives are historical and are not selected by the current frontend dependency:

- `poa-box-core-2.0.0-integration-dfb4787a88fb.tgz` — SHA-256 `dfb4787a88fba168e7e95393593e3f8c561a2d3cd4647c6d72854cb78f560e90`; first integration candidate, superseded by the complete class projection required by root review. Its failed/intermediate verification evidence is preserved; it is not selected.
- `poa-box-core-2.0.0-email-compatibility-3c743d401866.tgz` — SHA-256 `3c743d4018668be34fb0b0e639b1bfcbc2ab14ff5e1f59f216aae75195dcdee6`; preceding independently repaired email candidate. The selected archive preserves its compiled email proof bytes exactly.
- `poa-box-core-2.0.0-live-parity-resume2-1c970838d7a7.tgz` — SHA-256 `1c970838d7a7be4ef1333c2978111a344d137eac60f55ff8db33faa0ec0010f2`; core source `c8174a58eb963edbb94b96a7dfaacd380138f02f`, earlier staged-role/live-parity acceptance at `../../.context/parity-restoration/results/live-parity-resume2.json`. This older source was not restored over the email fix or current work.
- `poa-box-core-2.0.0-live-parity-fdedbd374aab.tgz` — SHA-256 `fdedbd374aab362f829318e62b5fd924aae22b70c47b6592503ef2349799fe56`; preceding live parity candidate.
- `poa-box-core-2.0.0-staged-roles-be1f7b2da5f6.tgz` — SHA-256 `be1f7b2da5f6cb52f1d2fd33f7cf7eae798ea0a9db2fe02875f07f86711f0226`; preceding staged role candidate. Its original evidence remains in `../../.context/parity-restoration/results/staged-role-integration.json`.
- `poa-box-core-2.0.0-browser-provenance-4b77b83756ab.tgz` — SHA-256 `4b77b83756ab34391f802808e7cd19b418e1d15c9968084a6a8ead55b83a7c4f`.
- `poa-box-core-2.0.0-timestamp-54cd8b3a41e8.tgz` — SHA-256 `54cd8b3a41e85d19a7eb94c451589480f96c3cd72edecfc9a02c374f1a0a26b9`.
- `poa-box-core-2.0.0-gap-closure-0154dbd4a277.tgz` — SHA-256 `0154dbd4a2771effcce050ff6734a0cf1637f8c01ac3d6710e678b595f89bbe6`.
- `poa-box-core-2.0.0.tgz` — SHA-256 `81de2ddb54d3972389d07a9a4ae4862dbe2ef6d083d0e21d9c756220c1c73a4a`; original frontend migration candidate.

All archives remain unchanged and unpublished. After approved publication, adopt the exact published version only after comparing the reviewed payload and rerunning package integration gates. Native inflow completeness (issue 215) remains outside this repair.
