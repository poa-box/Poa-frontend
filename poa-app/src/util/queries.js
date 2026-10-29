import { gql } from '@apollo/client';
import { print } from 'graphql';
import { coreDocument, coreFields } from '@/lib/graphql/coreDocuments';
import * as org from '@poa-box/core/graph/documents/org';
import * as user from '@poa-box/core/graph/documents/user';
import * as voting from '@poa-box/core/graph/documents/voting';
import * as infrastructure from '@poa-box/core/graph/documents/infrastructure';
import * as treasury from '@poa-box/core/graph/documents/treasury';
import * as token from '@poa-box/core/graph/documents/token';
import * as task from '@poa-box/core/graph/documents/task';
import * as financialHistory from '@poa-box/core/graph/documents/financial-history';

// ============================================
// POP SUBGRAPH QUERIES (Arbitrum + Gnosis)
// Endpoints are configured per-chain in src/config/networks.js
// ============================================

// MembershipAuthority documents stay isolated because one unavailable field fails
// the whole document. Callers retain their exports and endpoint capability gates.
export * from '@/util/queriesAccessV2';

// Fetch single organization by orgId (bytes)
export const FETCH_ORG_BY_ID = coreDocument(org.FETCH_ORG_BY_ID, {
  variables: '$id: ID!',
  "fields": {
    "organization.membershipAuthority": false,
    "organization.paymentManager": false,
    "organization.zkEmailInvites": false
  }
});

// Fetch username from UniversalAccountRegistry
export const FETCH_USERNAME_NEW = coreDocument(user.FETCH_USERNAME, { variables: '$id: ID!' });

// Lookup account by username (returns address)
export const GET_ACCOUNT_BY_USERNAME = gql(user.GET_ACCOUNT_BY_USERNAME);

// Lookup multiple accounts by usernames (batch lookup)
// Compatibility document; complete cross-chain resolution uses reads/identity instead.
export const GET_ACCOUNTS_BY_USERNAMES = gql`
  query GetAccountsByUsernames($usernames: [String!]!) {
    accounts(where: { username_in: $usernames }) { ${coreFields(user.GET_ACCOUNT_BY_USERNAME, 'accounts')} }
  }
`;

// Fetch all organizations where user is an active member
// Compatibility historical User rows; current/historical cards use readMembershipCardFacts.
export const FETCH_USER_ORGANIZATIONS = coreDocument(org.FETCH_USER_ORGANIZATIONS, {
  fields: { users: { args: 'where: { address: $userAddress, membershipStatus: Active }' } },
});

// Lookup organization by name (returns ID for further queries)
export const GET_ORG_BY_NAME = coreDocument(org.GET_ORG_BY_NAME, {
  "fields": {
    "organizations.membershipAuthority": false,
    "organizations": {
      "args": "where: {name: $name}, first: 1"
    }
  }
});

// Fetch full organization data
export const FETCH_ORG_FULL_DATA = coreDocument(org.FETCH_ORG_FULL_DATA, {
  variables: '$orgId: ID!',
  "fields": {
    "organization.educationHub.modules": false,
    "organization": {
      "add": "hatPermissions(first: 1000) {\n  hatId\n  permissionRole\n  contractType\n  allowed\n}\neligibilityModule {\n  id\n  eligibilityModuleAdminHat\n}"
    },
    "organization.roles.hat": {
      "add": "metadataCID\nmetadata {\n  name\n}"
    }
  }
});

// Fetch voting data (proposals for both hybrid and DD voting)
export const FETCH_VOTING_DATA_NEW = coreDocument(voting.FETCH_VOTING_DATA_LEGACY, {
  "variables": "$orgId: ID!, $first: Int!, $hybridBefore: BigInt!, $ddBefore: BigInt!",
  "fields": {
    "organization.hybridVoting.votingClasses": {
      "args": "first: 1000, orderBy: classIndex, orderDirection: asc"
    },
    "organization.hybridVoting.proposals": {
      "args": "orderBy: startTimestamp, orderDirection: desc, first: $first, where: {proposalId_lt: $hybridBefore}",
      add: coreFields(voting.FETCH_VOTING_DATA, 'organization.hybridVoting.proposals', { only: ['classesVersion'] })
    },
    "organization.hybridVoting.proposals.metadata": {
      add: coreFields(voting.FETCH_HYBRID_PROPOSALS_PAGE, 'proposals.metadata', { only: ['actionSummaries'] })
    },
    "organization.directDemocracyVoting.ddvProposals": {
      "args": "orderBy: startTimestamp, orderDirection: desc, first: $first, where: {proposalId_lt: $ddBefore}"
    },
    "organization.directDemocracyVoting.ddvProposals.metadata": {
      add: coreFields(voting.FETCH_HYBRID_PROPOSALS_PAGE, 'proposals.metadata', { only: ['actionSummaries'] })
    }
  }
});

