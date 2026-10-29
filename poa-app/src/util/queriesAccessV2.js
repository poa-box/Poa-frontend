/**
 * MembershipAuthority fields come from canonical core documents. The host keeps
 * its existing response names, relation selectors and presentation windows.
 * Consumers must gate on the endpoint capability and verified authority binding;
 * installing a package does not prove that an endpoint serves every field.
 */

import { gql } from '@apollo/client';
import * as authority from '@poa-box/core/graph/documents/authority';
import { coreDocument, coreFields } from '@/lib/graphql/coreDocuments';

/**
 * Is this org on the v2 path, and what is its authority?
 * Cheap enough to run on every org page load once the capability probe passes.
 */
export const FETCH_ORG_AUTHORITY = coreDocument(authority.FETCH_AUTHORITY_STATE, {
  name: 'FetchOrgAuthority', variables: '$orgId: ID!',
  fields: {
    _meta: false, organization: { args: 'id: $orgId' },
    'organization.membershipAuthority.initConfigDerived': false,
    'organization.membershipAuthority.lastUpdatedAt': false,
  },
});

/**
 * Every subject in the org, with the wiring the roles/groups admin page renders:
 * group composition both ways, vouch + manager config, and the permission rows.
 *
 * `first: 1000` on the nested collections is not decorative — the default page size is 100 and a
 * silently-truncated perm list would render as "this role has no permissions".
 */
// The admin page keeps its nested response and capped presentation window.
const subjectFields = coreDocument(authority.FETCH_AUTHORITY_SUBJECTS_PAGE, { fields: {
  'subjects.createdAtBlock': false, 'subjects.lastUpdatedAt': false,
  'subjects.vouchConfig.configuredAt': false, 'subjects.vouchConfig.lastUpdatedAt': false,
  'subjects.vouchConfig.voucherSubject.subjectId': false, 'subjects.vouchConfig.voucherSubject.kind': false,
  'subjects.managerConfig.setAt': false, 'subjects.managerConfig.lastUpdatedAt': false,
  'subjects.managerConfig.managerSubject.subjectId': false, 'subjects.managerConfig.managerSubject.kind': false,
} });
const edgeFields = coreFields(authority.FETCH_AUTHORITY_GROUP_EDGES_PAGE, 'groupCompositions', { only: ['id', 'groupSubjectId', 'roleSubjectId', 'isActive'] });
export const FETCH_AUTHORITY_SUBJECTS = gql`
  query FetchAuthoritySubjects($authority: ID!) {
    membershipAuthorityContract(id: $authority) {
      id paused
      subjects(first: 1000, orderBy: createdAt, orderDirection: asc) {
        ${coreFields(subjectFields, 'subjects')}
        perms(first: 1000) { ${coreFields(authority.FETCH_AUTHORITY_PERMS_PAGE, 'permRows', { omit: ['subject', 'setAt', 'clearedAt', 'lastUpdatedAt'] })} }
        memberRoles(first: 100) { ${edgeFields} }
        groups(first: 100) { ${edgeFields} }
      }
    }
  }
`;

/**
 * The org's membership rows — the fold mirror. Scoped to rows that MATTER
 * (a member, a claimable seat, or an ACCEPTED-but-lapsed one), so a large org does not page in
 * every historical row.
 *
 * The `accepted` branch is what makes the grant-vs-offer decision match the contract: `_isInOrg` is
 * `userSubjectList[user].length > 0` — accepted ANYWHERE, regardless of current eligibility — so
 * an accepted-but-lapsed member is in-org on chain. Without this branch those rows are invisible
 * here and the wizard classifies a real member as an outsider needing an invitation.
 *
 * FILTER SHAPE IS LOAD-BEARING: graph-node REJECTS a column filter that sits next to `or` at the
 * same level — `where: { authority: $a, or: [...] }` fails the whole document with "Cannot mix
 * column filters with 'or' operator at the same level". The scope has to be DISTRIBUTED into every
 * `or` branch instead. This is a graph-node filter-grammar rule, not a schema one, so the
 * capability probe cannot catch it (every selected field exists) — `queriesAccessV2.grammar.test.js`
 * lints it offline and `queriesAccessV2.live.test.js` executes it against a real graph-node.
 */
