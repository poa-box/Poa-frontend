# Landing page overhaul: audit

Phase 1 artifact. Everything below was verified by reading the code or running
the app on 2026-06-10. Citations are repo paths.

## Stack notes

- **Framework**: Next.js 14, pages router, JavaScript (not TypeScript),
  React 18. Static export (`output: 'export'` in `next.config.mjs`), deployed
  to IPFS (Pinata) behind a Cloudflare worker. `trailingSlash: true`,
  `images.unoptimized: true`. No server side anything.
- **Styling**: Chakra UI 2 with an inline theme in `src/pages/_app.js`
  (lines ~109-244). Custom palettes `coral`, `rose`, `amethyst`, `warmGray`;
  custom variants `glass`, `elevated`, `primary`. No semantic tokens. Global
  CSS in `src/styles/globals.css` (entrance animation classes `.poa-rise`,
  `.poa-fade`, `.poa-reveal`, all wrapped in
  `@media (prefers-reduced-motion: no-preference)`).
- **Fonts today**: Inter (heading + body) and Roboto Mono via Google Fonts
  `<link>` in `_document.js`. Nothing self-hosted; no font files in `public/`.
- **Landing page**: `src/pages/index.js` renders eight components from
  `src/components/landing/`: Navbar, HeroSection, ValuesSection, WhatIsPoa,
  UseCaseShowcase, FeatureCards, ClosingCTA, Footer (HowItWorks exists but is
  commented out).
- **Scope warning**: `Navbar.jsx` and `Footer.jsx` are shared. `/u`,
  `/protocol`, `/about` import both; `/explore` imports Navbar. Restyling them
  in place would leak into app routes. The overhaul therefore introduces new
  landing-only header/footer components and leaves `Navbar.jsx`/`Footer.jsx`
  alone.
- **SEO plumbing**: `src/components/common/SEOHead.jsx` (title, description,
  canonical, OG, twitter card, JSON-LD injection, default OG image
  `/images/poa_og.webp`). Sitemap generated at build from `posts/`.
