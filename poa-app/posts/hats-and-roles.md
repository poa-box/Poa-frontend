# Where roles live (the technical bit)

Most readers do not need this page. The user-facing guide is [roles and permissions](/docs/roles-and-permissions). This page is here for people who want to know what's under the floorboards.

## The short version

Every role in a Poa organization is recorded on the blockchain. The record says "this person has this role in this organization." When a member tries to do something that requires the role, the system looks at the record and either lets them through or not.

There is no admin database where the role-holders are listed. There is no secret backup list. The on-chain record is the only record. That is what makes a role durable. You can grant. You can revoke. You can change the rules. But you cannot quietly demote someone, because every change is logged and visible.

## What the protocol is called

The piece that holds the role records is an external open-source project called **[Hats Protocol](https://www.hatsprotocol.org/)**. Poa uses it. Many other projects use it. We did not invent it. Hats Protocol is mature, well-audited, and widely used in the on-chain governance space.

We chose it for three reasons. It is well-tested. It supports the role hierarchies real organizations actually use. And it gives our members a guarantee we could not give them on a private database: that the rules of the organization are enforced by code, not by whoever happens to control the admin login.

## What this means in practice

For most users this never comes up. You join an org, you do work, you get the Officer role when the community votes you in, you keep doing work. The fact that the role lives on Hats Protocol is the same kind of detail as "your bank account is held at a bank that uses a particular database vendor." It is true, it matters technically, and it never appears in your day-to-day.

For developers, the Poa-side code that wires roles into voting, tasks, treasury, and vouching is open source in [poa-box/POP](https://github.com/poa-box/POP) under AGPL-3.0.

## Related reading

- [Roles and permissions](/docs/roles-and-permissions). What roles do in practice and how members earn into them.
- [Vouching and trust](/docs/vouching-and-trust). The main way roles get granted: peer review by existing role-holders.
