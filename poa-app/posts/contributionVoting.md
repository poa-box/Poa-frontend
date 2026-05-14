# Contribution-based voting

Contribution-based voting gives voting power to the people doing the work. Members earn the right to vote by completing tasks the organization recognizes as work. The more you contribute, the more your vote counts. The less you contribute, the less.

It is one of three voting models a community-owned organization on Poa can choose. The other two are [direct democracy](/docs/directDemocracy) and [hybrid voting](/docs/hybridVoting). Each one has a clear use case. This one is for organizations that want governance to belong to the people building the organization.

## How participation tokens are earned

Every Poa organization has a task manager built into it. When a member finishes a task the organization has approved, **participation tokens** land in that member's account. They cannot be bought, sold, or given away. They are a record of what you have done for the community. Nothing more, nothing less.

Tasks can be anything the community decides to recognize as work. Running events. Writing code. Reviewing pull requests. Moderating. Treasury management. Documentation. Onboarding new members. Serving in a role. The organization decides which tasks award how many tokens through the same governance process that decides everything else.

## A worked example

Consider a worker cooperative with twenty members. The cooperative has approved a list of recognized tasks. Writing a blog post earns 10 PT. Completing a customer order earns 5 PT. Serving a one-month rotation as on-call earns 50 PT.

- Alice writes four blog posts and serves one on-call rotation. She earns 90 PT.
- Bob completes thirty customer orders. He earns 150 PT.
- Carla joined last week and has completed one order. She earns 5 PT.

When the cooperative votes on a proposal, say whether to allocate 10% of next quarter's revenue to a community grant fund, the votes weigh by participation token balance. Bob's vote counts for more than Alice's. Alice's counts for more than Carla's. The mechanic is simple: who is putting in the work.

## Why it works

Contribution-based voting solves a problem that traditional one-token-one-vote DAOs run into. Governance gets captured by whoever has the most capital, not whoever is most invested in the project's actual success. Contribution-based voting is particularly well-suited to:

- **Worker cooperatives** that want operational decisions made by active workers, not silent partners.
- **Open-source projects** where maintainers and core contributors should weigh in on roadmap more heavily than someone with one drive-by pull request.
- **Volunteer-run organizations** where skin in the game is measured in time, not in money.

This is what economic democracy looks like when it is built on something other than headcount or capital. The people doing the work are the people deciding what gets done.

## When it doesn't fit

There are tradeoffs. Honest ones.

- **New members have less power until they contribute.** A first-week voice is quieter than a third-year voice. In tight-knit communities this can feel exclusionary.
- **Token allocation is itself a governance question.** Deciding what work counts, and how much, has to be agreed up front, and continually maintained.
- **Free-rider resistance is not the same as capture resistance.** If a small group dominates contributions, they accumulate disproportionate power over time. Some organizations counter this with token decay or per-vote caps. The community is sovereign over its own anti-capture rules.

If your community values strict one-person-one-vote equality, [direct democracy](/docs/directDemocracy) is a better fit. If you want a blend (base equality plus a contribution multiplier), see [hybrid voting](/docs/hybridVoting).

## How Poa implements it

Under the hood, each organization has its own participation tokens. They cannot be sold or transferred between members. They can only be earned by completing approved work or finishing a learning module.

When a proposal opens, the system takes a snapshot of every member's balance at that moment. The snapshot is what counts toward the vote, not balances at the time votes are cast. That detail matters: it is what makes contribution-weighted voting resistant to last-minute token grabs. Nobody can rush around accumulating tokens after a proposal is already on the table.

All of this is open and verifiable. The code lives at [poa-box/POP](https://github.com/poa-box/POP) under AGPL-3.0. You set up contribution-based voting when you create your organization, no code required, just choices in the [create flow](/docs/create).
