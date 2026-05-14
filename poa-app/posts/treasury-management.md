# Treasury management

Every Poa organization has a shared treasury. Think of it as a checking account that the members own together. Anyone can deposit. Nothing leaves without a community vote. Every transaction is visible to every member. And no outside party can freeze the funds or override a community decision. Not a bank. Not a payment processor. Not a platform admin.

This is the same idea covered in the FAQ. This doc is the reference for the treasurers and officers who actually have to set it up, fund it, spend from it, and verify what it is doing.

## The basics

The treasury holds one or more tokens. For most organizations that means a stable-coin, usually USDC. The treasury can also hold multiple tokens at once. USDC for member payouts. The organization's own participation token for governance accounting. Anything else the community has voted to accept.

Three things happen against a treasury:

1. **Deposits.** Anyone can send the treasury tokens. Members fund it. Supporters fund it. Revenue from organizational activities flows in. Deposits do not require a vote.
2. **Outflows.** Moving tokens out (to a member, to another address, to a paymaster, anywhere) always requires a community vote. The exact governance model is whichever one your org chose at creation.
3. **Allowances.** For one-time approved actions like a member cashing out their earned share, the treasury can grant short-lived signing approvals via Permit2 without needing a separate vote each time.

## A worked example

Bread & Roses Co-op generates revenue from delivery work. Revenue flows into the treasury as USDC.

At the end of each month, the co-op holds a community vote: "Distribute $4,800 from the treasury proportional to participation tokens earned this month." The proposal goes up via the standard governance flow ([direct democracy](/docs/directDemocracy), [contribution-based](/docs/contributionVoting), or [hybrid](/docs/hybridVoting), whichever the co-op uses). If it passes quorum and threshold, the treasury contract executes the distribution. Each member gets the share of $4,800 corresponding to their share of that month's participation tokens.

For a member who wants those USDC payments converted to fiat in their bank account, see [cashout](/docs/cashout).

## Proposing a treasury transfer

To propose moving tokens out:

1. Open a new proposal from `/voting` (or wherever your org puts the proposal flow).
2. Choose "Treasury transfer" as the action type.
3. Specify the token, the amount, and the recipient (or recipients, batch transfers are supported).
4. Add a description for context. This is what other members will read when they vote.
5. Submit. The proposal is open for voting per your org's governance rules.

If the proposal passes, the transfer executes automatically. If it fails or expires, no funds move.

## Verifying treasury history

Every deposit, withdrawal, and approval is recorded on-chain and indexed by the [subgraph](/docs/TheGraph). Inside Poa, the `/treasury` page shows you the full history with USD values. For independent verification, the [protocol dashboard](/docs/protocol) lets anyone (including non-members) see total funds across all Poa organizations. You can also query the subgraph directly to audit individual transactions.

This is the whole point of the "no third party can stop you" model. Anyone can verify what your community is doing. No one can interfere with it.

## How it works under the hood

- **Nobody outside the community holds the keys.** Not a bank. Not a payment processor. Not us. Spending takes a community vote. Full stop. If we shut down tomorrow, your treasury keeps working exactly the same way.
- **Big payouts are efficient.** When a vote approves paying many members at once (a monthly worker share, an end-of-period dividend, a grant round), the system records one summary of the whole payout. Each recipient then claims their share. The cost to pay 100 members is about the same as the cost to pay one.
- **One click per member-facing action.** A member who is owed a payout claims it in a single click. Behind the scenes the platform handles the signing in a way that does not ask them to do the same approval twice.
- **Open source.** The treasury code is at [poa-box/POP](https://github.com/poa-box/POP) under AGPL-3.0 for anyone who wants to read or audit it.

## Related reading

- [Cashout](/docs/cashout). Converting treasury payouts to fiat
- [Gas sponsor](/docs/gas-sponsor). How the protocol covers transaction costs
- [Task manager](/docs/task-manager). The source of participation tokens used for payout proportions
