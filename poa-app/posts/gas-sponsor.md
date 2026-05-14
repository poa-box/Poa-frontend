# Gas sponsorship and the solidarity fund

When a member of your organization votes on a proposal, claims a task, or joins for the first time, those actions cost a tiny amount in network fees. Typically fractions of a cent. Most communities do not want their members worrying about that, especially since most members will not be carrying anything to pay it with. So by default, Poa pays.

The mechanism is the solidarity fund. A shared pool of resources covers transaction costs on every supported chain. Most organizations opt in automatically during setup, get sponsorship for free, and never think about it again. This doc is for the times you do need to think about it.

## What sponsorship covers, and what it doesn't

Sponsorship covers the user-facing transactions members initiate inside an organization. That includes:

- Joining an organization
- Voting on proposals
- Claiming, submitting, and getting paid for tasks
- Completing learn-and-earn modules
- Triggering small treasury operations like accepting an approved distribution

It does not cover the transaction that originally deploys an organization (that one is funded once by whoever creates the org, since it is a much larger operation). It also does not cover treasury *outflows*. Treasury spending requires its own community vote, and the gas to execute the resulting transfer is paid from the treasury itself.

For an org that is actively using sponsorship, the practical experience is straightforward. Members never see a "gas fee" prompt. Voting is free. Claiming work is free. Joining is free.

## How the solidarity fund stays solvent

The fund is replenished from a few sources:

- **Protocol-level contributions.** Poa contributes to the fund as the platform operator.
- **Org-level top-ups.** Organizations that opt into sponsorship contribute a configurable amount during deployment, which seeds their portion of the fund.
- **Voluntary deposits.** Anyone (a generous member, a sponsor, a foundation) can top up the fund directly.

All of this is visible on the [protocol dashboard](/docs/protocol) in the Solidarity fund section. You can see the current balance, recent inflows and outflows, and the sponsorship success rate at a glance.

## When sponsorship isn't available

If the fund is depleted on a given chain, or if a specific transaction can not be sponsored for any reason, the system falls back to self-funded. The member pays the network fee themselves out of their own balance, like a regular wallet transaction. This is the exception, not the default. Most orgs running healthy sponsorship never hit the fallback. But it is the right fallback to have. Even if Poa as a company shut down, your organization still functions. Members just pay their own gas.

You can also configure a per-org override. Some orgs want to always self-fund (perhaps they are large enough to handle it from their own treasury), and that is a one-time setting during [deployment](/docs/deployment-wizard).

## A worked example

The Computer Science Co-op deployed two months ago with sponsorship turned on. In those two months:

- 47 members joined (47 sponsored transactions)
- 312 votes cast across 19 proposals (312 sponsored transactions)
- 84 task claims, with 78 approvals minting participation tokens (162 sponsored transactions)

Total: 521 sponsored UserOps. At average gas costs on the org's chain (Gnosis), that is a few dollars of total protocol expense. Members never saw a fee prompt for any of it.

If you want to see your own org's sponsorship draw, head to `/protocol`, find your org's chain in the Gas usage section, and you will see the running total.

## How it works under the hood

- **The fee is paid for the member before the action even runs.** When a member clicks "Vote" or "Claim," the system checks whether the action is one the shared fund covers and whether the fund has enough left. If yes, the fund pays the network fee on the member's behalf. The member never sees a wallet popup asking for gas.
- **Each kind of action is approved or refused on its own.** Joining is sponsored. Voting is sponsored. Claiming a task is sponsored. Spending from the treasury is not. That one comes out of the treasury itself, which the community already voted to approve.
- **If the fund cannot pay, the member pays.** This almost never happens for active orgs. But it is the safe fallback. Even if every shared fund went dry tomorrow, every org would keep working. Members would just see a small network fee on each action.
- **Open source and verifiable.** The sponsorship code is at [poa-box/POP](https://github.com/poa-box/POP) under AGPL-3.0. The detailed design is in [`docs/PAYMASTER_HUB.md`](https://github.com/poa-box/POP/blob/main/docs/PAYMASTER_HUB.md). The current balance and recent activity are on the [protocol dashboard](/docs/protocol).

## Related reading

- [Protocol dashboard](/docs/protocol). Where to check sponsorship health
- [Account abstraction](/docs/account-abstraction). The ERC-4337 mechanics that make this possible
- [Deployment wizard](/docs/deployment-wizard). Where you turn sponsorship on for your org
