# Landing page overhaul: plan

## The mission, restated

Poa's landing page must convince a normal person, in ten seconds, that this is
the easiest way for their group to become a real organization that the members
themselves own. Not a product for people who already know the underlying
technology: a product for the club, the collective, the student org, the worker
owned shop that today runs on a group chat and one person's payment app.

The page has to transmit three concrete things Poa gives a group in one place:

1. A constitution: readable rules chosen from a small menu of named templates.
2. Membership: people join because an existing member vouches for them.
3. Money: a shared treasury, payments in dollars, surplus flowing back to members.

And one deeper promise: everything the organization decides is remembered and
cannot be quietly rewritten, and every member can leave with their records and
their money. No one, including the people who built Poa, can lock a group in.

The real competitor is not another product. It is never forming an institution
at all. The page sells durability and ownership, never the technology. The
substrate (open public infrastructure, open-source) is acknowledged at most
once, quietly, near the bottom.

The craft bar: a typography led, document like page. Warm paper, ink, one
accent. Serif display, mono for numbers and dates. Numbered sections, hairline
rules, generous margins. Almost no motion. Nothing decorative that does not
carry meaning. The page should read like a well set charter, not a SaaS launch.

Where this brief and the repo disagree, the repo wins on facts and the brief
wins on taste. Significant choices get recorded in DECISIONS.md. Facts I cannot
verify become TODO(hudson), never invented copy.

## Hard rules I am carrying through every phase

- Never fabricate: no invented stats, testimonials, logos, or press.
- No legal, tax, or financial claims.
- No roadmap promises: describe only what the code does today.
- Banned vocabulary is absolute (rendered page, meta, OG, alt, URLs):
  blockchain, crypto, web3, DAO, token(s), on-chain/onchain, wallet,
  smart contract, gas, mint, airdrop, NFT, DeFi, multisig, dapp,
  decentralized, protocol fee, stablecoin.
- No em-dashes anywhere in copy. No hyphens in organic compound modifiers
  ("member owned", "vouch based"). Sentence case everywhere.
- Scope is the landing surface and shared primitives it needs. The app and
  its routes keep working untouched.

## Phases and what each produces

- **Phase 0, plan.** This file.
- **Phase 1, audit.** `AUDIT.md`: stack notes (framework, styling, routing,
  tokens, fonts, commands), inventory of the current landing page, screenshots
  at mobile and desktop widths, five true sentences about what a user can do
  today (verified by reading product code), and a claims ledger: verifiable
  from the repo vs needs Hudson.
- **Phase 2, messaging.** `MESSAGING.md`: positioning statement, audience
  notes, complete copy for every section with two hero alternatives, and a
  vocabulary lint list (banned words plus any crypto coded terms found in the
  existing copy).
- **Phase 3, design spec.** `DESIGN.md`: palette as tokens, type and scale,
  spacing, grid, motion rules, component inventory, and every deviation from
  the brief's section 4 with reasons.
- **Phase 4, build.** The new page, implemented section by section with a
  commit per section. Extends the repo's existing patterns (Chakra theme
  tokens, pure CSS entrance rules in globals.css, SEOHead) rather than
  building a parallel system. Semantic HTML first. Mobile and desktop equals.
- **Phase 5, review loop.** Minimum two passes. Each pass: screenshots at
  375, 768, 1440; critique against the design direction; vocabulary lint of
  rendered output including meta and alt text; heading hierarchy, focus
  states, contrast, reduced motion. Pass two deletes more than it adds.
- **Phase 6, deliver.** `DECISIONS.md` (what the audit taught, decisions with
  rationale, before and after screenshots, TODO(hudson) list, what I would do
  next), a before and after gif, and a PR a busy person can absorb in one
  minute.

## Known repo facts already shaping the plan

- Next.js 14 pages router, JavaScript, Chakra UI 2, static export to IPFS.
  The landing page is `poa-app/src/pages/index.js` plus
  `poa-app/src/components/landing/*`.
- Entrance animation on the landing page must be pure CSS (`.poa-rise`,
  `.poa-reveal`, `.poa-fade` in `globals.css`): framer-motion above the fold
  bakes `opacity: 0` into the static export. Any animation I keep follows
  that pattern and respects `prefers-reduced-motion`.
- Current SEO copy and JSON-LD in `index.js` are saturated with banned
  vocabulary (DAO, decentralized, on-chain). Meta and structured data are in
  scope for the rewrite.
- A real product flow exists behind "Start an organization" (`/create`) and
  an explore page (`/explore`); the audit verifies what they actually do
  before any copy claims it.

## Artifact location

All overhaul artifacts live in `docs/landing-overhaul/` to keep the repo root
clean; screenshots go in `docs/landing-overhaul/shots/` (PNGs committed there
deliberately, small and few).
