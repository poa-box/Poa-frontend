# Hybrid voting

Hybrid voting combines two ways of weighting a community's vote into one tally. Part of the result comes from one-member-one-vote democracy. The other part comes from voting power earned by contribution. The community picks the ratio. Eighty-twenty. Fifty-fifty. Anything in between, or anything at the edges.

It is one of three voting models a community-owned organization on Poa can choose. The other two are pure [direct democracy](/docs/directDemocracy) and pure [contribution-based voting](/docs/contributionVoting). Hybrid is for organizations that want both legitimacy and meritocracy in the same tally.

## What gets blended

Two classes of votes are cast at the same time on the same proposal:

- **The direct-democracy class**, where every member's vote weighs the same.
- **The contribution-weighted class**, where each member's vote weighs in proportion to their participation tokens.

The two tallies are combined according to the weights your community chose at setup. The combined score is then compared to a configurable threshold.

## A worked example

A worker cooperative uses an 80/20 hybrid: 80 percent of the final score comes from contribution-weighted voting, 20 percent from direct democracy. The cooperative is choosing whether to take on a new client project.

The contribution-weighted side answers the question that matters most: are the people who will actually do the work willing to do it? The direct-democracy side answers the second question: does the broader community endorse pursuing this kind of work in the first place?

When the two halves agree, the proposal passes cleanly. When they disagree, the cooperative learns something important. The blend forces the community to think about both questions at once.

## Why use it

Hybrid voting picks up the strengths of both pure models while papering over the weaknesses of each.

- **From direct democracy**: legitimacy. Every member is heard, every vote counts, no one is locked out for not contributing yet.
- **From contribution-based voting**: meritocracy. The people building the organization have proportionate say in where it goes.
- **From the combination**: an honest signal when the two views diverge. The community can see that and respond.

The ratio is itself a governance question. A new cooperative might lean heavier on direct democracy to build trust. A long-running open-source project might lean heavier on contribution-weighting to keep its roadmap accountable to the people shipping the work. The right answer is whatever the community votes for.

## When it doesn't fit

Hybrid is overkill if your community is small enough and uniform enough that pure direct democracy already works. It can also be the wrong choice if your contribution-tracking is sloppy. A blended vote that depends on participation tokens needs a clear, agreed list of what work counts and what it earns. If that list isn't trusted, neither will be the vote.

## How Poa implements it

When a proposal opens, the system takes two snapshots: the current member roster and every member's participation-token balance at that exact moment. Each member's contribution to the final tally is split into two halves: their one-member-one-vote share plus their contribution-weighted share, in whatever ratio your community chose. The combined result is then checked against the agreed minimum participation and approval threshold.

All of this is open and verifiable. The code is at [poa-box/POP](https://github.com/poa-box/POP) under AGPL-3.0. You set up hybrid voting when you create your organization through the [create flow](/docs/create). The ratio between the two halves can be changed later by a community vote.

## Related reading

- [Direct democracy voting](/docs/directDemocracy). The equal-vote half on its own
- [Contribution-based voting](/docs/contributionVoting). The merit-weighted half on its own
- [Roles and permissions](/docs/roles-and-permissions). Voting can also be weighted per role on top of either model
