# Account abstraction

When you sign in with a [passkey](/docs/passkey-onboarding), the thing you are actually controlling is a smart contract account. A programmable account that lives on-chain and follows whatever rules its code says. It is not a traditional wallet. It is not a bank-style hosted account. It is something newer, and it makes a few features possible that would be awkward or impossible otherwise. Free transactions. Batched actions. Biometric sign-in without managing keys yourself.

The technical name for this pattern is account abstraction. The Ethereum standard that defines it is ERC-4337. This doc explains what that means in practice, why Poa uses it, and what to expect as a developer or technically inclined user.

## What's different from a regular wallet

A regular Ethereum wallet (MetaMask, Rainbow, a Ledger) is an externally-owned account (EOA). The account is just a public/private keypair. The private key signs transactions. Transactions cost gas. Gas is paid in ETH from the same account. That is all. Everything is hard-coded into the protocol.

A smart contract account is different. The account is a *contract*. When you want to do something, you send a UserOperation describing what you want. The account's code verifies that the request is authorized and executes it. Because the verification rules are code, they can be anything. A passkey signature. A multisig. A social-recovery scheme. A session key that expires in an hour. Because the execution is code, it can also do things an EOA can not. Pay gas in any token. Batch multiple calls into one atomic operation. Sponsor gas via a paymaster.

For end users in Poa, this means: sign in with face or fingerprint, never see a gas prompt, do multi-step actions in one tap.

## How Poa uses it

The Poa flow:

1. **Passkey creation.** When a new user signs up, their browser creates a WebAuthn credential. The public key is sent to our infrastructure. The private key stays on the user's device.
2. **Counterfactual address.** Before any on-chain action, Poa computes the smart account's address from the passkey's public key using `CREATE2`. The address exists conceptually even though no contract has been deployed there yet. The user "has" an account before paying for a deploy.
3. **Lazy deployment.** When the user takes their first action that needs an on-chain account, the UserOperation includes initialization code that deploys the smart account at the counterfactual address. The deployment happens atomically with the first action. No separate "deploy your account" step.
4. **UserOperations from then on.** Every subsequent action is a UserOperation signed by the passkey, validated by the smart account's on-chain verifier, paid for by the [paymaster](/docs/gas-sponsor), and bundled into a regular Ethereum transaction by an ERC-4337 bundler.

The user sees: tap a button, biometric prompt (sometimes), action happens. The smart-contract machinery is invisible.

## What makes this powerful for community organizations

A few things become possible because of account abstraction that would not be otherwise:

- **Seedless onboarding.** New members do not need a wallet. They use a passkey their phone or laptop already supports. No app install. No seed phrase to write down. No chance to lock themselves out by losing twelve words.
- **Free transactions.** Member-facing actions are sponsored by the protocol's solidarity fund via a paymaster. Members never see gas. The fund covers it.
- **Atomic multi-step operations.** Joining an org and registering a username can happen in one signed action instead of two transactions. Deploying an organization and granting the founder role happen in a single atomic step.
- **Account portability across chains.** The smart account's address is derived deterministically from the passkey's public key plus a salt. The same passkey produces the same address on every chain. So an account on Arbitrum and an account on Gnosis are the same account, conceptually, even though they are separate deployments.

## Caveats and limits

A few honest tradeoffs:

- **Account abstraction is not on every chain yet.** ERC-4337 is widely supported on the EVM chains Poa runs on today (Arbitrum, Gnosis, Base, Sepolia variants). Expanding to a new chain requires bundler and paymaster infrastructure on that chain. See [cross-chain architecture](/docs/cross-chain-architecture) for what is available now.
- **Recovery requires planning.** If your passkey is synced (iCloud Keychain, Google Password Manager) you are fine. If your passkey was device-only and the device is gone, you need a recovery path you set up earlier. Typically a wallet you connect as a backup signer.
- **One-off interactions with non-Poa contracts** sometimes need a different signing flow (the cashout flow is one example. See [cashout](/docs/cashout) for the current state).

## Verifying for yourself

If you want to inspect the smart accounts on-chain:

- The `PasskeyAccount` and `PasskeyAccountFactory` contracts live in [poa-box/POP](https://github.com/poa-box/POP). Source and Foundry tests are AGPL-3.0.
- Your account's address is shown in your profile page. Look it up on the explorer for the chain you are on. You will see it as a contract with the standard ERC-4337 v0.7 EntryPoint (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`, the same address on every chain).
- UserOps go through the [Pimlico](https://pimlico.io) bundler. The bundler endpoints, paymaster addresses, and EntryPoint addresses are listed on the [protocol dashboard](/docs/protocol).
- For EOA users who want sponsored gas without switching to a passkey, the protocol supports EIP-7702 delegation to a Poa-managed account contract (`0x776ec88A88E86e38d54a985983377f1A2A25ef8b`). This is how a regular wallet becomes ERC-4337-compatible without abandoning the EOA keypair.

## Related reading

- [Passkey onboarding](/docs/passkey-onboarding). The user-facing companion to this doc
- [Gas sponsor](/docs/gas-sponsor). The paymaster side of how sponsorship works
- [Cross-chain architecture](/docs/cross-chain-architecture). Which chains support this flow