// Same query with proposer attribution (subgraph-pop #195 fields). Only used
// once the serving subgraph is confirmed to have Proposal.proposer — an
// unknown field errors the ENTIRE org query (see subgraphCapabilities.js).
export const FETCH_VOTING_DATA_WITH_PROPOSER = coreDocument(voting.FETCH_VOTING_DATA, {
  "name": "FetchVotingDataWithProposer",
  "variables": "$orgId: ID!, $first: Int!, $hybridBefore: BigInt!, $ddBefore: BigInt!",
  "fields": {
    "organization.hybridVoting.classVersion": false,
    "organization.hybridVoting.proposals.creatorUsername": false,
    "organization.hybridVoting.votingClasses": {
      "args": "first: 1000, orderBy: classIndex, orderDirection: asc"
    },
    "organization.hybridVoting.proposals": {
      "args": "orderBy: startTimestamp, orderDirection: desc, first: $first, where: {proposalId_lt: $hybridBefore}"
    },
    "organization.hybridVoting.proposals.metadata": {
      add: coreFields(voting.FETCH_HYBRID_PROPOSALS_PAGE, 'proposals.metadata', { only: ['actionSummaries', 'promotedFrom'] })
    },
    "organization.directDemocracyVoting.ddvProposals": {
      "args": "orderBy: startTimestamp, orderDirection: desc, first: $first, where: {proposalId_lt: $ddBefore}"
    },
    "organization.directDemocracyVoting.ddvProposals.metadata": {
      add: coreFields(voting.FETCH_HYBRID_PROPOSALS_PAGE, 'proposals.metadata', { only: ['actionSummaries', 'promotedFrom'] })
    },
    "organization.directDemocracyVoting.ddvProposals.votes": {
      "add": "voterUsername"
    }
  }
});


/**
 * Deep-link rescue — fetch ONE proposal by its composite id.
 *
 * The org query above caps each proposal list at `first: 50`, so a `?poll=` for
 * an older proposal is simply absent from the arrays and the modal never opens
 * (silently). This fetches exactly that one proposal so the deep link works at
 * any org size, without making every 30s poll carry hundreds of proposals.
 *
 * The selection sets are deliberately byte-identical to the list blocks above:
 * the result is spliced into the RAW array and goes through the same
 * transformProposal call, so it must not drift. Update both together.
 *
 * The top-level singular field is `ddvproposal` — all lowercase after "ddv",
 * unlike the nested `ddvProposals` list — so it is aliased. One id serves both
 * fields; proposal ids are contract-prefixed, so the wrong one returns null.
 */
export const FETCH_PROPOSAL_BY_ID = gql`
  query FetchProposalById($proposalId: ID!) {
    proposal(id: $proposalId) { ${coreFields(FETCH_VOTING_DATA_NEW, 'organization.hybridVoting.proposals')} }
    ddvProposal: ddvproposal(id: $proposalId) { ${coreFields(FETCH_VOTING_DATA_NEW, 'organization.directDemocracyVoting.ddvProposals')} }
  }
`;

/**
 * Same rescue with the proposer-attribution fields (subgraph-pop #195). Split
 * for the same reason the org query is: asking for an unknown field errors the
 * ENTIRE document, so this is only issued once hasProposerField() confirms the
 * serving subgraph has them.
 */
export const FETCH_PROPOSAL_BY_ID_WITH_PROPOSER = gql`
  query FetchProposalByIdWithProposer($proposalId: ID!) {
    proposal(id: $proposalId) { ${coreFields(FETCH_VOTING_DATA_WITH_PROPOSER, 'organization.hybridVoting.proposals')} }
    ddvProposal: ddvproposal(id: $proposalId) { ${coreFields(FETCH_VOTING_DATA_WITH_PROPOSER, 'organization.directDemocracyVoting.ddvProposals')} }
  }
`;


