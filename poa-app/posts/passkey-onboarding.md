# Signing in with a passkey

Joining an organization on Poa takes one tap. There is no wallet to install. No seed phrase to write down on paper. No app to download. You sign in with a passkey. It is the same kind of credential your phone already uses to unlock with your face or your fingerprint. The same kind your bank app probably uses now too.

A passkey is a credential that lives on your device. When you create one, your phone or laptop stores a private cryptographic key that only it can use. The key is protected by your biometric (Face ID, Touch ID, Windows Hello) or by your device PIN. Poa never sees that key. We only ever see the public half of it, which is what proves to your organization that you are you.

## What the experience feels like

The first time you join an organization, Poa asks your device to create a new passkey. Your operating system takes over for that step. It shows the standard "Save a passkey for poa.box?" dialog you have seen on other sites. It asks for your face or fingerprint. It saves the credential.

After that, every action you take inside your organization is signed by that passkey. Voting on a proposal. Claiming a task. Approving a treasury transfer. Most of the time you don't see this happen. Some actions, the ones that move money or change governance, prompt a quick biometric check. Everything else just works.

## A worked example

Layla joins the Computer Science Co-op through a link her organizer shared. She taps "Sign in" on her phone. She gets the iOS passkey prompt. She authenticates with Face ID. Three seconds later she is looking at her organization's home page with a member badge already on her profile.

A week in, Layla wants to claim a task worth 25 participation tokens. She taps "Claim". Her phone asks for Face ID one more time. The task is hers. No gas fee. No transaction popup. No wallet extension to install. The same flow handles her first vote a few days later.

## How it works under the hood

For the curious:

- **The secret half of your passkey stays on your device.** Poa never sees it. The same applies if our servers were broken into. The attacker could not act as you, because your secret half is not on a Poa server. It is on your phone or laptop.
- **One identity across every place Poa runs.** The same passkey signs you in across every chain Poa works on. You do not have a "Gnosis account" and a separate "Arbitrum account." It is one account, the same address everywhere. See [cross-chain architecture](/docs/cross-chain-architecture) for what that means in practice.
- **It moves between your devices the way your other passkeys do.** If you already use iCloud Keychain or Google Password Manager to sync your passkeys between phone and laptop, your Poa passkey rides the same rails. Sign in on a new device the same way you sign into any other site.
- **For the technical readers**, the standards involved are WebAuthn (the part your browser handles) and ERC-4337 (the part the blockchain handles). The Poa-side code that connects them is open source at [poa-box/POP](https://github.com/poa-box/POP) under AGPL-3.0. Full details in [account abstraction](/docs/account-abstraction).

## What if I lose my device?

Recovery depends on how your passkey is synced. If your passkey is in iCloud Keychain or Google Password Manager, and you sign in on a new device with the same account, the passkey is available there too. Your organization membership and history come with you. If your passkey was device-only and the device is gone, you need a fallback you set up earlier. Poa supports account recovery via a wallet you connect, and we recommend adding a wallet as a backup signer if your organization holds anything you would hate to lose access to.

## What about a real wallet?

You can still connect a wallet. MetaMask, Rainbow, Coinbase Wallet, anything WalletConnect-compatible. Useful for treasurers who want hardware-wallet protection on large approvals, or for technically inclined members who already have a wallet they like. But it is never required. The default flow is the passkey flow, because the default user is not a crypto user.
