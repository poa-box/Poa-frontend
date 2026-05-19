# Roles and permissions

Every organization on Poa is built on roles. Member. Officer. Treasurer. Reviewer. Steering Committee. Whatever titles your community needs. Roles decide who can see what, who can do what, and how much each person's vote counts when the community makes a decision.

You set this up in a few minutes when you create the organization. You can change it later through a community vote. Roles are designed to be durable. Once someone earns a role, no admin can quietly take it away. Removing a role goes through the same vote that granted it.

## What a role is, in practice

A role is a named tier with three things attached to it:

1. **Who can have it.** Sometimes anyone on join. Sometimes only after community vouching. Sometimes only after completing a short learning module, contributing enough, or being granted it directly by a role admin.
2. **What they can do.** The permissions. Who can create tasks. Who can claim them. Who can review submitted work. Who can propose a treasury spend. Who can change the rules.
3. **How much their vote weighs.** Every role gets a weight in proposals. A Member role usually weighs the same for everyone. An Officer role might weigh more on certain kinds of decisions, or count in a separate voting class.

Roles can be hierarchical. A Treasurer role might be administered by a Steering Committee, which is itself administered by all members. This keeps power accountable. You can promote and demote, but only by the rules your community already agreed to.

## How members earn into a role: vouching

Vouching is Poa's main tool for letting a community decide, by peer review, who is ready for a role. You set a number (say, two vouches). You pick which role's members can vouch (say, current Project Leads). The role grows by trust, not by an admin clicking a button.

The flow:

1. A candidate becomes eligible. Sometimes by finishing a [short learning module](/docs/learn-and-earn). Sometimes by contributing enough. Sometimes just by being a member someone wants to vouch for.
2. The candidate can optionally register their candidacy so existing role-holders see them in a "pending" list.
3. Existing members of the voucher role open the candidate's profile and click "Vouch." Each click is a quick action that lands instantly. The counter goes up.
4. Once the candidate's count reaches the required number, **they** sign one action themselves to accept the role. The role lands in their profile in the same step.

A few things that catch people by surprise:

- **The candidate accepts the role, not the vouchers.** Vouchers express support. The candidate decides when to take the seat. They can hit the required count and still hold off until they are ready.
- **You cannot vouch for yourself.** This is enforced by the system. There is no setting to turn it on.
- **A voucher can take their vouch back before the candidate accepts.** Once the candidate has accepted, the role is theirs. Removal after that is a regular admin or community-vote action.
- **Vouches survive vouchers leaving.** If someone vouches for you, then later loses or gives up their own role, their vouch still counts toward you. This is deliberate. It keeps a wave of departures from retroactively unmaking decisions the community already made.

Full configuration reference in [vouching and trust](/docs/vouching-and-trust).

## Other ways to earn a role

Vouching is the most-used path, but it is one of several. Each role in your org can use any of these, independently or in combination:

- **Open.** Anyone can claim. Use this for the base Member role that everyone gets on join.
- **Vouched.** Peer review with a quorum. The flow above.
- **Mixed.** Some members can claim directly. Others come in by vouching. Useful when there are multiple legitimate paths into a tier.
- **Admin-granted.** A role admin grants the role to a specific person. Useful for founders setting up the first committee, or for explicit appointments. Every grant is logged.
- **Application-based.** Candidates publicly register their candidacy before vouches start. Useful when you want a candidate list the community can see and discuss.

Most organizations use a mix. The base Member role is open. One or two officer tiers are vouched. The Treasurer might start as admin-granted and convert to vouched later through a community vote.

## A worked example

The Computer Science Co-op has 30 members and three roles:

- **Member.** Anyone who joins gets this automatically. Members can vote on community proposals, claim tasks, see the treasury, and propose new initiatives.
- **Project Lead.** Requires finishing the Project Lead Onboarding module *and* two vouches from existing Project Leads. Can create tasks, assign them, and review submitted work.
- **Treasurer.** Appointed by community vote. Set as admin-granted at the start. The community can switch it to a vouched configuration later if they want a wider pool of treasurers.

When a member proposes "Allocate $500 from the treasury to a hackathon prize pool," the vote weighs equally across all Members. The co-op uses direct democracy for treasury decisions, so the Treasurer's vote does not count for more on this kind of question.

Six months in, a Member who has contributed 200 participation tokens and run two learning modules wants to become a Project Lead. They finish the onboarding module. They ask two existing Project Leads to vouch. Once both vouches land, they sign the acceptance. They are a Project Lead.

## Task permissions, specifically

Tasks have their own four-permission set. It is applied per role per project:

| Permission | What it lets you do |
|---|---|
| Create | Open a new task in this project |
| Claim | Take an open task for yourself |
| Review | Approve or reject a submitted task |
| Assign | Hand a task to a specific member |

You set this up in a permission grid when you create the organization. Each role is a row. Each permission is a column. You tick the cells you want. Most orgs let Members claim and submit, and reserve review and assign for Officer-tier roles. The grid is yours to fill in.

For the full task lifecycle, see [task manager](/docs/task-manager).

## Under the hood (the brief version)

Roles are stored on the blockchain through an open-source project called [Hats Protocol](https://www.hatsprotocol.org/). When a member tries to do something, the platform checks the on-chain record to see whether they have the right role. There is no admin database that could be edited behind the scenes. Every role change (granted, revoked, vouched-in) is logged and verifiable.

The Poa-side code that handles eligibility, vouching, and permission checks is open source under AGPL-3.0 at [poa-box/POP](https://github.com/poa-box/POP). If you want the deeper technical view, see [where roles live](/docs/hats-and-roles).

## Related reading

- [Vouching and trust](/docs/vouching-and-trust). Full configuration and worked examples for the vouching path.
- [Task manager](/docs/task-manager). How task permissions actually fire.
- [Learn and earn](/docs/learn-and-earn). Onboarding modules that can gate role progression.
