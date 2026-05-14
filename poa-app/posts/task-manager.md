# Task manager

Every Poa organization has a shared task board built into it. It doubles as a contribution log. Members create tasks. Members claim work. Members submit results for review. Members earn participation tokens when their work is approved. The same task board is the source of truth for who is actually contributing, which is what governance is built on for organizations using contribution-weighted voting.

You can use it like a lightweight Kanban for a worker cooperative's day-to-day. Like an officer-managed task list for a student org. Like a bounty board for an open-source project. The mechanics are the same. How strict you are about review and assignment is up to your community.

## What a task is

A task has:

- A title and a description
- An estimated reward in participation tokens (configurable when the task is created)
- A project it belongs to (projects are how related work is grouped)
- A status: open, claimed, submitted, approved (or rejected)
- A reviewer (anyone with the Review permission on this project's role)

When a task is approved, the reward is minted as participation tokens to the contributor's account. The tokens are non-transferable. They represent contribution history, not capital. They flow into governance via [contribution-based voting](/docs/contributionVoting).

## The lifecycle, step by step

1. **Create.** A member with the Create permission opens a new task. Title, description, project, reward. The task goes into the project's "Open" column.
2. **Claim.** A member with the Claim permission takes the task. It moves to "Claimed" and is associated with their account. Most orgs let any Member claim freely. Some require an Officer to assign instead.
3. **Do the work.** Offline. Write the code. Design the flyer. Run the event. Whatever the task says.
4. **Submit.** When the work is ready, the claimer marks the task submitted (optionally with a link to the deliverable). It moves to "Submitted" and queues for review.
5. **Review.** A member with the Review permission inspects the work and approves or rejects. Approval lands the reward in your account. Rejection sends the task back to "Open" or "Claimed" with feedback.

For the permissions side, who can do which step, see [roles and permissions](/docs/roles-and-permissions).

## A worked example

Bread & Roses Co-op runs a delivery service with twelve worker-owners. They have defined three task types:

- **Delivery run.** 5 PT base, plus 1 PT per delivery completed. Anyone can claim.
- **Customer support shift.** 20 PT for a four-hour shift. Anyone can claim. One open shift per member at a time.
- **Bookkeeping for the month.** 100 PT. Assigned (not claimable) to whoever is serving as Treasurer.

In one month: Alice does four delivery runs (5 + 4×1 = 9 PT each, 36 PT total). Bob does two customer-support shifts (40 PT). Carla, the Treasurer, completes the monthly bookkeeping (100 PT). When the co-op votes on whether to expand to a second city, those participation token totals weight their votes if the co-op is using contribution-based voting.

This is the entire compensation system. There is no separate "salary" mechanism. Members get paid from the [treasury](/docs/treasury-management) on a schedule the community votes on, and the task ledger shows exactly who contributed what to justify those payments.

## A few configurable bits

- **Reward formula.** Defaults to a flat amount. You can also use a base plus multiplier (base + difficulty × hours, or whatever formula your community defines). Set at org-creation time, changed by community vote later.
- **Auto-approval.** For low-stakes tasks (meeting attendance, for instance), you can set a project to auto-approve on submission. Most orgs leave review on for anything that pays meaningful tokens.
- **Multiple reviewers.** You can require N approvals before a task is paid out. Useful when reviewers are accountable to the broader community.

## How it works under the hood

Mechanics:

- **The task board is recorded on the blockchain.** Every create, claim, submit, approval, and rejection is logged. The page you see is reading the live record, not a separate database. Source for the underlying contract at [poa-box/POP](https://github.com/poa-box/POP), AGPL-3.0.
- **Participation tokens are non-transferable.** They are not currency. You cannot sell them or give them to another member. They can only be minted when work is approved (or a [learning module](/docs/learn-and-earn) is completed). When you cast a contribution-weighted vote, the system reads your balance at the moment the proposal opened, not your current balance. That is why a last-minute token grab cannot change the outcome of a vote already in progress.
- **Permission checks** look at your current roles to decide whether you can create, claim, review, or assign on this project. If a permission is missing, the action is refused with a clear message.
- **Terminal access.** If you would rather work from a command line (running scripts, building bots, wiring tasks into other tools), the [`pop`](https://github.com/poa-box/poa-cli) CLI exposes every task action with JSON output and dry-run simulation.

## Related reading

- [Contribution-based voting](/docs/contributionVoting). How participation tokens flow into governance
- [Roles and permissions](/docs/roles-and-permissions). Controlling who can create, claim, review, assign
- [Treasury management](/docs/treasury-management). The funding source for member payouts
