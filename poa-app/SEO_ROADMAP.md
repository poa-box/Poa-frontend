# Poa SEO Roadmap

Living doc tracking the post-rewrite content strategy for poa.box. The May 2026
overhaul fixed the foundation: keyword targeting, schema, FAQ, expanded docs,
and inner-page intros. What's below is the ongoing work that compounds rankings
over months, not days.

Re-read the audit findings before kicking off new work — the
[plan file](/Users/hudsonheadley/.claude/plans/i-need-you-to-starry-fountain.md)
captures the snapshot we started from.

## Keyword targeting map (current state)

| Layer | Phrases | Lives in |
|---|---|---|
| Brand | poa.box, Poa, poa box | title, description, schema alternateName, footer, OG |
| Primary topical | community-owned organization, community-owned DAO, decentralized organization | H1, hero subhead, section H2s |
| Secondary product | no-code DAO, DAO builder, no-code governance platform, on-chain governance | subheads, FAQ, schema |
| Use-case | student organization governance, worker cooperative software, open-source project governance | UseCaseShowcase cards, use-case-card link labels |
| Feature | contribution-based voting, decentralized treasury, on-chain voting, hybrid voting, direct democracy | FeatureCards, expanded docs |
| Long-tail | what is contribution-based voting, what is a perpetual organization, DAO vs cooperative | FAQ section, expanded docs, future blog posts |

## Phase 4 — Next 30 days

### Educational blog posts (target long-tail queries)

Each ~1,200 words, posted in `poa-app/posts/` and indexed via existing
`/blog/[id]` route. Use `Article` JSON-LD (already wired in `pages/blog/[id].js`).

1. **What is a DAO? A plain-language guide for people who don't think of themselves as crypto users**
   - Target query: "what is a DAO"
   - Hook: the user is a student treasurer / co-op organizer / OSS maintainer
   - Outline: definition → comparison to traditional non-profits/co-ops → governance models (link `/docs/hybridVoting` etc.) → "DAO for non-crypto" framing → CTA `/create`

2. **How to start a worker cooperative without code (or lawyers)**
   - Target query: "how to start a worker cooperative", "no-code worker cooperative"
   - Outline: legal vs. structural cooperative → choosing voting/role models → setup walkthrough → CTA `/create`
   - Bonus: this is one of the few queries where "no-code" is a genuine high-intent buyer signal

### Sitemap & GSC discipline

- After each new post: bump `<lastmod>` (the generator already pulls from frontmatter date)
- Resubmit `sitemap.xml` in Google Search Console after every batch of new content
- Track in GSC Performance which queries gain impressions — let real data steer the next two posts

## Phase 5 — Next 60 days

### Comparison pages (highest-intent searches)

Each ~1,000 words, lives in `src/pages/compare/<competitor>.js` (new routes).
Comparison queries are bottom-of-funnel — the searcher already wants a DAO
platform and is choosing between options.

