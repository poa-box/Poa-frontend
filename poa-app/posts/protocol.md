# Protocol dashboard

The dashboard at `/protocol` is a live, public view into the shared infrastructure that every Poa organization runs on. It is open to anyone. You do not need to be a member of an organization. You do not need to be signed in. You do not need to know what a Poa organization is. It just shows, in real time, what the protocol is doing across every supported chain.

The point of it is verifiability. We make a lot of promises about how Poa works. That no admin can override your community. That your treasury keeps working even if we disappear. That fees get covered automatically for most organizations. The dashboard is where you can check those promises against actual numbers.

## What you see on the page

The dashboard is broken into sections:

- **Stats.** Total organizations deployed. Total member accounts. Total chains with active orgs. Total beacon-supported features. Total transactions sponsored to date. The high-level "how big is Poa right now" view.
- **Gas usage.** Total gas spent on member-facing transactions, broken down by chain. This is how much the protocol has covered on members' behalf. Joins. Votes. Task claims. Treasury transfers.
- **Infrastructure.** Addresses of the core contracts on every supported chain. The org deployer, the registry, the paymaster hub, the account registry. Useful if you want to verify that the addresses your org is calling are the canonical ones.
- **Solidarity fund.** Current balance of the shared fund that pays gas on members' behalf. Replenishment events, allocation policy, percentage of recent transactions sponsored versus self-funded.
- **Sponsorship.** Operational metrics for the paymaster. Success rate, latency, recent rejections. The "is gas sponsorship healthy right now" view.
- **Beacon.** Protocol upgrade history. When core contracts were upgraded, what changed, and which orgs are running which version.

## Why this is public

Nothing about Poa's infrastructure is secret. You can read every contract on every chain we deploy to. You can query the [subgraph](/docs/TheGraph). You can verify any individual transaction. The dashboard is the friendly summary of all that. Most people do not want to query a subgraph themselves, so we render the answers.

A few specific things people use it for:

- **Treasurers** verify how much gas their org is consuming and whether sponsorship is keeping up.
- **Org founders** check the current solidarity fund balance before launching, since that determines whether new members can join without paying gas themselves.
- **Curious members** poke at the numbers to understand what is actually happening on-chain when they do things in their org.
- **Auditors and researchers** independently verify our public claims about protocol health.

## A worked example: checking whether your org's gas is being sponsored

You are a treasurer setting up a new org. You want to know: when my members vote and claim tasks, is the protocol covering gas, or are they each going to need to put a few cents on the chain?

1. Open `/protocol` and scroll to the Solidarity fund section.
2. Check the current balance and the recent sponsorship rate. If the balance is healthy and the success rate is high, you are good. Your members will not pay gas.
3. Cross-reference the Infrastructure section. The paymaster hub address on your org's chain is what your org's contracts will be calling.
4. After your org has been running a few weeks, the Gas usage panel will show your share of protocol-wide consumption.

For the full mechanics of how sponsorship works, see [gas sponsor](/docs/gas-sponsor).

## How Poa is built (the open-source stack)

Everything Poa does is open source. The whole stack lives under the [poa-box GitHub organization](https://github.com/poa-box) and ships under [AGPL-3.0](https://github.com/poa-box/POP/blob/main/LICENSE). Four repositories run the whole product:

| Repo | What it is |
| --- | --- |
| [POP](https://github.com/poa-box/POP) (Perpetual Organization Protocol) | The Solidity contracts. Foundry, AGPL-3.0, upgradeable via switchable beacons. Defines orgs, voting, vouch-based roles, tasks, education, treasury, agent identity. Architecture overview lives at [`docs/POP_OVERVIEW.md`](https://github.com/poa-box/POP/blob/main/docs/POP_OVERVIEW.md). |
| [subgraph-pop](https://github.com/poa-box/subgraph-pop) | The Graph indexer over POP. Every list, dashboard, search, and agent query in the ecosystem reads from here. Hosted on The Graph Studio at slugs `poa-arb-v-1` (Arbitrum) and `poa-gnosis-v-1` (Gnosis). |
| [Poa-frontend](https://github.com/poa-box/Poa-frontend) | The Next.js web app you are reading this in. Static-rendered, deployed to IPFS via Pinata, fronted by a Cloudflare Worker that maps `poa.box` to the latest CID. |
| [poa-cli](https://github.com/poa-box/poa-cli) (`pop`) | Terminal-native interface to everything POP can do, plus an autonomous-agent framework. ERC-8004 agent identity, EIP-7702 gas sponsorship, Helia and Automerge CRDT brain files synced over libp2p-gossipsub. The CLI is how non-web clients (scripts, bots, agents) interact with the same protocol. |

If you want to verify a claim the dashboard makes, the chain is straightforward. The dashboard reads subgraph-pop, which indexes events emitted by POP contracts on each chain. Every number you see traces back to a transaction you can look up on a block explorer.

## How it works under the hood

- **Everything you see is read from public data.** No private API, no "trust us." We could not hide a number on this page if we wanted to. You could rebuild the same dashboard yourself by reading the public record directly. The [`pop`](https://github.com/poa-box/poa-cli) command line is one way to do exactly that.
- **Upgrades are opt-in per org.** When Poa ships an update to a feature your org uses, your community can take it or stay on the current version. The Beacon section of the dashboard shows who is on what version. No one is force-updated.
- **All the code is open.** The pieces behind the numbers on this page are at [poa-box/POP](https://github.com/poa-box/POP) under AGPL-3.0. Detailed design notes for the more involved parts are in the repo's docs folder. For example, the shared-fund mechanism is documented at [`docs/PAYMASTER_HUB.md`](https://github.com/poa-box/POP/blob/main/docs/PAYMASTER_HUB.md).

## Related reading

- [Gas sponsor](/docs/gas-sponsor). How transaction costs get covered
- [Cross-chain architecture](/docs/cross-chain-architecture). Why the protocol runs across multiple chains
- [The Graph](/docs/TheGraph). The indexing layer the dashboard reads from
