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
