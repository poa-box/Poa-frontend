# White-label hosting

You can run a Poa organization on your own domain. Members visit `yourorg.example.com` instead of `poa.box/explore/yourorg`. They see your branding instead of Poa's. They never necessarily realize they are using the Poa platform underneath. The underlying organization is exactly the same. Same governance. Same treasury. Same members. The front door is just yours.

This is the right setup for organizations that want a distinct public identity. A worker co-op with its own customer-facing brand. A student club with a campus subdomain. A foundation that wants to look like a foundation. For everyone else, the default `poa.box` hosting is simpler and fine.

## How it works at a high level

You point a DNS record (a CNAME or an A record, depending on your host) at Poa's hosting infrastructure. We map that hostname to your organization's slug. When members visit your domain, they get the Poa app shell but pre-loaded with your organization's identity. They are on your org's home page from the moment the page loads. Your logo. Your description. Your members. Your proposals.

Sign-in still works the same way (passkey or wallet). Cross-org features (the global explore directory, account-level settings) are reachable from your domain. You can also hide them from the nav if you want a more focused experience.

## A worked example: a worker co-op with its own brand

Bread & Roses Co-op already has a website at `breadandroses.coop` that advertises their delivery service. They want their member portal to live on the same domain. `members.breadandroses.coop`. So their workers do not have to remember a separate URL.

1. They add a CNAME record for `members.breadandroses.coop` pointing at our hosting.
2. They register the mapping in their org's settings: `members.breadandroses.coop` to `bread-and-roses` (their org's slug).
3. The first time they visit `members.breadandroses.coop`, the page loads as the Bread & Roses Co-op home. Their workers sign in with passkey and start using the platform.
4. The "Poa" branding is replaced by their own (logo, theme colors, footer text). We still attribute the platform in the footer as required.

What did not change: the organization is still the same organization underneath. Same governance. Same treasury. Same audit trail in the [protocol dashboard](/docs/protocol). They are just renting the front door.

## What is customizable vs. what is not

**Customizable per white-label deployment:**

- Domain
- Brand name displayed in navigation and headers
- Logo
- Default theme (within the available palette)
- Which top-level pages appear in the nav
- Default landing route (most go straight to the org home. Some go to a custom marketing page.)

**Not customizable** (and we will not change this on request):

- The underlying protocol the org is built on. White-label means brand, not fork.
- Removing the small "Powered by Poa" attribution in the footer.
- Bypassing security review for custom JavaScript. We do not run customer JS on the platform domain.

## Setting it up

White-label is currently set up via direct configuration with the Poa team. We want to verify the org has good standing. We want the right contact information. We want to do a security review on any non-standard requests. The flow:

1. Ping us via the contact path in the protocol dashboard, or reach out through the [Poa Discord](https://discord.gg/9SD6u4QjTt).
2. Confirm your org's slug and the domain you want to use.
3. Add the DNS record we provide.
4. We register the mapping. Verification happens automatically on the next DNS resolution.
5. Test on the new domain. If you want any branding overrides, send them via the same contact thread.

For a worked example with all the Cloudflare clicks documented, see [`docs/kubi-dao-setup.md`](https://github.com/poa-box/Poa-frontend/blob/main/docs/kubi-dao-setup.md). The runbook we wrote for `dao.kublockchain.com`. Self-serve white-label setup is on the roadmap. In the meantime, the manual path is short.

## How it works under the hood

Mechanics:

- **Host to org-slug mapping** is held in `poa-app/src/config/hostDefaultOrg.js` in the [Poa-frontend](https://github.com/poa-box/Poa-frontend) repo. When the app boots, it checks `window.location.host` against the configured mapping. If there is a match, the app is initialized in "single-org" mode for that slug.
- **Edge proxying via Cloudflare Worker.** Your custom domain points at a Cloudflare Worker that reverse-proxies to `https://poa.box` and rewrites the root path to your org's home (so visitors do not see a brief "exploring all orgs" flash on the first paint). A canonical worker template, with all the Cloudflare clicks documented, is in [`docs/kubi-dao-setup.md`](https://github.com/poa-box/Poa-frontend/blob/main/docs/kubi-dao-setup.md). Poa's own production worker (the one fronting `poa.box` itself) is in [`cloudflare-worker/worker.mjs`](https://github.com/poa-box/Poa-frontend/blob/main/cloudflare-worker/worker.mjs).
- **WebAuthn related origins.** Passkeys work across your custom domain because `poa.box` registers your hostname as a WebAuthn related origin. This is what lets a passkey created on one domain authenticate on another within the configured allowlist.
- **No data isolation difference.** A white-label org's data is the same on-chain data as a non-white-label org. Anyone visiting `poa.box/explore/bread-and-roses` directly would see the same org. Just inside Poa's main shell.

## Caveats

- **SSL certificate.** Your DNS must support modern TLS. We handle certificate provisioning via the underlying CDN once the DNS is set up.
- **Search engine visibility.** Both URLs (your white-label and the canonical `poa.box/explore/yourorg`) resolve. We set a canonical URL on the page so search engines do not see this as duplicate content. If you care strongly about SEO on your own domain, talk to us about the canonical strategy that fits your case.
- **Member confusion.** Your members might still get sign-in links pointing at `poa.box` from external integrations (Discord bots, email). Most of these we can configure to use your white-label domain instead. Worth checking after setup.

## Related reading

- [Deployment wizard](/docs/deployment-wizard). The org itself is set up here. White-label is a layer on top.
- [Protocol dashboard](/docs/protocol). How to verify your white-label org is mapped correctly
