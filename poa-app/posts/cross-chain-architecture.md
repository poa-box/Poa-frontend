# Cross-chain architecture

Poa runs across several blockchains. From a member's perspective this is mostly invisible. You sign in with your passkey. You act inside an org. The right chain handles your transactions. But understanding the layout is useful for treasurers, for founders deciding where to deploy, and for developers integrating with the platform.

This doc covers which chains are involved, what each one does, and how an account on one chain interacts with an organization deployed on another.

## The chains, and what each one is for

Poa is deployed on six chains. Two production, four testnets:

- **Arbitrum One** (chain ID 42161). The **identity home chain**. Your account, your username, and the global account registry live here. Every member, on every organization, has their identity rooted on Arbitrum. Mature. Account-abstraction-friendly. Low fees.
- **Gnosis Chain** (chain ID 100). The **default org deploy chain**. New organizations deploy here unless they choose otherwise. Fast. Cheap. Stable-coin friendly. The right fit for day-to-day activity inside an org (votes, task claims, treasury operations). xDAI is the native gas token.
- **Sepolia** (chain ID 11155111). Ethereum's primary public testnet.
- **Base Sepolia** (chain ID 84532). Coinbase's L2 testnet. Also used as the destination side of the cashout pipeline during development.
- **Optimism Sepolia** and **Arbitrum Sepolia.** Additional testnets for protocol development.

The list of deployed contracts per chain is the source of truth in [poa-box/POP](https://github.com/poa-box/POP). The frontend reads them via `poa-app/src/config/networks.js`. Future chains can be added without re-deploying members' existing organizations.

## How an account on Arbitrum participates in an org on Gnosis

This is the most common scenario. A member's account home is Arbitrum, but they are a member of a worker co-op deployed on Gnosis. How does that work?

The answer is that the smart account address derived from a member's passkey is **the same on every chain**. Because the address is computed deterministically (`CREATE2` with a salt derived from the passkey's public key), the same passkey produces the same address on Arbitrum, on Gnosis, on Base, anywhere we deploy infrastructure.

So:

1. The member's account is deployed lazily on each chain they take an action on. The first time they vote in a Gnosis-based org, the UserOp's initialization code deploys the account at the deterministic address on Gnosis.
2. From the user's perspective, there is nothing to do. The smart account "is on Gnosis" once a Gnosis-based action is needed.
3. Their username, registered on Arbitrum, is mirrored to Gnosis the first time they need it there, typically as part of the same UserOp that deploys the account.

For the mechanics of how the account is the same address across chains, see [account abstraction](/docs/account-abstraction).

## How treasury flows cross chains

Treasury operations happen on the org's home chain (usually Gnosis). When a member wants to cash out USDC earned from an org's treasury, the [cashout flow](/docs/cashout) bridges that USDC from the org's chain to Base (where the P2P fiat marketplace lives) and then to the member's payment app.

Bridging is handled by Bungee, which routes through the most efficient bridge available for the route. Most cross-chain USDC moves settle in seconds.

For deposits, anyone can send tokens directly to the treasury's address on the org's deploy chain. Cross-chain deposits are not currently automatic. If you have USDC on Arbitrum and want to deposit to a treasury on Gnosis, you would bridge it yourself (using Bungee directly, or any bridge of your choice) and then send to the treasury address.

## Picking a chain when creating an organization

In the [deployment wizard](/docs/deployment-wizard) you will be asked where to deploy. The defaults are:

- **Gnosis Chain.** Recommended for most new orgs. Lowest fees, fastest finality for day-to-day operations.
- **Arbitrum.** Also supported. Slightly more expensive operations but better integrated with broader DeFi if your org plans to hold assets beyond stable-coins.
- **Sepolia / Base Sepolia.** For testing. Do not deploy your real org here.

What is different across chains:

- **Gas costs.** Gnosis is cheapest. Arbitrum next. Sepolia / Base Sepolia are free (test value).
- **Native token.** Gnosis uses xDAI as gas. Arbitrum uses ETH. With sponsorship enabled (the default), members never see this. The [paymaster](/docs/gas-sponsor) covers it.
- **Block explorers.** GnosisScan vs Arbiscan vs Sepolia / Base Sepolia equivalents. All show the same contracts in slightly different UIs.

You cannot change an org's home chain after deploy. If your org outgrows the chain it started on, the migration path is to deploy a fresh org on the new chain and migrate membership over. Non-trivial but possible.

## How it works under the hood

Mechanics:

- **Deterministic addresses.** The `PasskeyAccountFactory` contract (source in [poa-box/POP](https://github.com/poa-box/POP)) uses `CREATE2` with a salt derived from the passkey's credential ID plus public key. Calling `getAddress(...)` on any chain returns the same address as long as the factory's bytecode and the inputs match.
- **Cross-chain factory consistency.** This relies on the `PasskeyAccountFactory` being deployed at the same address on every supported chain, or with parameters that produce the same `CREATE2` output. The protocol guarantees this. The deployment process verifies it.
- **Per-chain infrastructure.** Each supported chain has its own deployment of the core contracts (`OrgDeployer`, `OrgRegistry`, `PaymasterHub`, `UniversalAccountRegistry`, `PasskeyAccountFactory`, `PoaManager`). Their addresses are listed on the [protocol dashboard](/docs/protocol).
- **Subgraph per chain.** [subgraph-pop](https://github.com/poa-box/subgraph-pop) has two production deployments. `poa-arb-v-1` for Arbitrum. `poa-gnosis-v-1` for Gnosis. The frontend queries the right one based on the org's chain. Cross-chain views query both and merge client-side.

## Related reading

- [Account abstraction](/docs/account-abstraction). How cross-chain identity actually works
- [Protocol dashboard](/docs/protocol). Addresses and stats per chain
- [Cashout](/docs/cashout). The canonical cross-chain operation