1. **Poa vs Aragon** — `/compare/aragon`
   - Side-by-side: governance models, treasury, role/permission, gas/onboarding, target user
   - Be fair (don't trash-talk Aragon); be specific where Poa actually differs (passkey onboarding, integrated tasks, hybrid voting)

2. **Poa vs Snapshot** — `/compare/snapshot`
   - Frame: "Snapshot is off-chain signaling; Poa is on-chain governance with the same UX simplicity"
   - Side-by-side on: gas costs, finality, treasury control, task/role integration

3. **Poa vs DAOhaus / Moloch DAOs** — `/compare/daohaus`
   - Focus on no-code positioning and contribution-based voting as differentiators

Each comparison page wants `Product` schema with `Offer` (since Poa is free)
and ideally a small `FAQPage` block for "is Aragon better than Poa?"-style
queries (3-4 Q&As each).

### Case study pages (social proof + content depth)

`/case-studies/<org-slug>` — 1 page per featured org. Pick the 2-3 most
photogenic organizations using Poa today. Each page wants:

- Article JSON-LD with `mentions` pointing at the organization
- Real numbers (member count, treasury size, # of proposals run)
- Quote from a founder/organizer
- Cross-link from `/explore` (featured-org carousel)
- Cross-link from the `/use-cases/*` cards (when those exist — see below)

## Phase 6 — Next 90 days

### Dedicated /use-cases/* pillar pages

Earlier scope decision was "expand cards on landing, no new routes" — that
held us back from ranking for high-intent queries like "DAO for student
organizations" or "DAO platform for worker cooperatives." Once Phases 4-5
land, revisit this:

- `/use-cases/student-organizations` (~1,500 words)
- `/use-cases/worker-cooperatives` (~1,500 words)
- `/use-cases/open-source-projects` (~1,500 words)

Each pillar page absorbs the corresponding landing-page card's tagline as its
H1 and expands to a full use-case story: who the user is, what their current
tools fail at, how Poa fits, screenshots, a case study link if available,
related FAQ. Cross-link from the landing-page cards (currently linking to
relevant doc pages) and from the navigation.

### Content marketing rhythm

- Aim for 1 blog post / 2 weeks once Phase 4 is done
- Topic cadence: alternate between educational (top-of-funnel) and tactical
  (mid-funnel) — e.g. "how does contribution-based voting work" alternating
  with "how Co-op X used Poa to run their first all-member vote"

## Always-on monitoring

| Tool | What to watch |
|---|---|
| Google Search Console — Performance | Which queries surface impressions; CTR by page; click-through on the FAQ rich result |
| Google Search Console — Coverage | Sub-pages indexed (current state: only / is indexed) |
| Google Rich Results Test | Validate Organization, SoftwareApplication, FAQPage, HowTo, BreadcrumbList, TechArticle schemas after every deploy |
| Lighthouse SEO audit | Target 100/100 on every public page after every change |
| `site:poa.box` query | Manual check every 2 weeks — confirm new pages get indexed within ~14 days |

## Infrastructure follow-ups (Hudson)

Carried forward from the earlier audit — not blocking, but compounds value:

1. **Cloudflare** — finish disabling the managed robots.txt so the repo's
   robots.txt (with sitemap pointer + AI-bot blocks + CCBot allow) is served.
2. **Cloudflare apex/www redirect (DONE).** Redirect direction flipped from
   `poa.box → www.poa.box` to `www.poa.box → poa.box`. The Cloudflare Worker
   in `cloudflare-worker/worker.mjs` enforces this at the edge, and every
   canonical / OG / JSON-LD URL the code emits already points at the apex.
   Trailing-slash normalization in `SEOHead` also fixed (canonicals now end
   with `/` so the `/docs/AlphaV1`-style 308 redirects in GSC clear out).
3. **Google Search Console** — submit `https://poa.box/sitemap.xml`, request
   reindex on the 7 priority pages (`/`, `/about`, `/docs`, `/docs/AlphaV1`,
   `/docs/contributionVoting`, `/docs/hybridVoting`, `/explore`).
4. **Inbound links** — submit Poa to DAO directories (DAO Central, DeepDAO,
   etc.) and ask any org currently using Poa to link their `/about` to
   `https://poa.box`. Brand mentions in long-form newsletters / community
   posts compound trust faster than any on-page work.

## What we deliberately deprioritized

These showed up in the audit but didn't make the cut for the May 2026 pass:

- **400-word visible intro on `/create`** — the page is a full-screen wizard
  and a tall content block would hurt conversion. We added `HowTo` JSON-LD
  to capture the rich result without the visible copy.
- **Renaming the brand to "Poa.box"** — user rejected this. Brand stays
  "Poa"; "poa.box" appears as alternateName / domain reference only.
- **Replacing "community-owned organization" with "DAO" in primary copy** —
  intentional positioning. "DAO" appears as a secondary keyword in subheads,
  FAQ, use-case copy, schema. The primary identity is "community-owned
  organization."
- **Core Web Vitals / performance** — separate audit. Hero framer-motion
  animations may impact LCP; revisit if Lighthouse SEO is hurt by perf score.
