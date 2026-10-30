# Single-package browser integration

The frontend installs exact `@poa-box/core@2.2.0` from npm. There is no separate
browser package, dependency, version or release. The registry URL and SHA-512
integrity are pinned in Yarn's lockfile. The published archive is byte-for-byte
identical to the reviewed candidate used for the live Test6 acceptance run
(SHA-256 `4d2c3b8ebb5d50bf20184ecbceaa316aa5f8e43675bf7793fdea97f8988b913d`);
all 434 distributed files match the installed package.

Use `@poa-box/core` and its existing domain subpaths for protocol functionality,
`@poa-box/core/browser/*` for optional browser adapters, and
`@poa-box/core/workflows` for complete operation controllers. The core root keeps
browser code and DOM types out of Node/CLI consumers. The package has no React
requirement and does not select a wallet or open a passkey prompt on import.

The frontend service layer uses the browser subpaths for passkey creation,
discovery, assertion validation and codecs; account readiness and factory address
prediction; compatible credential hint storage and account locks; and the final
ethers dispatch boundary. Its UI, provider state, E2E seams, domain controllers
and cache refresh remain here. High-level poll, ballot, task and enrollment
controllers are verified independently; not every existing frontend domain
controller is replaced by this import migration.

Documentation ships in the same core archive: `docs/browser.md`,
`docs/browser-integration.md` and `docs/browser-features.v1.json`. It specifies
supported operations, injected services, units, side effects and recovery states.
Core 2.2.0 was published after [core PR #40](https://github.com/poa-box/poa-cli/pull/40)
merged. Registry integrity and payload equality were independently verified before
switching this frontend to the exact npm version. Fresh Test6 acceptance exercised
12 transactions across a task lifecycle and learning module using both passkey and
direct-wallet identities. Production build, tests and leakage checks also run
against the registry installation. This frontend PR does not deploy the app.

## One host entry point for roles

`RoleCreationService.createWorkflow(host)` binds Poa's form, source readers,
proposal envelope and saved records to `createRoleCreationWorkflow` in
`src/services/web3/domain/RoleCreationWorkflow.js`. Both the vote gallery and
organization structure use that workflow through `useRoleCreationContext`.
This is a **portable host workflow on published core 2.2.0**, not a newly
published package API. Its module imports no React, Next, Apollo or browser globals.

```js
const roles = services.roleCreation.createWorkflow(host);
const preview = await roles.review(form, { signal }); // read-only
showReview(preview);
// On the member's explicit Create vote action, inside the notification wrapper:
const result = await roles.submit({ form, proposal: {
  name: 'Create a role', description: '', durationMinutes: 60,
  hatIds: [], extensions: { future: { note: 'Host metadata is retained' } },
}, onSaved: id => retainDraftReference(id) });
```

There is no public prepare/begin/track/finish protocol. Submission snapshots the
inputs, prepares once for concurrent identical calls, publishes the core-selected
documents, creates the governance envelope through `VotingService`, and renews
role evidence at the actual manager `beforeSend` boundary. Transport success only
means a proposal was submitted. It does not prove a role was created.

```js
// After reload, using the same account/organization scope and durable store:
const saved = roles.rows();
const status = await roles.recover(saved[0].id, { signal }); // never sends
if (status.proof.state === 'created' && status.requiresConfiguration !== false) {
  const nextForm = { ...status.form, continuationId: status.id };
  showReview(await roles.review(nextForm, { signal }));
  // A later explicit action calls roles.submit({ form: nextForm, proposal }).
}
```

If account recovery already cleared its journal, the saved role still owns its
unsigned identity. `recover(id, { candidateTxHash, configurationTxHash })` accepts
separate creation and configuration transaction candidates, including transactions
mined outside the bounded original scan. Core verifies each candidate against its
own stage; a hash is never proof by itself. The continuation panel exposes optional
references for unconfirmed direct-wallet stages. The CLI accepts the same fields
in a recover request; it never applies one stage's candidate to the other.

`managerLifecycle.js` owns `createSubmissionController`. All three managers and
account recovery share its account/chain lease, awaited `onRecoveryRecord` and
`onOutcome` sinks, and fenced settlement. `onIntent` binds the actual enclosing
proposal call while the lease is held. The normalized unsigned record is saved
before transport, and the outcome sink is delivered once per attempt and finishes
before journal removal. Delegated direct fallback shares that delivery; later
notification failures cannot downgrade a settled success. A rejected durable sink
retains the barrier. An intentional self-funded replacement gets a new capture
and outcome delivery; uncertainty never causes
a retry. The in-process lease capability cannot be reconstructed from storage.
Role continuations retain their own exact references for recovery after the
account journal has been cleared. Historical v1/v2 rows keep the existing keys. New writes use version 3: a publication-only row can retain original settings and an exact-byte document ledger before a creation call exists. Every upload is preceded by an unknown intention; only an acknowledged CID changes it to published. Unknown uploads are never repeated automatically, and exact known receipts can be reused after an explicit new review.

### Independent consumer

`poa-app/scripts/examples/role-workflow.mjs` imports the same production
controller and the public `@poa-box/core/governance/role-operations` API. It is a
DOM-free executable, with explicit host ports rather than application providers:

```sh
bash scripts/with-node22.sh node poa-app/scripts/examples/role-workflow.mjs ./adapter.mjs ./request.json
# Included offline adapter: runs the executable in three fresh Node processes.
# Use a new output directory; --approve explicitly authorizes the simulated submit.
bash scripts/with-node22.sh node poa-app/scripts/examples/role-workflow.offline.mjs .context/tmp/role-example --approve
# Reproducible offline example: real published core, injected source/wallet I/O,
# two storage adapters, reload, exact creation proof and separate configuration.
bash scripts/with-node22.sh yarn --cwd poa-app vitest run src/services/web3/domain/RoleCreationWorkflow.portability.test.js
```

The adapter module exports a ports object. The request is `{ action: 'review',
input: { request: canonicalCoreRequest, draft: opaqueJsonDraft, draftKey } }`,
`{ action: 'submit', input, proposal }`, or `{ action: 'recover', id }`.
The CLI requires `approve(review, proposal)` to return exactly `true` before a
submit; approval is a host responsibility. Do not return a blanket approval in
an interactive production adapter.

The included offline adapter writes its actual review/submit/recover request and
output files plus durable state in the specified directory. It uses the installed
core to review and prove the exact synthetic pending proposal after reload, and
asserts one simulated send. Its serial submission port has no real signer or
network transport; it is an executable host example, not a production lock adapter.

| Port | Contract |
| --- | --- |
| `observe({ signal })` | Current `scope`, `sources` and optional `authoritySnapshot` for the public core API. Recheck account, organization, modules, endpoint and generation after awaited reads. |
| `store.read() / save(row)` | Durable JSON drafts, original settings, stage attempts and exact unsigned references. Save must verify persistence or throw; never store signatures. |
| `submission.session(run)` / `withLease(run, capability)` | Session checks the account barrier and holds one lease from preparation through settlement. Pass its capability to the actual manager using `DELEGATED_SUBMISSION_LEASE`; nested store writes reuse it. The controller validates the capability in process. |
| `submission.pending() / recover(saved, options)` | Current journal selection and core-owned exact recovery; `detached: true` must not clear an unrelated current record. |
| `propose(prepared, proposal, lifecycle)` | Preserve the host envelope; use `lifecycle.publishDocument` for the exact proposal bytes and delegate `lifecycle.lease`; wire `beforeExecute`/`beforeSend`, `onIntent`, `onRecoveryRecord`, `onOutcome` into the actual submission controller. Await every capture sink. |
| `identity(raw, intentKey)` | Validate scope and intent, allowlist unsigned identity, preserve owner/attempt/revision. Poa uses `roleRecoveryIdentity` from its continuation store. |
| `fetchDocument / uploadDocument` | Trusted reads and explicit submission-time publication of core-selected bytes. |
| `project(draft, operation, review, preview)` | Optional display projection. The default returns the core operation result. Poa preserves Shares and the configured symbol's case here. |
| `proposalId(receipt)` | Optional receipt display hint. Core still proves the exact proposal and executed subject independently. |
| `assertCurrent / changed` | Host scope guard and UI subscription hint. `dispose()` aborts work and invalidates handles; React's effect restart uses `activate()` after clearing the old generation. |

The installed package also exports `createRoleWorkflow`. Its public 2.2.0
workflow rejects compound mode, builds a limited proposal envelope and owns its
own transport/journal lifecycle. It does not import Poa's historical continuation
records. Those constraints are why this frontend uses the public protocol facade
inside the portable host workflow while preserving its mature managers. No
unpublished package, deep import or patched dependency is required.
