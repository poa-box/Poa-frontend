# Cashout. Getting paid in real money.

When your organization decides to pay you (for tasks completed, a monthly distribution, a one-off reimbursement) the payout lands in your account as digital dollars. Useful. But most people want to spend it as the currency they normally use. The cashout flow turns those digital dollars into real money in the payment app you already have. Cash App. Venmo. Revolut. Your bank account. One click, no need to learn about exchanges.

This is one of the more involved flows in Poa, mechanically, because three separate systems hand off to each other to make it feel like one tap. Knowing the moving parts is useful in case anything goes wrong.

## The user experience

You head to the cashout page. You choose how much to cash out. You pick the payment app you want to receive in. You confirm. A few seconds later, you have a peer in a peer-to-peer marketplace ready to send you fiat in exchange for your USDC. They send the payment to you in your chosen app. The system holds your USDC in escrow until you confirm receipt. Once you confirm, the USDC is released to them. Your payout is complete.

End-to-end this takes a few minutes. Most of which is the other party sending the payment, not your steps.

## A worked example

Carla earns 50 USDC for a month of work in her co-op. She is set up to cash out to Cash App.

1. She opens the cashout page. Taps "Cash out 50 USDC." Picks Cash App.
2. The system gets her a counterparty (a peer in the marketplace) willing to send $50 in Cash App in exchange for 50 USDC. The exchange rate is shown upfront, including any small fee.
3. Carla signs one approval with her passkey. Her USDC moves into escrow.
4. The counterparty sees the escrow open and sends $50 via Cash App to Carla's `$cashtag`.
5. Carla gets the $50 in her Cash App. She confirms receipt in Poa.
6. The escrow releases the 50 USDC to the counterparty. Done.

If she is getting paid more than once, future cashouts use the same flow without re-setting-up the destination.

## The three systems working together

Mechanically there are three layers:

- **Permit2** is the signing primitive. Carla signs a single Permit2 message that authorizes the cashout system to spend a specific amount of her USDC, with an expiration. This is how the whole flow works on one signature instead of two transactions.
- **Bungee** is a cross-chain solver. Carla's digital dollars might live on whichever chain her org runs on. The peer-to-peer marketplace operates on a different chain. Bungee moves the funds between the two in the same step, automatically.
- **ZKP2P** is the peer-to-peer marketplace that matches you with a counterparty and holds the escrow. It uses a clever proof system to verify the off-chain payment (the Cash App, Venmo, or bank transfer the counterparty sends you) without anyone having to manually confirm it.

For people signing in with a regular crypto wallet (MetaMask and friends), the whole thing happens in one click. Sign, escrow, bridge. All in one step. For people signing in with a passkey there is a small split right now: the approval and the bridge happen first, then the escrow opens. From your perspective it still feels like one click. We're working on closing the gap fully.

## What can go wrong, and what happens

- **Counterparty does not pay.** If the marketplace counterparty fails to send the fiat within the agreed timeout (typically minutes), the escrow auto-cancels and your USDC is returned. You are never out money.
- **You receive the fiat but do not confirm.** The counterparty can submit their ZK proof of payment, which (if valid) automatically releases escrow to them. You do not need to manually confirm to make this work. Confirming makes the release immediate.
- **Network congestion delays the bridge.** Bungee usually settles in seconds. In extreme cases, minutes. The escrow timeout is set conservatively to account for this.
- **Wrong receiving address / handle.** The system validates the receiving handle's format but cannot validate that the handle belongs to *you*. Triple-check your Cash App `$cashtag`, your Venmo handle, your bank routing and account numbers.

## How to cash out from an organization's treasury (vs your personal account)

Cashout for an *individual member* is the flow above. But what about a treasurer who wants to send a vendor payment in fiat directly from the org's [treasury](/docs/treasury-management)? Same mechanics, but the originating signer is the treasury contract itself, which means the cashout must be approved by a community vote. The vote authorizes the treasury to release N USDC into the cashout pipeline. The rest of the flow is identical.

For the treasury side specifically, see [treasury management](/docs/treasury-management).

## How it works under the hood

- **One sign-in covers the whole flow.** You authorize the cashout once. Everything that follows happens automatically. You do not have to sign separate steps for the bridge, the escrow, or the release.
- **Three open systems handle the work.** Your dollars find a peer through an open marketplace called [ZKP2P](https://zkp2p.xyz/). If your dollars live on a different chain than that marketplace, an open bridge called [Bungee](https://bungee.exchange/) moves them over. The approval that lets all this run on one click is an open standard called [Permit2](https://github.com/Uniswap/permit2). None of these are Poa-controlled.
- **The receipt is public.** When the counterparty sends you fiat, they post a proof of the payment that anyone can verify. The platform never takes anyone's word for it.
- **Poa never holds your money.** Throughout the flow, the dollars live in open contracts you can inspect, not in a Poa wallet. We literally cannot freeze your cashout.
- **Open source.** The Poa-side cashout code is at [poa-box/POP](https://github.com/poa-box/POP).

## Related reading

- [Treasury management](/docs/treasury-management). Paying members from a community treasury
- [Account abstraction](/docs/account-abstraction). Why passkey accounts have a slightly different cashout shape (for now)
- [Cross-chain architecture](/docs/cross-chain-architecture). How Bungee bridges the USDC for cashout
