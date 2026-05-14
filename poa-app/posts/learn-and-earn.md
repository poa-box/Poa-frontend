# Learn and earn

Communities run better when new members actually understand how the org works. Poa's education hub lets any organization build short learning modules: quizzes, links, walkthroughs. New members complete them. They earn participation tokens for finishing. Some modules also unlock specific roles.

It is the same idea as the onboarding course you have taken at a job. The difference is that the completion is verifiable on the same ledger that runs governance. Finishing the Treasurer Onboarding module is not just a checkmark in someone's HR system. It can be the prerequisite that lets you actually hold the Treasurer role.

## What a module looks like

A module has:

- A title and description
- A set of content items. Anyone with the Create permission can mix written content, external links (a doc, a video, a slideshow), and quiz questions.
- A pass criterion. Usually "answer N out of M questions correctly".
- A reward. Participation tokens minted to the learner on completion.
- An optional role gate. Completing this module unlocks eligibility for a specific role.

Modules are public to members by default. Some orgs gate certain modules to specific roles (a leadership module that only Officers can take), which is a way to scaffold tiered learning.

## A worked example

The Computer Science Club has 50 members and elects three Officers each semester. They have built three modules:

1. **New Member Onboarding.** 10 PT reward, no role gate. What the club does, how voting works, where to find the meeting calendar. A five-question quiz at the end.
2. **Project Lead Onboarding.** 50 PT reward, unlocks the Project Lead role. How to run a working group, the club's task-review standards, an example of a well-written project proposal.
3. **Treasurer Onboarding.** 100 PT reward, unlocks the Treasurer role. How to read the treasury page, how to propose transfers, how cashout works for member reimbursements.

A new member joins. Completes the New Member module. Gets 10 PT. A few weeks later they want to lead a project. They complete the Project Lead module. The role becomes available to them (still subject to whatever [vouching](/docs/vouching-and-trust) the club requires). They get 50 PT. The same path scales to Treasurer.

## Why pay people to learn

Two reasons.

First: participation tokens are the contribution accounting system. Finishing a module is a real contribution to the org's ability to grow. It is recognized like other contributions.

Second: it gives a clean, non-political path into roles. You do not have to know an Officer or be the loudest voice in the chat. You do the work to learn. You earn the seat.

For orgs using [contribution-based voting](/docs/contributionVoting), this means new members can earn meaningful voting weight relatively quickly by completing onboarding modules. The gap between "I just joined" and "I have a real say" closes by doing.

## Creating a module

From inside an organization, head to the education hub (the "Learn" tab in your nav). If you have the Create permission for the hub, you will see a "+" button to start a new module. The editor lets you:

- Add content blocks (text, link, embed, quiz question)
- Set the pass criterion
- Set the reward amount
- Pick the unlocked role, if any
- Preview the module from a learner's perspective before publishing

Once published, the module appears in every member's Learn tab.

## How it works under the hood

Mechanics:

- **Modules are stored on the blockchain.** Each module's pass criterion, reward amount, and optional role unlock are part of the public record. Source for the underlying contract at [poa-box/POP](https://github.com/poa-box/POP), AGPL-3.0.
- **Completion is verified in the same place.** When a learner submits passing answers, the system checks the answers against the recorded criterion, lands the participation token reward in the learner's account, and (if the module unlocks a role) flags them as eligible.
- **Content lives off the blockchain.** The text, video links, and quiz prompts inside a module are stored separately for cost reasons. The blockchain holds a tamper-evident reference, so if anyone changes the content after the fact, it no longer matches the record.

## Related reading

- [Roles and permissions](/docs/roles-and-permissions). How modules can gate role progression
- [Task manager](/docs/task-manager). The other primary way to earn participation tokens
- [Contribution-based voting](/docs/contributionVoting). How tokens earned from modules translate to governance