// Canonical task fields retain the host's 50-project window and historical permission display.
export const FETCH_PROJECTS_DATA_NEW = coreDocument(task.FETCH_PROJECTS_DATA, {
  "variables": "$orgId: ID!",
  "fields": {
    "organization.taskManager.projects.tasks.metadata.location": false,
    "organization.taskManager": {
      "add": "globalRolePermissions {\n  hatId\n  mask\n  canCreate\n  canClaim\n  canReview\n  canAssign\n  canSelfReview\n  canBudget\n  canEditMeta\n  canEditFull\n}"
    },
    "organization.taskManager.projects": {
      "args": "where: {deleted: false}, first: 50",
      "add": "rolePermissions {\n  hatId\n  mask\n  canCreate\n  canClaim\n  canReview\n  canAssign\n  canSelfReview\n  canBudget\n  canEditMeta\n  canEditFull\n}"
    },
    "organization.taskManager.projects.tasks": {
      add: `claimExpiries(orderBy: expiredAt, orderDirection: desc, first: 5) { ${coreFields(task.TASK_CLAIM_EXPIRY_FRAGMENT, '', { only: ['previousClaimer', 'newClaimer', 'expiredAt'] })} previousClaimerUsername }`
    }
  }
});

export const FETCH_PROJECTS_DATA_WITH_RELEASES = coreDocument(
  print(FETCH_PROJECTS_DATA_NEW), {
    name: 'FetchProjectsDataWithReleases',
    fields: {
      'organization.taskManager.projects.tasks': { add: coreFields(task.FETCH_PROJECTS_DATA_WITH_RELEASES, 'organization.taskManager.projects.tasks', { only: ['releaseCount', 'lastReleasedAt'] }) +
        'releases(orderBy: releasedAt, orderDirection: desc, first: 5) {' +
        coreFields(task.FETCH_TASK_RELEASE_HISTORY, 'task.releases', { omit: ['releasedAtBlock', 'transactionHash'] }) + '}' },
    },
  }
);

// Kept separate from the board query so a frontend can be deployed before the
// TaskSubmission schema finishes syncing without one unknown field blanking the
// whole board. Once available, latestRejection points to the exact immutable
// submission that was reviewed, even after the mutable Task state was cleared.
export { FETCH_LATEST_REJECTED_SUBMISSION } from '@/util/taskSubmissionHistory';

/**
 * Per-project managers — the `_isPM` half of TaskManager's permission check
 * (`_checkPerm` = the hat mask OR being a manager of that project). Managers are
 * seeded by `createProject` (the creator is auto-added) and by the executor-only
 * `setConfig(PROJECT_MANAGER, ...)`; `isActive` goes false when one is removed.
 *
 * Deliberately its OWN document rather than a field on `projectsDataQuery`: one
 * unknown field fails the WHOLE document, and that one backs the entire task
 * board. Isolated, the worst case for an endpoint that lacks `managers` is
 * `managers: []` — today's behaviour, hat masks only — instead of a blank board.
 * Verified present on both production gateway endpoints (Arbitrum + Gnosis).
 */
export const FETCH_PROJECT_MANAGERS = gql`
  query FetchProjectManagers($orgId: ID!) {
    organization(id: $orgId) {
      id taskManager {
        id projects(where: { deleted: false }, first: 50) {
          id managers(where: { isActive: true }) { ${coreFields(task.FETCH_PROJECT_MANAGERS_PAGE, 'projectManagers', { only: ['manager'] })} }
        }
      }
    }
  }
`;

// Fetch user data within an organization
export const FETCH_USER_DATA_NEW = coreDocument(user.FETCH_USER_DATA, {
  variables: '$orgUserID: ID!, $userAddress: ID!',
  "fields": {
    "user.modulesCompleted": false,
    "user.assignedTasks": {
      "args": "where: {project_: {deleted: false}}, first: 20"
    }
  }
});

