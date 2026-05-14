# Direct democracy voting

Direct democracy is the simplest voting model a Poa organization can choose. One member, one vote. Equal weight, every time, no exceptions. It doesn't matter how long you have been a member. It doesn't matter how much you have contributed. It doesn't matter how much capital you brought in. Every voice counts the same.

It is one of three voting models a community-owned organization on Poa can use. The other two are [contribution-based voting](/docs/contributionVoting) and [hybrid voting](/docs/hybridVoting).

## How it works

When a proposal opens, every member of the organization gets exactly one vote. The proposal needs to meet two thresholds the community sets in advance:

- A **quorum**, the minimum number of members who must cast a vote for the result to count.
- A **threshold**, the share of cast votes that need to land on the same side. Usually a simple majority. Sometimes a supermajority.

Both numbers are decided by the community at organization creation. Both can be changed later through the same governance process.

There are no tokens to accumulate. There is no participation history that weights influence. There is no rich-get-richer dynamic. One member, one vote.

## A worked example

A 30-member student organization sets quorum at 50 percent (15 votes) and threshold at simple majority (more yes than no). A member opens a proposal: "Should we allocate this semester's leftover budget to a spring break service trip?"

- Twenty-two members cast a vote. Quorum is met.
- Fourteen vote yes. Eight vote no.
- The proposal passes.

The eight members who didn't vote at all have no effect on the outcome. Direct democracy counts cast votes against the threshold, not the full membership.

## Why it works

Direct democracy is the right tool when the community is small enough and engaged enough that one-person-one-vote actually represents the will of the group. It is especially well-suited to:

- **Tight-knit communities** where every member is roughly equally invested in the outcome.
- **Student organizations** running meetings. The cultural expectation is already one person, one vote.
- **Informal community polling.** Even organizations using contribution-based voting for binding governance often run direct-democracy polls to gauge preferences on non-binding questions.
- **Newly-formed organizations** that haven't accumulated enough contribution history to weight by anything else yet.

The strength of this model is its legitimacy. Nobody can argue the vote was rigged in favor of insiders, because there are no insiders. Every member's voice carries the same weight.

## When it doesn't fit

There are real limits.

- **It doesn't scale gracefully** to organizations with hundreds of low-engagement members. A small active minority can dominate any vote that happens to align with their attention.
- **It is vulnerable to free riders.** People who join for benefits but don't contribute still wield the same governance power as people doing the work.
- **It is vulnerable to capture** by anyone who can recruit enough members fast enough. There is no meritocratic weight to slow that down.
- **It can produce tyranny of the majority outcomes** when a slim majority makes decisions that affect a minority who care much more about the outcome.

If your community values rewarding active contribution, [contribution-based voting](/docs/contributionVoting) is a better fit. If you want both, base equality plus a contribution-weighted multiplier, see [hybrid voting](/docs/hybridVoting).

## Secondary use: informal polling

Even in organizations using contribution-based or hybrid voting for binding governance, direct democracy is the right tool for **non-binding polls**. Want to know what color the new logo should be? Run a one-vote-per-member poll. Want to gauge interest before formally proposing a new working group? Same thing.

Using direct democracy for polling alongside other voting systems is a nice complement. Everyone's voice is heard, even when binding governance runs on a different mechanic.

## How Poa implements it

This is the simplest of the three voting systems. When a proposal opens, the platform takes a snapshot of the current member list. Each member gets one vote. The result is tallied against the minimum participation and approval threshold your community agreed on. Every vote and every outcome is public and verifiable.

The code is open source at [poa-box/POP](https://github.com/poa-box/POP) under AGPL-3.0. You set up direct democracy when you create your organization through the [create flow](/docs/create). No code required, just choices in the wizard.
