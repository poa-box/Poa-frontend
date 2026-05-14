# Poa Docs Roadmap

Comprehensive plan to bring the user-facing docs (`poa-app/posts/*.md`) up to
parity with what the product actually ships. Surfaces at `/docs/{id}`.

## Context

Today's docs surface (8 published posts, ~2,580 words total) covers:
foundational concept, 3 voting models, create flow, join flow, AlphaV1
feature dump, and a brief subgraph note. The actual feature set is *much*
bigger — passkey auth, role/permission system, task manager, treasury,
education, gas sponsorship, cashout, protocol dashboard, white-label, plus
several core concepts that are referenced everywhere but defined nowhere
(participation tokens were just expanded in `contributionVoting.md`; hats,
vouching, solidarity fund are still untreated).

The May 2026 SEO pass rewrote and expanded what already existed. This
roadmap is about what's still **missing entirely**.

## Editorial voice rules

Same posture as the FAQ rewrite — every doc must work for a student
treasurer, a co-op organizer, or an OSS maintainer who doesn't think of
themselves as a crypto person.

1. **Lead with the user goal**, not the technology. ("Pay a contributor"
   before "Treasury.transfer()".)
2. **Plain language first**, mechanics second. The mechanics section can
   reference blockchain / smart contracts / ERC-4337 freely — they're for
   readers who want them — but never in the first 100 words.
3. **Concrete examples** beat abstractions. Every doc has at least one
   worked example with real numbers/scenarios.
4. **Cross-link aggressively**. Topic clusters are the SEO play; every doc
   links to 2–3 related docs in its body and finishes with a "Related
   reading" list (the page wrapper already renders this from
   `getRelatedPosts()`).
5. **The FAQ's web3-quarantine rule does not apply to the docs.** Docs are
   the place where someone who *wants* to know how the rails work can read
   "blockchain" / "DAO" / "on-chain" without us being coy. But the lead
   paragraph still has to make sense to someone who doesn't.

## Existing docs (8 files)

| File | Status | Action |
|---|---|---|
| `perpetualOrganization.md` | Complete | Keep |
| `directDemocracy.md` | Expanded May 2026 | Keep |
| `contributionVoting.md` | Expanded May 2026 | Keep |
| `hybridVoting.md` | Complete (~280w) | **P2 — expand** to match the depth of the other two voting docs (~550w), add worked example, pros/cons, when-to-use, cross-links |
| `create.md` | Stub | **P2 — rewrite** as a full deployment wizard reference (see D-Deploy below) |
| `join.md` | Stub | **P1 — expand** to cover passkey + magic link onboarding plainly, link out to `passkeyOnboarding.md` for the deep dive |
| `AlphaV1.md` | Feature announcement (~800w) | Keep (it's a changelog entry, not a reference) |
| `TheGraph.md` | Brief | **P2 — expand** to include a "how to verify your org's data" section that links readers to actual subgraph queries |

## Slug convention

**Decision May 2026:** new docs use **kebab-case** (e.g.
`passkey-onboarding.md`, `roles-and-permissions.md`). Existing docs in
camelCase (`hybridVoting`, `contributionVoting`, `directDemocracy`,
`perpetualOrganization`, `AlphaV1`, `TheGraph`, `create`, `join`) keep
their current slugs in this pass to avoid breaking internal links,
sitemap, and any external inbound links. Migration of existing slugs is
a follow-up tracked separately — when done, it needs Cloudflare-side
redirects (this is a static export, so no `next.config` redirects fire
in prod) and updates to every cross-link in the landing components.

## New docs — 14 in priority order

Each entry: filename, audience, target word count, primary keyword for SEO,
1-paragraph scope, and cross-links to ship with.

### P0 — Every new user hits these

#### `passkeyOnboarding.md` (~600w, audience: any new user)
**Primary keyword:** "passkey login" / "passkey for organizations"
**Scope:** What a passkey is (face/fingerprint sign-in, same as banking apps),
why it replaces wallets and seed phrases, what to expect during sign-up
(one tap, no install), what's stored where, how recovery works, how it
behaves across devices. Lead with the user experience; mechanics
(WebAuthn → ERC-4337 smart account) live in a "How it works under the
hood" section near the end.
**Cross-links:** `/docs/join`, `/docs/accountAbstraction` (if shipped), `/docs/create`.

### P1 — Headline features that have no doc

#### `rolesAndPermissions.md` (~700w, audience: org admins / founders)
**Primary keyword:** "DAO roles and permissions" / "community organization roles"
**Scope:** The roles system — Members, Executives, custom tiers — and how
permissions slot in (per-project: who can create tasks, claim them, review
them, assign them). Cover the role hierarchy tree, vouching/trust-based
progression, what each "permission" actually unlocks in the UI. Worked
example: a 30-person co-op with three role tiers and how that maps to
day-to-day actions. Mechanics section: hats-based encoding, why it's
durable across membership changes.
**Cross-links:** `/docs/hatsAndRoles`, `/docs/taskManager`, `/docs/vouchingAndTrust`.

#### `taskManager.md` (~800w, audience: all members)
**Primary keyword:** "DAO task management" / "community task tracking"
**Scope:** Projects, tasks, the claim/assign/review lifecycle, how
participation tokens get minted on completion, the payout formula (base +
difficulty × hours), how reviewers verify completion, how tasks tie into
governance via participation tokens. One worked example: a worker co-op
defines three task types and shows how a member's first month accumulates
voting power. Mechanics section: TaskManagerNew contract, why state is
on-chain (defensible against admin disputes).
**Cross-links:** `/docs/contributionVoting`, `/docs/rolesAndPermissions`,
`/docs/treasuryManagement`.

#### `treasuryManagement.md` (~700w, audience: org admins / treasurers)
**Primary keyword:** "DAO treasury management" / "shared community treasury"
**Scope:** What a Poa treasury is (multi-token ERC-20 store; the shared bank
account referenced in the FAQ), how deposits happen, how spending requires
a community vote, how to read the on-chain transaction history, how
Permit2 approvals work for fast UX, and the relationship to PaymentManager
for member payouts. Mechanics section: the contracts involved, why
withdrawals can't be unilateral.
**Cross-links:** `/docs/cashout`, `/docs/gasSponsor`, `/docs/taskManager`.

#### `learnAndEarn.md` (~500w, audience: members / module creators)
**Primary keyword:** "DAO education modules" / "learn and earn governance"
**Scope:** Education hub overview — anyone with permission can create a
learning module (quiz, links, completion criteria), members earn tokens on
completion, modules can gate role progression. Worked example: a student
org creating a "Treasurer onboarding" module that mints 50 PT on
completion and unlocks the Treasurer hat.
**Cross-links:** `/docs/rolesAndPermissions`, `/docs/taskManager`,
`/docs/contributionVoting`.

#### `protocol.md` (~600w, audience: anyone looking at /protocol)
**Primary keyword:** "Poa protocol dashboard" / "DAO infrastructure transparency"
**Scope:** Read this if you want to understand what the live `/protocol`
dashboard is showing you. Definitions for each section: total organizations,
member accounts, active chains, beacon types, sponsored transactions, gas
spend per chain, solidarity fund balance, contract upgrade history. Why
this is public and verifiable. Mechanics section: the subgraph that powers
it, how to query it yourself.
**Cross-links:** `/docs/gasSponsor`, `/docs/TheGraph`, `/docs/crossChainArchitecture`.

### P2 — Important to advanced topics

#### `deploymentWizard.md` (~700w, audience: org founders)
**Primary keyword:** "how to create a DAO" / "no-code DAO setup"
**Scope:** Step-by-step reference for `/create` — what every field means,
what every toggle changes, what's reversible vs. permanent after deploy.
Mirrors the wizard's 6 steps (Template / Identity / Team / Governance /
Settings / Launch). Includes a "common configurations" cheat sheet for the
three landing-page personas (student org, worker co-op, OSS project).
**Cross-links:** `/docs/create` (which becomes a short pointer to this
doc), `/docs/rolesAndPermissions`, `/docs/gasSponsor`.

