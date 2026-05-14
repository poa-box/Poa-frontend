# Vouching and trust-based progression

Vouching is how Poa lets a community decide, by peer review, who is ready to step into a role. Instead of "anyone can become an Officer" (too open) or "only the current Treasurer can grant Officer" (too centralized), you can say "Officer requires two existing Officers to vouch for the candidate." That is a vouch.

It is the kind of thing communities have always done informally. You ask around. Two trusted members say "yes, they're good." The new person is in. Poa just gives the same pattern a formal hook, so it can run by the community's own rules without a manual admin step.

## When vouching is the right tool

Use vouching when:

- The role needs human judgment that does not reduce to "completed a quiz" or "earned N tokens." Trustworthiness. Judgment. Alignment with the community. Humans are better at evaluating those than rules.
- You want a tier to grow organically without bottlenecking through one admin. Vouching spreads the decision across everyone already in the role.
- You need protection against fake accounts. A bad actor cannot just spawn five accounts and grant themselves a role. The new accounts would themselves need to be vouched in first.

Do not use vouching when:

- Membership should be open to everyone (the base Member role, usually). Just set the role to open. See "Other ways to earn a role" in [roles and permissions](/docs/roles-and-permissions).
- The criterion is objective. If a role unlocks at "100 PT earned plus a completed Treasurer module," that is a [learning module](/docs/learn-and-earn) gate, not a vouching gate.
- The community is small enough that everyone's vote on the candidate would be more honest than two vouches. Then a regular community vote is the better tool.

## What you can configure per role

Each role in your organization has its own vouching settings, independent of every other role. You set them in the [deployment wizard](/docs/deployment-wizard) at creation time. The community can change them later by vote. There are four fields:

- **Vouching on or off.** Simple switch.
- **How many vouches are needed.** Two or three is common for low-risk roles. Higher for Treasurer or Officer.
- **Who can vouch.** You pick *one* role from your org. The members of that role are the ones allowed to vouch for this role. It is one role, not a list of allowed roles.
- **Let parent admins vouch too.** Optional. When on, the role that administers the voucher role can also vouch. This is the closest thing to "any of these higher tiers can vouch."

What is **not** something you can set:

- **Self-vouching.** Built into the platform: you cannot vouch for yourself. There is no switch.
- **Vouching twice.** One voucher can vouch for a given candidate once per role. The second attempt is refused.

## A worked example

The Computer Science Co-op has a Project Lead role. Their setup:

- Vouching: on
- Vouches needed: 2
- Who can vouch: Project Lead
- Parent admins can vouch: no

They also require finishing the Project Lead Onboarding [learning module](/docs/learn-and-earn) before any vouches will count.

A candidate, Maya, finishes the module first. She can optionally register her candidacy so the existing Project Leads see her in a "pending" list, but it is not required. She asks two current Project Leads, Dani and Sam, to vouch. Each of them opens her profile and clicks "Vouch." One click each. The system records the vouch and bumps her count.

Once the second vouch lands, the system reports her count has reached the requirement. **Maya then signs one more action herself** to accept the role. The Project Lead role lands on her profile in the same step.

The candidate accepts the role. The vouchers express support. The candidate decides when to take the seat.

## Taking back a vouch

A voucher can take their vouch back before the candidate has accepted. The candidate's count drops by one. The original vouch is marked inactive in the public history (so you can audit it later), and it no longer counts.

If the candidate had just hit the required count and not yet accepted, they fall below the requirement until someone else vouches.

Once the candidate has accepted the role, vouches cannot be retroactively pulled to remove them. Removal after that is a regular admin or community-vote action on the role itself.

## What happens if vouchers leave the org

Vouches are permanent records. If Dani vouches for Maya, then later loses or gives up the Project Lead role, Dani's vouch for Maya still counts. The system checks the historical count when Maya accepts, not whether each voucher still holds their own role at that moment.

This is deliberate. You do not want a wave of departures to retroactively unmake decisions the community already made. If the community later decides someone should not be wearing a role, the path forward is a regular removal by the role's admin. Not retroactively invalidating the vouches.

## Other ways to earn a role (vouching is not the only one)

Vouching is the most-used path, but each role can be set up differently. The platform supports any combination of these, per role:

- **Open or automatic.** Anyone can claim. Use this for the base Member role that everyone gets on join.
- **Vouched.** Peer review with a required count. The flow above.
- **Mixed.** Some members claim directly. Others come in by vouching. Useful when there are multiple legitimate paths into the tier.
- **Admin-granted.** A role admin grants the role directly to a specific person. Useful for founders setting up the first committee, or for explicit appointments. Every grant is logged.
- **Application-based.** Candidates publicly register their candidacy in advance. Useful when you want a candidate list the community can see and discuss before vouches start.

Most organizations use a mix. The base Member role is open. One or two officer tiers are vouched. The Treasurer might start as admin-granted and convert to vouched later.

## Under the hood (the brief version)

The eligibility logic (who can vouch, who can claim, the vouch counter, the on-or-off switch per role) is handled by a single open-source piece of Poa's protocol. Source at [poa-box/POP](https://github.com/poa-box/POP), AGPL-3.0. Every vouch, every revoke, every claim is recorded on the blockchain, which is why the audit trail can show you who vouched for whom, when. The [subgraph](/docs/TheGraph) is what reads that history and renders the progress bars and candidate lists you see in the UI.

For the technical primitive that stores the roles themselves, see [where roles live](/docs/hats-and-roles).

## Related reading

- [Roles and permissions](/docs/roles-and-permissions). The broader role system vouching plugs into.
- [Learn and earn](/docs/learn-and-earn). The other primary tier-gating mechanism, often combined with vouching.
- [Where roles live](/docs/hats-and-roles). The technical under-the-hood for the curious.
