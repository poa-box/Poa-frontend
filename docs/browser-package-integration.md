# Single-package browser integration

The frontend consumes one `@poa-box/core@2.2.0` release candidate, using a
content-addressed archive committed under `poa-app/vendor/` until that version is
published. There is no separate browser package, dependency, version or release.
The exact archive is recorded in `poa-app/package.json` and Yarn's lockfile.

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
After core 2.2.0 is published, replace the archive dependency with that exact npm
version and repeat artifact/frontend verification. Core 2.1.0 remains the currently
published release; this branch does not publish, merge or deploy anything.