#### `gasSponsor.md` (~500w, audience: org admins)
**Primary keyword:** "DAO gas sponsorship" / "community fund paymaster"
**Scope:** Explain that members never see a "gas fee" — the protocol's
solidarity fund covers transaction costs by default, and orgs can also
self-fund. Cover when sponsorship applies, how the solidarity fund is
replenished, what happens if sponsorship is unavailable (self-funded
fallback). This is the same concept the FAQ calls "small infrastructure
cost" — the doc is where we explain the mechanism.
**Cross-links:** `/docs/protocol`, `/docs/treasuryManagement`,
`/docs/deploymentWizard`.

#### `accountAbstraction.md` (~600w, audience: technically curious users)
**Primary keyword:** "ERC-4337 smart accounts" / "passkey smart account"
**Scope:** The mechanics behind passkey login. WebAuthn key creation →
deterministic smart account address → ERC-4337 UserOps for every action.
Why this exists (seedless onboarding, transaction sponsorship, batching).
Limitations (account abstraction features not yet on every chain). This is
the technical companion to `passkeyOnboarding.md`.
**Cross-links:** `/docs/passkeyOnboarding`, `/docs/gasSponsor`,
`/docs/crossChainArchitecture`.

#### `hatsAndRoles.md` (~500w, audience: org admins / technical readers)
**Primary keyword:** "Hats Protocol DAO roles"
**Scope:** What Hats Protocol is and why Poa uses it. How a role you
configure in the wizard maps to a hat. Hat hierarchy, admin hats,
delegation. Why hats are durable (you can't be silently demoted).
Mechanics-leaning doc — the user-facing companion lives in
`rolesAndPermissions.md`.
**Cross-links:** `/docs/rolesAndPermissions`, `/docs/AlphaV1`.

#### `vouchingAndTrust.md` (~400w, audience: org admins)
**Primary keyword:** "community vouching" / "trust-based role progression"
**Scope:** What vouching is — existing members co-sign on a candidate to
let them advance into a role tier. How many vouches you can require per
tier. When to use it (anti-Sybil, gating exec roles) vs. when not to
(slowing down low-stakes member onboarding). Worked example.
**Cross-links:** `/docs/rolesAndPermissions`, `/docs/perpetualOrganization`.

#### `cashout.md` (~600w, audience: members getting paid)
**Primary keyword:** "DAO payouts to bank" / "USDC to fiat cashout"
**Scope:** How a member converts treasury payouts into spendable money.
Permit2 signature → Bungee cross-chain solver → ZKP2P relay → fiat in the
member's payment app. Atomic flow for externally-owned accounts; passkey
flow note (currently requires account upgrade — flag for product update).
**Cross-links:** `/docs/treasuryManagement`, `/docs/taskManager`.

#### `crossChainArchitecture.md` (~500w, audience: technical readers)
**Primary keyword:** "cross-chain DAO" / "multi-chain governance"
**Scope:** Why Poa runs across chains — Arbitrum as the account home,
Gnosis as the production org default, Sepolia/Base for testing. How an
account on Arbitrum participates in an org deployed on Gnosis. Permit2
bridging for treasury cashout. Future chains and the upgrade path.
**Cross-links:** `/docs/protocol`, `/docs/accountAbstraction`,
`/docs/cashout`.

#### `whiteLabelHosting.md` (~400w, audience: advanced orgs)
**Primary keyword:** "white label DAO" / "custom domain DAO"
**Scope:** How `getDefaultOrgForHost` works — point your own domain at Poa
and have it route directly to your org's home. What's customizable
(branding, navigation default), what isn't (the underlying protocol). When
to use this vs. just sending people to `poa.box/explore/yourorg`.
**Cross-links:** `/docs/deploymentWizard`, `/docs/protocol`.

### Total scope

~7,400 new words across 12 docs, plus ~1,000 words of expansion to
existing stubs (hybridVoting.md, create.md, join.md, TheGraph.md).
Brings total docs corpus to ~11,000 words — a real product reference.

## Sitemap & cross-cutting

When new docs ship:

1. **Add to `poa-app/scripts/generate-sitemap.mjs`** — the generator
   already picks up everything in `posts/` automatically; no manual
   sitemap edit needed. Just rerun `node scripts/generate-sitemap.mjs`
   after each batch.
2. **Add category mapping** in two places:
   - `poa-app/src/util/posts.js` → `determineCategory()` — assign
     "Get Started" / "Voting" / "Features" / new category as appropriate
   - `poa-app/src/pages/docs/index.js` → `customTitles` — friendly
     display name for the docs index card
   - `poa-app/src/pages/docs/index.js` → the filter arrays
     (`getStartedPosts`, `votingPosts`, `blogPosts`) — add new IDs
3. **Cross-link from landing copy** — feature cards on the landing
   currently link to the most-relevant doc; when better docs ship,
   update the `href` in `FeatureCards.jsx`. Right now Treasury and
   Roles cards both point at `/docs/perpetualOrganization` as a
   placeholder; they should point at `treasuryManagement.md` and
   `rolesAndPermissions.md` once those exist.
4. **Update the FAQ's "How do payments and money management work?"
   answer** to link to `treasuryManagement.md` once shipped (it
   currently doesn't link anywhere).
5. **Add a "New here?" sidebar block** on the docs index pointing
   first-time visitors at `passkeyOnboarding.md` and `join.md` once the
   passkey doc exists.

## Suggested rollout order (2 weeks of writing)

**Week 1 — onboarding & headline features (P0 + most of P1)**
- Day 1: `passkeyOnboarding.md`
- Day 2: `rolesAndPermissions.md` + cross-link updates in
  `FeatureCards.jsx`
- Day 3: `taskManager.md` + cross-link updates
- Day 4: `treasuryManagement.md` + update FAQ payments-answer link
- Day 5: `learnAndEarn.md` + `protocol.md`

**Week 2 — advanced + technical (P2)**
- Day 1: `deploymentWizard.md` (replaces stub `create.md` as the
  reference; keep `create.md` as a short pointer)
- Day 2: `gasSponsor.md`
- Day 3: `accountAbstraction.md` + `hatsAndRoles.md`
- Day 4: `vouchingAndTrust.md` + `cashout.md`
- Day 5: `crossChainArchitecture.md` + `whiteLabelHosting.md`

**Cleanup batch (between weeks or after):**
- Expand `hybridVoting.md` to depth of the other voting docs
- Expand `join.md` with passkey deep-link
- Expand `TheGraph.md` with verification examples

## Editorial review checklist (per doc)

Before merging a new doc:

- [ ] Lead paragraph (first 100 words) has no crypto vocabulary
- [ ] Primary keyword in title and at least once in first paragraph
- [ ] At least one concrete worked example with real numbers
- [ ] 2–3 contextual links to related docs
- [ ] Headings sized correctly (H2 for sections; H3 for subsections —
  the wrapper page's H1 handles the title)
- [ ] Tested live at `/docs/{id}` with sidebar and breadcrumb working
- [ ] Description meta auto-extracts cleanly (the first non-heading
  paragraph becomes the meta description — make sure it's a good one)
- [ ] If the doc references features that are coming-soon or
  partially-shipped, that's flagged in-line (don't write past the product)
