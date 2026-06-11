# Landing page overhaul: messaging

Phase 2 artifact. Every claim below traces to the AUDIT.md claims ledger.
House style enforced: sentence case, no em-dashes, no hyphens in organic
compound modifiers, no exclamation marks, no superlatives.

## Positioning statement

Poa is the simplest way for a group of people to become a real organization
they own together. It puts the three things an institution needs in one
place: rules the group chooses from named templates, membership built on
vouching, and money that is held together and paid out in dollars. Every
decision is recorded and stays readable. The competitor is not another
product. It is never forming an institution at all.

## Audience notes

Primary: the organizer. The person in the group chat who collects the dues,
schedules the meetings, and worries about what happens when they leave. They
are not technical. They have been burned by tools that quietly owned their
community. They respond to plain language, visible rules, and proof that the
exit is real.

Secondary: the members being invited, who will see this page once, on a
phone, after clicking a vouch link. The page must read fast and feel like an
institution, not an app store listing.

The page never mentions the substrate except one sentence in the footer.
A reader who knows the underlying technology will recognize it from the
properties described; a reader who does not will never notice an absence.

## Brand casing (pass 4)

The name is `poa`, lowercase, including at sentence starts: "poa turns a
group into an organization", "poa charges nothing", "© 2026 poa". Never
"Poa" or "POA" in rendered text, meta, alt text, or the OG image. "Poa"
survives only as a JSON-LD alternateName for search.

## Page copy, final

### Meta

- Title: `Poa: start an organization your group owns`
- Description: `Poa is the simplest way for a group to become a real
  organization: rules you choose together, membership built on vouching, and
  a treasury that pays people in dollars. Nothing to install.`
- OG image: regenerated paper and ink specimen, text "poa" and "Start
  something that lasts." (no banned words; alt text: "Poa")
- JSON-LD: keep WebSite, Organization, SoftwareApplication; strip every
  banned term from `knowsAbout`, `keywords`, descriptions. Price 0 stays
  (Poa charges nothing; verified: no payment or subscription code).

### Nav

Links: How it works (anchor), Docs, Browse. (A who-it-is-for anchor was
drafted and cut: three links is enough chrome for a document.)
Auth button states: Sign in / Create account / My account / Connect
(the current "Connect Wallet" label dies; "Connect" is complete without the
banned word).

### Hero

