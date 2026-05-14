# Deployment wizard

The `/create` flow is how a new organization comes into being on Poa. It walks you through six short steps. It takes a few minutes end-to-end. It finishes with your organization live and ready for members to join. Everything you set up in the wizard can be changed later through a community vote. Nothing here is permanent except your org's name.

This page is the field reference. Every step. Every option. What each one does. What is reversible after launch. If you are new to the concept of community-owned organizations entirely, start with [what is a community-owned organization?](/docs/perpetualOrganization) first.

## Step 1. Template

Pick the starting point that matches what you are building:

- **Simple.** Sensible defaults for a small group that wants to get going fast. One member tier. Direct democracy voting. Default treasury settings. You can layer complexity in later if you need it.
- **Advanced.** Full control from the start. You define your own role tiers, governance models, and treasury configuration. Choose this if you already know how you want your organization structured.

Templates are starting points, not constraints. You can move from Simple to Advanced complexity at any time through governance.

## Step 2. Identity

- **Name.** What the world calls your organization. Must be unique across Poa. **This is permanent.** It is used in your on-chain identifiers and can not be changed.
- **Description.** Short explanation of who you are and what you do. Members see this on the org home page and the explore directory.
- **Logo.** Uploaded to IPFS and rendered everywhere your org appears.
- **Links.** Discord, Twitter, GitHub, website, anywhere else members might want to find you.

Everything except the name is editable later through a metadata-update vote.

## Step 3. Team (roles and permissions)

Define the role tiers your organization needs. For each role you set:

- **Name.** Member, Officer, Treasurer, whatever.
- **Description.** What this role is for, what is expected of someone wearing it.
- **Admin.** Which role administers this one. The root role (usually "All Members") is administered by community vote. Lower roles are administered by higher ones.
- **Permissions.** The granular task permissions (create, claim, review, assign) per project, plus access to executive functions if applicable.
- **Eligibility.** Choose how members earn into this role. Five paths, used independently or in combination: open / automatic (anyone on join, used for the base Member role), vouched (set a count, pick one voucher role, optionally also let parent-role admins vouch), admin-granted (a role admin grants the role directly to a specific person), application-based (candidates register their candidacy in advance), and mixed (allow direct claim plus vouching at the same time). See [vouching and trust](/docs/vouching-and-trust) for the full configuration reference.

The wizard renders this as a hierarchy tree, so you can see the admin relationships visually. For the full mechanics of how roles work, see [roles and permissions](/docs/roles-and-permissions).

## Step 4. Governance (voting model)

Choose how your organization makes decisions:

- **Direct democracy.** One member, one vote. Configure quorum (minimum participation) and threshold (simple majority, supermajority, etc.). Best for tight-knit groups with high engagement. Full details in [direct democracy](/docs/directDemocracy).
- **Contribution-based.** Voting power proportional to participation tokens earned. Best when active workers should have proportionate say. Full details in [contribution-based voting](/docs/contributionVoting).
- **Hybrid.** Both, blended at a ratio you pick (e.g. 50 percent direct democracy, 50 percent contribution-weighted). Best when you want a base of equality plus weight for active contributors. Full details in [hybrid voting](/docs/hybridVoting).

Plus configurable extras:

- **Quadratic voting toggle.** Votes are weighted by the square root of voting power, which reduces the influence of large holders. Optional, off by default.
- **Per-role weights.** Some orgs want Officers' votes to count more than Members' on specific proposal types. Configurable here.
- **Quorum and threshold.** Set independently for each voting class.

## Step 5. Settings

The optional features:

- **Gas sponsorship.** Turn on if you want the protocol's solidarity fund to cover members' transaction costs. Most orgs want this on. See [gas sponsor](/docs/gas-sponsor) for how it works.
- **Education hub.** Turn on if you want a [learn-and-earn](/docs/learn-and-earn) module system inside your org.
- **Treasury config.** Set the initial token whitelist for the treasury (usually just USDC to start).
- **Custom domain.** If you are hosting a white-label deployment, link your domain to your org here. See [white-label hosting](/docs/white-label-hosting).

## Step 6. Launch and review

The final screen shows you everything you configured. You can go back to edit any step. When you launch, you click once. That single click sets up your whole organization at the same time:

- Deploys your org's contracts on the chain you chose
- Grants you the founder role
- Sets up the initial governance contract
- Registers your username on the chain's account registry, if you do not already have one
- Funds the org's paymaster from the solidarity fund if you opted into sponsorship

After confirmation, you are redirected to your org's dashboard. Members can join via the link in your nav.

## Common configurations by use case

A few starting points based on the three landing-page personas:

**Student organization (campus club, 20–100 members).**
- Simple template
- Three roles: Member, Officer, Treasurer (Treasurer administered by Member vote, Officer administered by Officer vote)
- Direct democracy voting, 50 percent quorum, simple majority
- Education hub on for onboarding modules
- Gas sponsorship on

**Worker cooperative (10–30 worker-owners).**
- Advanced template
- Three to five roles aligned with operational functions (Worker, Coordinator, Treasurer, etc.)
- Hybrid voting (50/50) so day-to-day operational calls weight active workers and structural decisions are equal
- Quadratic voting often on for treasury distribution
- Gas sponsorship on

**Open-source project (contributors of varying engagement).**
- Advanced template
- Member tiers based on contribution thresholds (Contributor at 100 PT, Maintainer at 1000 PT, Steward by vote)
- Contribution-based voting for technical roadmap, direct democracy for community / code-of-conduct issues
- Education hub on for new-contributor onboarding
- Gas sponsorship on

## How it works under the hood

- **One click and the whole thing is running.** You sign once. Voting, treasury, task manager, roles, the participation token, the learning hub if you turned it on. Everything comes alive at the same time. There is no multi-step setup, no "now configure this part separately."
- **You can opt into new versions later.** When Poa ships an update to a feature your org uses, your org can take the new version or stay on the current one. That choice is yours, made by community vote. Updates are not pushed to you.
- **Your org appears in the public directory** as soon as the launch is confirmed. Anyone can find you at `/explore`, and any tool built on Poa (including the [`pop`](https://github.com/poa-box/poa-cli) command line) can see you too.
- **All of the above is open source** under AGPL-3.0 at [poa-box/POP](https://github.com/poa-box/POP) for anyone who wants to read or audit the code.

## Related reading

- [Passkey onboarding](/docs/passkey-onboarding). The sign-in flow for you and your members
- [Roles and permissions](/docs/roles-and-permissions). What is behind Step 3
- [Gas sponsor](/docs/gas-sponsor). What Step 5's sponsorship toggle controls