const membershipFields = coreDocument(authority.FETCH_AUTHORITY_MEMBERSHIPS_PAGE, { fields: {
  'subjectMemberships.firstSeenAt': false, 'subjectMemberships.lastUpdatedAt': false,
  'subjectMemberships.subject': false,
  'subjectMemberships.rule.setAt': false, 'subjectMemberships.rule.clearedAt': false, 'subjectMemberships.rule.managerSubject': false,
  'subjectMemberships.pendingAction.user': false, 'subjectMemberships.pendingAction.createdAt': false,
  'subjectMemberships.pendingAction.resolvedAt': false, 'subjectMemberships.pendingAction.cancelledBy': false,
} });
export const FETCH_AUTHORITY_MEMBERSHIPS = gql`
  query FetchAuthorityMemberships($authority: String!, $first: Int = 1000, $skip: Int = 0) {
    subjectMemberships(
      where: {
        or: [
          { authority: $authority, isMember: true }
          { authority: $authority, claimable: true }
          { authority: $authority, accepted: true }
        ]
      }
      first: $first
      skip: $skip
      # Offset pagination needs a unique, stable order or equal acceptedAt values can skip rows.
      orderBy: id
      orderDirection: asc
    ) {
      ${coreFields(membershipFields, 'subjectMemberships')}

      subject { ${coreFields(authority.FETCH_AUTHORITY_SUBJECTS_PAGE, 'subjects', { only: ['id', 'subjectId', 'kind', 'name', 'imageURI', 'defaultAllow', 'maxMembers'] })}  }
    }
  }
`;

/**
 * One user's rows across the org — the claimable-roles panel and "my roles".
 * Deliberately NOT filtered on isMember/claimable: a BANNED row is why a role is missing, and the
 * user surface has to be able to say so.
 */
export const FETCH_USER_MEMBERSHIPS = gql`
  query FetchUserMemberships($authority: String!, $user: Bytes!) {
    subjectMemberships(
      where: { authority: $authority, user: $user }
      first: 200
      orderBy: lastUpdatedAt
      orderDirection: desc
    ) {
      ${coreFields(membershipFields, 'subjectMemberships', { omit: ['userUsername'] })}
      authority { id }
      subject { ${coreFields(authority.FETCH_AUTHORITY_SUBJECTS_PAGE, 'subjects', { only: ['id', 'subjectId', 'kind', 'name', 'imageURI', 'defaultAllow', 'maxMembers', 'activeMemberCount'] })} vouchConfig { id quorum voucherSubjectId epoch } }
    }
  }
`;

/**
 * The review-window ledger. Open entries only by default — the countdown UI and the
 * "a removal is pending against you" banner both read this.
 */
export const FETCH_PENDING_ACTIONS = gql`
  query FetchPendingActions($authority: String!, $status: PendingActionStatus = Pending) {
    pendingActions(
      where: { authority: $authority, status: $status }
      first: 500
      orderBy: activatesAt
      orderDirection: asc
    ) {
      ${coreFields(authority.FETCH_AUTHORITY_PENDING_PAGE, 'pendingActions', { omit: ["transactionHash"] })}

    }
  }
`;

/** Vouch records for one (subject, user) — the vouch panel's roster. */
export const FETCH_SUBJECT_VOUCH_RECORDS = gql`
  query FetchSubjectVouchRecords($subject: String!, $user: Bytes!) {
    subjectVouchRecords(
      where: { subject: $subject, user: $user }
      first: 200
      orderBy: vouchedAt
      orderDirection: desc
    ) {
      ${coreFields(authority.FETCH_AUTHORITY_VOUCHES_PAGE, 'subjectVouchRecords', { omit: ["subject","config"] })}
      config { id quorum voucherSubjectId epoch }
    }
  }
`;

/** Every vouch record in the org — the org-wide vouching section. */
export const FETCH_AUTHORITY_VOUCH_RECORDS = gql`
  query FetchAuthorityVouchRecords($authority: String!) {
    subjectVouchRecords(
      where: { authority: $authority, active: true }
      first: 1000
      orderBy: vouchedAt
      orderDirection: desc
    ) {
      ${coreFields(authority.FETCH_AUTHORITY_VOUCHES_PAGE, 'subjectVouchRecords', { omit: ["subject","config","revokedAt"] })}
      subject { id subjectId name } config { id quorum epoch }
    }
  }
`;

/**
 * The membership activity feed — the SEVEN disjoint verbs, rendered verbatim.
 * `RoleClaimed` (the USER acted) is deliberately distinct from `RoleGranted` (an ORG act), and
 * `MembershipReconciled` is an automatic lapse repair that must never read as an org decision.
 */
export const FETCH_MEMBERSHIP_EVENTS = coreDocument(authority.FETCH_AUTHORITY_MEMBERSHIP_EVENTS_RECENT, {
  name: 'FetchMembershipEvents',
});

/** Config lints are a recent display window, never authorization evidence. */
export const FETCH_CONFIG_LINTS = coreDocument(authority.FETCH_AUTHORITY_CONFIG_LINTS_RECENT, {
  name: 'FetchConfigLints',
});