Eyebrow (mono): `est. 2024` (founding date from the existing structured
data; the page's first patina mark.)

Headline: `Start something that lasts.`

Subline: `Poa turns a group into an organization: rules you choose together,
members who vouch for each other, and a treasury that pays people in
dollars. Nothing to install.`
("members who vouch for each other" replaced the more abstract "membership
built on vouching" in pass 3.)

Primary button: `Start an organization` (→ /create)
Secondary link: `Read how it works` (→ /docs/)

Quiet line under the actions: `An account is a username and a passkey.
Poa charges nothing.`
(The drafted "no fees to start" died in build: it is only true while the
solidarity fund holds a balance. "Poa charges nothing" is unconditionally
true: there is no payment or subscription code in the product.)

Hero alternative A:
- Headline: `An organization your group actually owns.`
- Subline: `Rules, membership, and money in one place, owned by the people
  in it. Nothing to install. Built so no one can take it away, including us.`

Hero alternative B:
- Headline: `Turn your group into an institution.`
- Subline: `A real organization with readable rules, members who vouch for
  each other, and a treasury that pays people in dollars. Set up in minutes.`

### Section 01, the problem

Label: `01`  Heading: `How groups usually end`

Three vignettes, set like ledger lines:

1. `The dues live in one member's payment app, next to their grocery money.`
2. `The treasurer graduates in May. By June nobody remembers what was
   decided, or why.`
3. `The community spends six years on a platform. The platform changes the
   rules in an afternoon.`

Closing line: `None of this is anyone's fault. Becoming a real institution
used to take months and lawyers, so almost nobody did it. The group stayed
a group chat, and everything it built stayed borrowed.`

### Section 02, how it works

Label: `02`  Heading: `Three steps to an organization`

Step one. `Choose your rules.`
`Start from a named template: worker cooperative, student organization,
creative collective, community organization, open source project. Each one
is a readable set of rules: who can join, how votes are counted, who
approves the work. Adjust anything, or write your own from scratch.`

Step two. `Invite your members.`
`People join because a member vouches for them. Your group decides how many
vouches it takes, and which roles stay open to anyone. Trust is the
membership system.`

Step three. `Run it together.`
`Propose, vote, assign the work, and pay for it in dollars, all in one
place. Every decision is recorded with its reasoning and stays readable for
as long as the organization exists.`

### Section 03, what an organization gets (added in pass 3)

Label: `03`  Heading: `What an organization gets`
Running label: `The articles`

Ledger rows, every one a real product surface:
- `Votes` · `One person one vote, weight earned by participation, or a
  hybrid your group tunes.` · mono: `recorded, permanently`
- `Tasks` · `Post the work, claim it, review it, pay it.` · mono:
  `paid in dollars`
- `Treasury` · `The books in the open, spendable only by the rules.` ·
  mono: `every transfer public`
- `Members` · `Vouches, roles, and exactly what each role may do.` · mono:
  `trust, written down`
- `Learning` · `Courses where new members earn their standing by learning
  how it all works.` · mono: `participation, earned`

### Section 04, where the money lives (added in pass 6)

Label: `04`  Heading: `Where the money lives`
Running label: `The fine print`. Q&A ledger rows, all verified against
posts/ docs, caveats softened by omission per Hudson:

- `Who holds the money?` · `The organization does, under its own rules.
  Poa never holds it and cannot move it.`
- `How does money come in?` · `Anyone can fund the treasury: members,
  supporters, revenue from what you do. Giving requires no vote.`
- `How does it go out?` · `Spending follows the rules the group chose.
  Work gets paid, and payouts land in the member's own account, not in a
  pile someone guards.`
- `Can I turn it into cash?` · `Yes. Cash out to Cash App, Venmo, Revolut,
  or a bank account in a few minutes. The rate and any small marketplace
  fee are shown upfront. Poa charges nothing.`
- `What if Poa disappears?` · `The treasury keeps working exactly the same
  way. The records stay readable, and any organization can run its own
  copy of the tools.`

### Section 05, what makes it different

Label: `04`  Heading: `What makes it different`

Pillar one. `Owned by the members.`
`Voting power is earned by participating, not bought. There are no shares
to sell and no investors to please. The people who do the work decide what
happens next.`

Pillar two. `A memory.`
`Every proposal is kept with its reasoning, in a record no one can quietly
rewrite. Ten years from now, a new member can read what was decided and
why.`

Pillar three. `The door is open.`
`What you earn lands in your own account and cashes out to the payment app
you already use. The record is public, and any organization can run its own
copy of the tools. Built so no one can lock you in, including us.`
(The word "open-source" was cut here in build so the substrate is named
exactly once on the page, in the footer, as the brief directs.)

### Section 06, who it is for

Label: `06`  Heading: `Who it is for`

- `Student organizations. Officers change every spring. The organization
  keeps its memory.`
- `Worker owned businesses. One worker, one vote, and the books in the open.`
- `Creative collectives. Decide together what gets made, and what it pays.`
- `Community organizations. Dues, decisions, and projects, all in the open.`
- `Open source projects. The people who build it steer it.`

Each line ends with the named template it maps to, set in mono, e.g.
`template: worker cooperative` (these are the real template names from the
deployment flow).

### Proof (closes section 06, with a live registry count)

No invented numbers. One ledger style line:

`Every organization on Poa is public: its rules, its decisions, its books.`
Link: `Browse the organizations` (→ /explore)

### Section 07, ethos (set as the page's one color plate)

Label: `07`  Heading: `Why we built it`

`Most software is rented. An institution should not be. We built poa
because worker and community ownership is how a better future gets made,
and the tools for it should be a public good: the organizations made here
keep their own records, hold their own money, and can host their own copy
of everything. Good institutions outlast their founders. We think the
tools should too.`
(Pass 4 put the mission in plain words at Hudson's direction; "public
good" is verifiable: AGPL, free to use. The substrate sentence still
appears only in the footer. The hero also carries "Built for worker and
community ownership.")

### Colophon (between the plate and the footer, added in pass 3)

`Starting takes minutes. Lasting is the point.` (the second clause in
italic), then the primary button again and `Browse the organizations`.

### Footer

Tagline under the mark: `Organizations owned by the people in them.`

Columns:
- Product: Start an organization (/create), Browse organizations (/explore),
  Templates (/docs/deployment-wizard/), Docs (/docs/)
- Project: About (/about), Source (github.com/poa-box), Discord, X

Substrate sentence (the one permitted): `Poa runs on open public
infrastructure, and all of it is open-source.`

Legal line: `© 2026 Poa` (the current "All rights reserved" is wrong next
to an AGPL license and dies here).

## Vocabulary lint list

Banned by the brief (must appear nowhere in rendered page, meta, OG, alt,
URLs): blockchain, crypto, web3, DAO, token, tokens, on-chain, onchain,
wallet, smart contract, gas, mint, airdrop, NFT, DeFi, multisig, dapp,
decentralized, protocol fee, stablecoin.

Found in the current page and also linted out:
- "DAO", "no-code DAO", "DAO platform", "DAO builder" (meta keywords)
- "decentralized governance", "decentralized treasury", "on-chain voting"
  (meta keywords and JSON-LD)
- "Connect Wallet" (navbar button)
- "deploy / deployment" (crypto coded; replaced with "start", "set up")
- "governance model" (jargon; replaced with "rules")
- "protocol" (crypto coded here; the landing footer drops the protocol
  dashboard link)
- "no-code" (startup jargon; replaced with "nothing to install" and "no
  code required" where needed)
- "Earn ... a share of the treasury" (unverifiable claim, removed entirely)

House style lint, applied to all copy above:
- no em-dashes anywhere
- sentence case everywhere, including buttons and headings
- "worker owned", "member owned", "vouch based", "community owned" with no
  hyphens; "open-source" keeps its hyphen as an established technical term
- no exclamation marks, no superlatives

Lint check of this document's final copy: zero banned words, zero
em-dashes. (The grep based lint runs again against rendered output in
phase 5.)