- **Animation constraint** (from repo history, PRs #437/#438): anything above
  the fold must animate with pure CSS, never framer-motion (static export
  bakes `opacity: 0` into the HTML). Gradient-clipped text breaks on iOS
  Safari if any transform touches it. The new design uses no gradient text,
  and keeps the pure CSS pattern.
- **Commands**: `yarn dev:e2e-passkey` (agent default), `yarn build`,
  `yarn e2e:check`. No Prettier; no committed ESLint config (lint cannot run
  headless here). Node 20.10 via nvm, `yarn install --ignore-engines`.
- **Logo**: `public/images/poa_logo.png|webp` is black ink, lowercase
  typewriter-slab "poa" between two heavy rules inside a hand drawn box. It
  already looks letterpress. The current pastel gradient site fights the mark;
  the new direction agrees with it.

## Current page inventory (rendered 2026-06-10, screenshots in `shots/before-*`)

Sections in order: gradient hero ("Build Organizations Owned by the People Who
Run Them", purple to pink gradient text, two buttons), "Built for People, Not
shareholders" + concentric ring SVG, "From idea to organization in minutes" +
"Video coming soon" placeholder, "Made for how communities actually work"
(three use case cards), "Everything your community needs" (six feature cards),
"Ready to Build?" CTA band, dark footer.

Current meta is saturated with banned vocabulary: keywords include "no-code
DAO", "DAO platform", "DAO builder", "decentralized governance",
"decentralized treasury", "on-chain voting"; JSON-LD `knowsAbout` includes
"DAO governance", "On-chain voting", "Decentralized treasury management".
The visible copy is cleaner but Title Case throughout, marketing register
("Ready to Build?"), and includes an unverifiable claim ("Earn voting power
and a share of the treasury"). A "Video coming soon" placeholder ships to
production.

## Five true sentences about what a user can do today

1. A person can create an account with a username and a passkey (Face ID or
   fingerprint), with no money and nothing installed, because a solidarity
   fund sponsors the fees when it holds a balance
   (`src/components/passkey/SolidarityOnboardingModal.jsx`,
   `src/hooks/useSolidarityOnboarding.js`, gated on
   `solidarityBalance > 0` in `src/pages/index.js:61-64`).
2. A group can start an organization by choosing one of five named templates
   (Worker Cooperative, Open Source Project, Creative Collective, Community
   Organization, Student Organization) or building custom rules: each template
   sets roles, voting weights, and permissions before deployment
   (`src/features/deployer/templates/definitions/`).
3. New people join an organization either through an open role or by
   collecting vouches from existing members until a quorum the organization
   chose is met (`src/pages/join/index.js`, vouch links
   `/join?vouch=<address>&hatId=<id>`).
4. Members post, claim, submit, and review tasks, and approved work pays out
   in digital dollars (USDC and similar) and in participation credit that
   increases the member's voting weight; dollars can be cashed out to Cash
   App, Venmo, Revolut, or a bank account
   (`src/util/tokens.js`, `src/services/web3/domain/CashOutService.js`,
   `src/components/account/CashOutModal.jsx`, `posts/cashout.md`).
5. Every proposal is recorded with its title and description and stays
   publicly readable in the organization's voting history; voting can be one
   person one vote, participation weighted, or a hybrid of the two
   (`src/pages/votes/index.js`, `src/pages/voting-history/index.js`).

Bonus verified facts: an education hub pays participation credit for passing
quizzes (`src/pages/learn/index.js`); every organization is publicly browsable
(`/explore`); organizations can host the interface on their own domain (white
label, `posts/white-label-hosting.md`, live example in repo docs:
dao.kublockchain.com); the code is AGPL licensed (`LICENSE`, `package.json`).

## Claims ledger

Verifiable from the repo (safe to state):
- Five named templates plus custom; named roles per template.
- Vouch based joining with per-role quorums; open quick join roles.
- Free account creation with a passkey while the solidarity fund holds a
  balance ("free to start" stated without conditions is NOT safe; phrase as
  "nothing to install" + "no surprise fees" or describe the passkey flow).
- Task payouts in dollar denominated digital money; cashout to common payment
  apps and bank accounts (docs + working code).
- Voting power earned by participation (participation credit from tasks and
  education modules feeds hybrid voting weight).
- Permanent, public decision history with proposal descriptions.
- One person one vote, participation weighted, and hybrid voting.
- Open-source (AGPL); organizations can run the interface themselves
  (white label hosting).
- Browse every organization at `/explore`.

NOT verifiable (do not claim; cut or soften):
- "Surplus flows back to the people who created it" / any profit or revenue
  distribution mechanism. No code found. The current landing page's "share of
  the treasury" line dies in this overhaul.
- "Leave anytime with your records and your money." There is no leave/exit
  flow in the UI. What IS true: payouts land in the member's own account
  (theirs regardless of the org), history is publicly readable, and the
  software can be self hosted. The "door is open" pillar gets rebuilt from
  those true parts.
- A literal one page readable "constitution" document. Governance lives in
  contract configuration plus IPFS metadata, surfaced in the app. Copy says
  "rules" and "templates", not "constitution" as an artifact.
- Real usage numbers (org counts, member counts, founding org ledger entry).
  Nothing static in the repo; all counts are runtime subgraph queries. The
  proof section becomes a quiet link to `/explore` instead of numbers.

Needs Hudson (left as TODO(hudson) in DECISIONS.md):
- Whether to feature a real founding organization by name (e.g. the KU
  Blockchain deployment) with founded date as a ledger entry.
- Whether dropping the DAO/web3 SEO keywords from meta (required by the
  banned vocabulary rule) is acceptable against `SEO_ROADMAP.md`'s strategy.
