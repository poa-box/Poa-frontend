# The subgraph that powers Poa

Every list view, every dashboard, every "what does this org look like right now" answer in Poa is a GraphQL query against a subgraph. The contracts emit events. The subgraph indexes them into queryable data. The frontend (and the [`pop` CLI](https://github.com/poa-box/poa-cli), and any tool you might build) reads from it. There is no separate backend server holding the data. The indexer is the only "API."

This is what lets a community-owned organization stay verifiable. The data is not ours to gatekeep. It is emitted on-chain by contracts in [POP](https://github.com/poa-box/POP), indexed by an open-source subgraph in [subgraph-pop](https://github.com/poa-box/subgraph-pop), and queryable by anyone.

## What gets indexed

About 25 contract types across the protocol. The full schema is in the subgraph repo. The high-level domains:

- **Organizations.** Every org deployed, with metadata, member count, description, logo CID.
- **Roles.** Role grants, revokes, vouches, claims, and the full role hierarchy.
- **Voting.** Voting classes, proposals, votes (hybrid voting, direct democracy).
- **Tasks and projects.** Creation, claims, submissions, approvals, payouts.
- **Education modules.** Creation, completions, payouts.
- **Treasury.** Balances, payment events, Merkle distributions.
- **Gas sponsorship.** Paymaster funds, sponsored UserOp counts.
- **Passkey accounts.** Creation events, factory registry.
- **Cross-chain coordination.** Identity bridging events, beacon upgrades.

## Where the queries go

The subgraph is hosted on **The Graph Studio** at two deployment slugs:

- `poa-arb-v-1` for Arbitrum One (the identity home chain)
- `poa-gnosis-v-1` for Gnosis (the default org-deployment chain)

The frontend automatically routes queries to the right slug based on the org's chain. For browse pages that need to look across every chain, it queries each subgraph separately and merges results client-side.

If you want to query directly, the endpoints are listed on the [protocol dashboard](/docs/protocol).

## Why a subgraph instead of a backend

Two reasons.

First: no data lock-in. If we shut down tomorrow, every organization's data would still be readable. The smart contracts keep running. The indexer keeps doing its job. Anyone could spin up a new frontend against the same data. The platform can be replaced. The underlying rails cannot.

Second: no private state. A traditional backend would have decisions, member rosters, and treasury logs in a database that only the platform can read. With a subgraph, every member can verify every claim the UI makes. The indexer's data matches what is on-chain. What is on-chain matches what the contracts say.

## Querying it yourself

You do not have to be inside the Poa app to read the data. The subgraph endpoints are public. A few things people do with this:

- **Custom dashboards.** Build your own view of your org's activity. The `pop` CLI does exactly this.
- **Notifications.** Poll the subgraph for new proposals or task submissions and pipe them into Discord, Slack, wherever.
- **Audit and research.** Examine governance patterns across the whole Poa ecosystem.

The full schema, queryable entity list, and event-to-entity mapping live in [subgraph-pop](https://github.com/poa-box/subgraph-pop). New deployments happen automatically on merges to that repo's main branch.

## Quirks worth knowing

A few things to keep in mind if you are building against the subgraph:

- **Composite IDs.** Subgraph entity IDs are `{contractAddress}-{numericId}`. Contracts expect just the numeric portion. The frontend's `services/web3/utils/encoding.js` has `parseTaskId`, `parseProjectId`, `parseModuleId` helpers for this round-trip. Wrong format produces silent contract reverts.
- **18-decimal wei.** Token amounts come back as raw 18-decimal wei strings, including for an org's Participation Token. Format with the helpers in `util/formatToken.js`.
- **Indexing latency.** The subgraph trails the chain by a few seconds. The frontend uses optimistic-update grace periods (15s in UserContext, 65s in TaskBoardContext) to mask this in the UI.
- **IPFS content references.** Some entities point at IPFS content (proposal bodies, education module content, org logos) via CID stored on-chain as `bytes32`. The frontend resolves CIDs through Pinata.

## Related reading

- [Protocol dashboard](/docs/protocol). The rendered front for everything the subgraph indexes
- [Cross-chain architecture](/docs/cross-chain-architecture). Why there are two subgraph deployments
- [Treasury management](/docs/treasury-management). Uses Merkle distributions, indexed by the treasury domain
