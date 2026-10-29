# Shared browser integration

The protocol dependency stays on the published `@poa-box/core@2.1.0`. This branch
also consumes the reviewed `@poa-box/browser@0.1.0` candidate as a committed,
content-addressed archive under `poa-app/vendor/`. The exact filename is in
`poa-app/package.json`; Yarn records its integrity. It is not yet an npm release.
After browser package publication, replace the file dependency with that exact
registry version and repeat the package, frontend and browser acceptance checks.

The application's service layer now imports the shared package for:

- passkey creation, discovery, assertion validation and credential codecs;
- account deployment readiness and counterfactual factory address prediction;
- compatible credential hint storage and account submission locks;
- the final ethers dispatch boundary, preserving receipt and event behavior.

The frontend keeps its UI, selected wallet and passkey configuration, E2E seams,
service wrappers, domain controllers, cache refresh and existing core workflows.
The new browser package's high-level poll, ballot, task and enrollment controllers
are available to other integrations and tested independently; this migration does
not replace all existing frontend domain controllers with them.

Package documentation ships in the candidate archive under `README.md` and
`docs/integration.md`; `docs/features.v1.json` identifies supported operations,
required ports, units, side effects and unsupported services. The shared package
has no React dependency. Core policies and encodings remain in core; browser
lifecycle concerns belong in the optional browser package; presentation belongs
here.

Do not reproduce package source in frontend services. Keep application-specific
wrappers small, preserve user approval and the existing account-generation guards,
and recover uncertain submissions rather than automatically retrying them.