// Fetch organization structure data for /org-structure page
// Historical names/hierarchy remain display data; current permissions use the shared authority snapshot.
export const FETCH_ORG_STRUCTURE_DATA = coreDocument(org.FETCH_ORG_FULL_DATA, {
  "name": "FetchOrgStructureData",
  "variables": "$orgId: ID!",
  "fields": {
    "organization.metadata.useTokenSymbol": false,
    "organization.metadata.taskPayoutHoursOnly": false,
    "organization.metadata.taskPayoutHourlyRate": false,
    "organization.metadata.links.index": false,
    "organization.zkEmailInvites": false,
    "organization.taskManager.projects": false,
    "organization.educationHub.modules": false,
    "organization.membershipAuthority": false,
    "organization.paymentManager": false,
    "organization": {
      "add": "eligibilityModule {\n  id\n}"
    },
    "organization.roles.hat": {
      "add": "hatId\nparentHatId\nlevel\nmintedCount\nmetadataCID\nmetadata {\n  name\n  description\n}\nmetadataUpdatedAt\nmetadataUpdatedAtBlock\nwearers {\n  wearer\n  wearerUsername\n  eligible\n  standing\n}"
    },
    "organization.roles": {
      "add": "wearers {\n  wearer\n  wearerUsername\n  isActive\n}"
    },
    "organization.taskManager.creatorHatIds": false,
    "organization.roles.canVote": false,
    "organization.users": {
      "args": "first: 200",
      "add": "lastActiveAt"
    },
    "organization.quickJoin": {
      "add": "memberHatIds"
    }
  }
});

// Fetch infrastructure contract addresses from the subgraph
// This replaces hardcoded addresses with dynamic lookups
// Fetches: PoaManager (with infrastructure proxies), OrgRegistry, UniversalAccountRegistry, and all Beacons
export const FETCH_INFRASTRUCTURE_ADDRESSES = gql(infrastructure.FETCH_INFRASTRUCTURE_ADDRESSES);

// ============================================
// TREASURY QUERIES
// ============================================

// Fetch treasury data including distributions, payments, and executor info
// Treasury UI windows remain local; these are capped histories, not complete totals.
export const FETCH_TREASURY_DATA = coreDocument(treasury.FETCH_TREASURY_DATA, {
  variables: '$orgId: ID!',
  fields: {
    'organization.paymentManager.distributions.createdAtBlock': false,
    organization: { add: `taskManager {
      id projects(where: { deleted: false }, first: 100) {
        id title bountyTasks: tasks(where: { status_in: [Open, Assigned, Submitted], bountyPayout_gt: "0" }, first: 500) {
          ${coreFields(treasury.FETCH_PROMISED_BOUNTIES_PAGE, 'tasks', { only: ['id', 'bountyToken', 'bountyPayout'] })}
        }
      }
      activityProjects: projects(first: 100) {
        tasks(where: { status: Completed }, first: 500, orderBy: completedAt, orderDirection: desc) {
          ${coreFields(task.FETCH_PROJECTS_DATA, 'organization.taskManager.projects.tasks', { only: ['id', 'taskId', 'title', 'payout', 'assignee', 'assigneeUsername', 'completer', 'completerUsername', 'completedAt'] })}
        }
      }
    }` },
  },
});

// ============================================
// TOKEN REQUEST QUERIES
// ============================================

// Fetch pending token requests for approvers to review
export const FETCH_PENDING_TOKEN_REQUESTS = gql(token.FETCH_PENDING_TOKEN_REQUESTS);

// Fetch a user's own token request history
export const FETCH_USER_TOKEN_REQUESTS = gql(token.FETCH_USER_TOKEN_REQUESTS);

// Fetch all token requests for an organization (admin view)
export const FETCH_ALL_TOKEN_REQUESTS = gql(token.FETCH_ALL_TOKEN_REQUESTS);

// Fetch approver hat permissions for a participation token
export const FETCH_TOKEN_APPROVER_HATS = gql`
  query FetchTokenApproverHats($tokenAddress: Bytes!) {
    hatPermissions(
      where: { contractAddress: $tokenAddress, permissionRole: Approver, allowed: true }
    ) {
      hatId
      permissionRole
      allowed
    }
  }
`;

// ============================================
// ROLE APPLICATION QUERIES
// ============================================

// Fetch active role applications for a user in an eligibility module

// Fetch all active role applications for an eligibility module (admin view)

// ============================================
// VOUCHING QUERIES
// ============================================

// Fetch all active vouches for an organization's eligibility module

// ============================================
// Distribution claim — find executed proposals with merkle tree CIDs
// ============================================

export const FETCH_DISTRIBUTION_PROPOSALS = gql`
  query FetchDistributionProposals($hybridVotingId: String!) {
    proposals(where: { hybridVoting: $hybridVotingId, wasExecuted: true }, orderBy: executedAt, orderDirection: desc, first: 50) {
      ${coreFields(financialHistory.FETCH_EXECUTED_DISTRIBUTION_PROPOSALS_PAGE, 'proposals', { only: ['id', 'metadata'] })}
    }
  }
`;
