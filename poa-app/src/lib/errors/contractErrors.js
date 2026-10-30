/** Core owns protocol error bytes and envelopes; the host owns member-facing copy. */
import { ethers } from 'ethers';
import { ALL_ABIS } from '@poa-box/core/abis';
import { ExecutorAbi } from '@poa-box/core/abis/Executor';
import { decodeRevertTree, extractRevertEvidence } from '@poa-box/core/errors/envelope';
import { historicalExternalErrorInterface, HISTORICAL_EXTERNAL_ERROR_NAMES } from '@poa-box/core/errors/compat';

const compatibilityInterface = historicalExternalErrorInterface();

// Preserve the diagnostic selector-map export using canonical ABI fragments and
// core's explicit historical/external aliases. No local protocol selector catalog.
export const CONTRACT_ERROR_SELECTORS = Object.freeze(Object.assign(
  Object.fromEntries(Object.values(ALL_ABIS).flatMap(abi => abi
    .filter(fragment => fragment.type === 'error')
    .map(fragment => {
      const error = ethers.utils.ErrorFragment.from(fragment);
      return [ethers.utils.id(error.format()).slice(0, 10), error.name];
    }))),
  HISTORICAL_EXTERNAL_ERROR_NAMES,
));

function protocolRevertTree(data, abi, maxDepth = 4) {
  return decodeRevertTree(data, {
    iface: toInterface(abi),
    compatibilityInterfaces: [compatibilityInterface],
    compatibilityNames: HISTORICAL_EXTERNAL_ERROR_NAMES,
    maxDepth,
  });
}

/**
 * Error name → friendly, actionable, user-facing message.
 * Written for a non-technical org member. Keyed by the exact contract error
 * name (PascalCase) so lookups are O(1) and never collide via substring.
 *
 * Covers the user-facing flows: vouch/role (EligibilityModule), join
 * (QuickJoin), tasks (TaskManager v6), token requests + treasury
 * (ParticipationToken / PaymentManager), and voting.
 */
export const CONTRACT_ERROR_MESSAGES = {
  // ---- EligibilityModule: vouching & role claiming (accept-role flow) ----
  AlreadyVouched: 'You have already vouched for this person. Each member can only vouch once per applicant.',
  ApplicationAlreadyExists: 'This person already has a pending join application. Wait for it to be approved or declined before submitting another.',
  CannotVouchForSelf: "You can't vouch for yourself. Ask another member of the organization to vouch for you.",
  HasNotVouched: "You haven't vouched for this person, so there's nothing to undo.",
  InvalidApplicationHash: "The application details couldn't be verified. Refresh the page and resubmit your application.",
  InvalidHatId: "That role doesn't exist in this organization. Pick a valid role and try again.",
  InvalidJoinTime: 'This join request is outside the allowed time window. Refresh and try joining again.',
  InvalidMembershipHat: "This organization's membership role isn't set up correctly. Contact an organization admin.",
  InvalidQuorum: 'The number of vouches required is misconfigured. An organization admin needs to fix the vouching quorum.',
  InvalidUser: "That account can't be used for this action. Make sure you're connected with the right wallet or passkey.",
  NewUserVouchingRestricted: 'You joined too recently to vouch for others yet. New members must wait before they can vouch — try again later, or ask a longer-standing member.',
  NoActiveApplication: 'There is no pending application for this role. You may need to apply first, or it was already handled.',
  NotAuthorizedAdmin: "You don't have admin permission for this action. Ask an organization admin to do it or to grant you the admin role.",
  NotAuthorizedToVouch: "Your role isn't allowed to vouch for new members. Ask an admin to grant your role vouching permission.",
  NotSuperAdmin: "Only the organization's super admin can do this. Contact the super admin.",
  VouchingNotEnabled: "Vouch-to-join isn't turned on for this organization. An admin must enable vouching before members can vouch.",
  VouchingRateLimitExceeded: "You've hit the vouching limit for now. Wait a while before vouching for someone else.",
  Ineligible: "You're not eligible for this role yet. You may need more vouches, or you may already hold a conflicting role.",

  // ---- QuickJoin: joining an org ----
  NoUsername: 'You need a username before joining. Set up your account name first, then join the organization.',
  OnlyMasterDeploy: "This action is restricted to the deployment system and can't be triggered manually.",
  PasskeyFactoryNotSet: "Passkey sign-up isn't configured for this organization yet. Join with a connected wallet instead, or contact an admin.",
  ZeroUser: 'No account was provided for this action. Reconnect your wallet or passkey and try again.',

  // ---- TaskManager: claim / submit / review / create (task flows) ----
  // v7 note: releasing a claim shares this error for two distinct cases — wrong status,
  // and "the claim you tried to release hasn't expired yet" — so the copy stays neutral.
  BadStatus: "This task isn't in the right state for that action — it may already be claimed, released, submitted, or completed. Refresh the board and try again.",
  NotClaimer: 'Only the person who claimed this task can do this. If it should be yours, claim it first.',
  NotFound: 'This task no longer exists or could not be found. It may have been deleted — refresh the board.',
  RequiresApplication: 'This task requires an application before you can claim it. Apply first, then claim once you are accepted.',
  NoApplicationRequired: "This task is open to claim directly and doesn't take applications. Just claim it.",
  AlreadyApplied: "You've already applied for this task. Wait for a reviewer to accept or decline your application.",
  NotApplicant: "You haven't applied for this task, so there's no application to act on. Apply first if you want to claim it.",
  InvalidDeadline: "The deadline isn't valid — it must be in the future. Pick a later date and try again.",
  SelfReviewNotAllowed: "You can't review your own submission. Another team member with review permission needs to approve it.",
  // Declared by BOTH BudgetLib (project token budget) and PaymasterHubErrors (gas
  // budget) — same selector, two meanings. Callers that know they're on the
  // sponsored-gas path should surface their own copy before consulting this map.
  BudgetExceeded: "This would go over a configured budget — either the project's token budget or the organization's gas allowance. Lower the amount, or ask an admin to raise the budget.",
  EmptyBatch: 'No items were selected for this bulk action. Select at least one task and try again.',
  NotCreator: "You don't have permission to create this item here. Ask an admin to grant your role the create permission.",
  NotExecutor: "This action can only be run by the organization's executor, usually via a passed governance proposal. It can't be triggered directly.",
  NotOrganizer: "You don't hold a folder-organizer role. Ask an admin to grant your role the organizer permission to reorganize the board.",
  EmptyTitle: "The task title can't be blank. Enter a title and try again.",
  TitleTooLong: 'The task title is too long. Shorten it and try again.',
  InvalidPayout: 'The payout amount is invalid. Enter a payout greater than zero and try again.',
  InvalidString: 'One of the text fields contains invalid characters or is malformed. Re-enter it and try again.',
  CapBelowCommitted: "The new budget cap is lower than what's already committed to tasks in this project. Raise the cap to at least the committed amount, or remove some tasks first.",
  SpentUnderflow: 'The project budget accounting is out of sync. Refresh and try again, or contact an admin.',
  FoldersRootStale: 'Another organizer changed the board layout while you were editing. Your changes were not saved — refresh and try again.',

  // ---- Shared permission / address guards ----
  Unauthorized: "You don't have permission for this action. Your role may be missing the required permission — contact an organization admin to have it granted.",
  RoleNotAllowed: "Your role isn't allowed to perform this action.",
  ZeroAddress: 'A required wallet address is missing or empty. Refresh the page and try again.',
  InvalidAddress: "The wallet address provided isn't valid. Reconnect your wallet or passkey and try again.",

  // ---- ParticipationToken: token / share requests ----
  NotMember: 'You must be a member of this organization to request shares. Make sure you have been assigned a member role.',
  ZeroAmount: 'The amount must be greater than zero.',
  NotApprover: "You don't have permission to approve requests.",
  AlreadyApproved: 'This request has already been approved.',
  RequestUnknown: 'This request no longer exists.',
  NotRequester: 'Only the person who made this request can cancel it.',
  AlreadySet: 'This value has already been configured.',
  TransfersDisabled: 'Transfers are disabled for participation shares.',
  NotTaskOrEdu: 'Only the task or education contracts can mint participation tokens.',

  // ---- PaymentManager: treasury / distributions ----
  InsufficientFunds: 'The treasury has insufficient funds for this operation.',
  InsufficientOrgBalance: "The organization's treasury balance is too low for this operation.",
  TransferFailed: 'Token transfer failed. Please check the token approval and try again.',
  AlreadyClaimed: 'You have already claimed this distribution.',
  OverClaimed: 'This would claim more than your allocation.',
  OptedOut: 'This account has opted out of distributions.',
  DistributionNotFound: 'That distribution does not exist.',
  DistributionAlreadyFinalized: 'This distribution has already been finalized.',
  ClaimPeriodNotExpired: 'The claim period for this distribution has not ended yet.',
  InvalidProof: 'Your distribution claim could not be verified. Refresh and try again.',
  SafeERC20FailedOperation: 'The token transfer was rejected by the token contract.',

  // ---- Voting ----
  AlreadyVoted: 'You have already voted on this proposal.',
  VotingExpired: 'Voting has ended for this proposal.',
  VotingOpen: 'Voting is still in progress for this proposal.',
  DurationOutOfRange: 'The voting duration is outside the allowed range.',
  TooManyOptions: 'There are too many options for this poll.',
  TooManyCalls: 'There are too many actions in this proposal batch.',
  WeightSumNot100: 'Your vote weights must add up to 100.',
  InvalidWeight: 'One of your vote weights is invalid.',
  InvalidThreshold: 'The approval threshold is invalid (it must be between 1 and 100).',
  InvalidProposal: 'This proposal is invalid or no longer exists.',
  DuplicateIndex: 'You selected the same option twice.',
  TargetNotAllowed: "The target contract isn't on this organization's voting allowlist. An admin must add it via a governance proposal.",
  // Thrown by the Executor (and, on pre-#185 deployments, by the voting contracts).
  // Self-amendment IS the intended governance path — POP PR #185 reverted the blanket
  // voting-contract guard — so the copy must not tell people to switch voting contracts.
  TargetSelf: 'This proposal targets a protocol contract with an action it will not accept on itself. Pick a different target for that action.',
  AlreadyExecuted: 'This proposal has already been executed.',

  // ---- Account registry / usernames ----
  AccountExists: 'You already have an account registered.',
  UsernameTaken: 'That username is already taken. Please choose another.',
  UsernameEmpty: 'Please enter a username.',
  UsernameTooLong: 'That username is too long.',
  InvalidChars: 'The username contains invalid characters. Use letters, numbers, and basic punctuation only.',

  // ---- Education hub ----
  InvalidAnswer: 'That answer is incorrect. Please review the material and try again.',

  // ---- Pause / generic guards ----
  EnforcedPause: 'This action is paused right now. Try again later or contact an admin.',
  Paused: 'This contract is currently paused.',

  // ---- Hats protocol (surfaces on every join / role-claim path) ----
  NotEligible: "You're not eligible for this role yet. You may need to be vouched for first.",
  AlreadyWearingHat: 'You already hold this role.',
  AllHatsWorn: 'This role has reached its member limit. Ask an admin to raise the limit.',
  HatNotActive: 'This role is currently switched off. Ask an admin to re-activate it.',
  NotAdminHats: "You don't administer that role, so you can't change it.",

  // ---- QuickJoin: H-03 open-hat claim gate ----
  // Raised both when the hat really is open-to-everyone AND when the eligibility
  // probe reverts (module missing / non-conforming) — the contract fails closed.
  HatOpenlyClaimable:
    "That role can't be claimed this way. Either it's already open to everyone (so an admin grants it directly), or this organization's role module needs attention. Ask an organization admin.",
  TooManyHats: 'Too many roles were requested at once (the limit is 20). Ask an admin to split this into smaller batches.',

  // ---- ZK Email invites: role claim ----
  // ZkEmailInvites raises this after it fails to grant email-eligibility — the org's
  // EligibilityModule may predate the email-verified path, or the claimer may be
  // barred from the role. Don't assert which.
  ClaimerNotEligible:
    "Your invite checked out, but this organization couldn't grant you the role. Ask an organization admin to check the role's eligibility settings.",
  EmailAlreadyRegistered:
    'This email address has already been used to claim a role here. Ask an organization admin to re-open it if you need to claim again.',
  NullifierAlreadyUsed: 'This email has already been used for a claim. Send yourself a fresh claim email and try again.',
  NotInAllowlist:
    "Your email address isn't on this organization's invite list. Ask an admin to add it, then send your claim email again.",
  AllowlistNotActive:
    "Email invites aren't switched on for this organization yet. An admin has to activate the invite list before anyone can claim.",
  InvalidDKIMKey:
    "This organization's email verification needs an admin update for your provider. Contact an organization admin before retrying your claim.",
  ZeroClaimer: 'No account was provided for this claim. Reconnect your wallet or passkey and try again.',
  EmptyHats: 'This invite has no roles attached. Ask an organization admin to fix the invite.',

  // ---- EligibilityModule: M-03 default-eligibility / vouching conflict ----
  // Fires when a role has vouching + "combine with hierarchy" while also being
  // default-eligible: the hierarchy path is ORed in, so the quorum never binds.
  DefaultEligibilityConflictsWithVouch:
    "A role can't be \"eligible by default\" while it also requires vouches combined with the role hierarchy — the vouch requirement would never apply. Turn off \"Eligible by default\" for that role.",
  InvalidMaxDailyVouches: 'That daily vouch limit is out of range. Pick a valid limit and try again.',
  NotAuthorizedEmailVerifier:
    "Only the organization itself, or a contract it has approved to grant roles, can mark an email as verified. Ask an organization admin.",

  // ---- Org deployment ----
  InvalidRoleConfiguration:
    'One of your roles is misconfigured. Check that you have between 1 and 32 roles, that every role has a name, that roles requiring vouches have a vouch count above zero and point at a real voucher role, and that no role is its own admin.',
  OrgExistsMismatch: 'An organization with this name already exists. Pick a different name and try again.',
  Reentrant: 'A deployment is already in progress. Wait for it to finish before starting another.',
  UnregisteredRole:
    "One of the permissions in your setup points at a role that doesn't exist. Go back to the Permissions step and re-check which roles are selected.",
  EmptyInit: 'A module was configured with no setup data. Refresh the deployment wizard and try again.',
  InitFailed: "One of the organization's modules failed to initialize. Review your settings and deploy again.",
  UnsupportedType: "One of the modules in this deployment isn't supported on this network yet. Refresh to pick up the latest modules.",

  // ---- Voting configuration (VotingErrors lib — never in the voting contract ABIs) ----
  TooManyPollHats: 'Too many roles were selected for this poll. Narrow it to fewer roles and try again.',
  InvalidSliceSum: 'The voting-power split has to add up to 100%. Adjust the percentages and try again.',
  TooManyClasses: 'Too many voting classes are configured. Remove one and try again.',
  InvalidClassCount: "The voting classes are misconfigured for this organization. An admin needs to fix the voting setup.",

  // ---- Executor / proposal execution ----
  CallFailed:
    'One of the actions in this proposal failed when it ran, so nothing was applied. Check the target contract and its inputs, then create a corrected proposal.',
  SweepFailed: 'The transfer out of the executor was rejected by the receiving address.',
  // Executor raises this from many admin entry points, not just hat minting.
  UnauthorizedCaller: "This account or contract isn't authorized to perform that action for this organization.",
  TimelockNotExpired: 'This change is still in its waiting period. Try again once the timelock has elapsed.',

  // ---- Paymaster sponsorship (gas sponsor declined) ----
  OnboardingLimitExceeded:
    'This organization has used up its sponsored sign-ups for now. Try again later, or join with a wallet that can pay its own gas.',
  OrgIsBanned: 'Gas sponsorship is disabled for this organization. Use a wallet that can pay its own gas.',
  OrgDeployDisabled: 'Sponsored organization deployment is currently switched off. Deploy with a funded wallet instead.',
  OnboardingDisabled: 'Sponsored sign-ups are currently switched off. Join with a wallet that can pay its own gas.',
  OnboardingDailyLimitExceeded: "Today's sponsored sign-ups are used up. Try again tomorrow, or use a funded wallet.",
  OrgDeployDailyLimitExceeded: "Today's sponsored deployments are used up. Try again tomorrow, or deploy with a funded wallet.",
  OrgDeployLimitExceeded: 'This account has reached its sponsored-deployment limit. Deploy with a funded wallet instead.',
  SolidarityLimitExceeded: "This organization has used up its shared gas allowance. Top up the organization's gas balance.",
  SolidarityDistributionIsPaused: 'Shared gas sponsorship is paused right now. Try again later.',
  GracePeriodSpendLimitReached:
    "This organization's starter gas allowance is used up. Top up its gas balance to keep sponsoring transactions.",
  InsufficientDepositForSolidarity: "The organization's gas balance is too low to sponsor this. Top it up and try again.",
  RuleDenied: "This action isn't on the organization's sponsored list, so gas can't be covered. Use a funded wallet.",
  GasTooHigh: 'This transaction needs more gas than the organization sponsors. Use a funded wallet, or ask an admin to raise the limit.',
  FeeTooHigh: 'The network fee is above what this organization sponsors right now. Try again when fees drop.',

  // ---- Cash out ----
  NotOwner: 'Only the account that made this request can recover it. Switch to that account and try again.',
  NoPendingRecovery: 'There is nothing to recover for this request — it may already have been recovered or completed.',
  RequestHashAlreadyFailed: 'This request has already been marked as failed. Recover the funds instead of retrying.',
  ETHTransferFailed: 'The transfer was rejected by the receiving address.',
  WouldDrainRecoveryFunds: 'This withdrawal would use funds reserved for pending recoveries. Lower the amount and try again.',
  WrongToken: 'The wrong token was supplied for this cash-out. Refresh and try again.',
  InsufficientDelivery:
    'Less arrived than was promised, so the transfer was rolled back. Nothing was lost — try again.',
  NotAuthorizedExecutor: 'This cash-out can only be completed by the authorized relay. Contact support if it stays stuck.',
  ZeroDepositor: 'No depositor was recorded for this request. Refresh and try again.',

  // ---- Passkey account ----
  InvalidSignature: "Your passkey signature wasn't accepted. Sign in again with the passkey registered to this account.",
  OnlyEntryPoint: 'This action can only run as part of a sponsored transaction. Refresh and try again.',
  OnlySelf: 'This action can only be performed by your own account. Refresh and try again.',
  ExecutionFailed: 'The action inside your transaction failed. Refresh and try again.',
  BeaconNotSet: "Passkey accounts aren't configured on this network yet. Join with a connected wallet instead.",
  MaxCredentialsReached: 'This account already has the maximum number of passkeys. Remove one before adding another.',
  CannotRemoveLastCredential: "You can't remove your only passkey — add another one first, or you'd lose access to this account.",
  CredentialExists: 'That passkey is already registered to this account.',
  CredentialNotActive: 'That passkey is no longer active on this account.',
  CredentialNotFound: "That passkey isn't registered to this account.",
  GuardianAlreadyExists: 'That account is already a recovery guardian.',
  GuardianDoesNotExist: "That account isn't a recovery guardian.",
  NotAGuardian: "You're not a recovery guardian for that account.",
  InvalidPublicKey: "That passkey's public key isn't valid. Create the passkey again and retry.",
  RecoveryDisabled: 'Recovery is switched off for this account. Add guardians and set a threshold first.',
  ThresholdExceedsGuardianCount: 'The approval threshold is higher than the number of guardians. Lower it, or add more guardians.',
  RecoveryAlreadyPending: 'A recovery is already in progress for this account.',
  RecoveryDelayNotPassed: 'The recovery waiting period has not finished yet.',
  RecoveryNotPending: 'There is no recovery in progress for this account.',
  OnlyGuardian: 'Only a recovery guardian can do this.',
  OnlyGuardianOrSelf: 'Only you or one of your recovery guardians can do this.',

  // ---- Misc modules ----
  TokenNotWired: "The participation-token contract isn't wired to this education hub yet. An admin has to finish the setup first.",
  EmptyString: "That field can't be blank. Enter a value and try again.",
  StringTooLong: 'That value is too long. Shorten it and try again.',
  NotToggleAdmin: "You don't have permission to switch roles on or off. Ask an organization admin.",
  AlreadyCompleted: "You've already completed this module.",
  ERC20InsufficientBalance: "You don't have enough tokens for this transfer.",
  ERC20InsufficientAllowance: 'This contract is not approved to move that many of your tokens yet. Approve it and try again.',
  ReentrancyGuardReentrantCall: 'That action is already running. Wait for it to finish before trying again.',

  // ---- MembershipAuthority (access v2) ----
  // The write half of the roles/groups surface. Where a condition also has a PRE-flight reason
  // code, the wording is kept in step with `lib/accessV2/rules.ACTION_REASON_COPY` on purpose: a
  // member must not be told one thing before a proposal and a different thing after it fails.
  UnknownSubject: 'That role or group no longer exists. Refresh and try again.',
  SubjectExists: 'A role or group with that name already exists.',
  SubjectFull: 'That role is full. Free a seat first, or raise the seat limit.',
  AlreadyMember: 'They already hold that role.',
  NotClaimable: 'There is nothing to claim on that role right now.',
  NotInOrg: "They aren't in the org yet, so this had to be an invitation they accept rather than a direct add.",
  GrantBlockedByGovernanceBan: 'A governance block is in place on that role — only a vote can lift it.',
  RemoveBlockedByStickyGovernance: 'That seat was granted by a vote and cannot be removed by a delegate — it takes another vote.',
  RemovalIneffective: 'Removing them would not take effect — they still qualify another way (an open role, a live vouch quorum, or a verified email).',
  ForceRequired: 'Closing that role would drop every member who is only held by it, so the change has to be confirmed as a forced change.',
  RuleNotDelegable: 'That rule was set by a vote and is not delegable — a manager cannot change it.',
  NotAuthorizedManager: "You aren't a manager for that role, so you can't act on it.",
  NoPendingAction: 'That request is no longer pending — it may have been completed or cancelled already.',
  PendingActionExists: 'There is already a pending request for that person and role. Resolve it before starting another.',
  NotYetActive: 'That request is still in its review window — it can be completed once the countdown ends.',
  NotAGroup: 'That subject is a role, not a group. Groups are the only thing roles can be composed into.',
  SelfManagedCycle: 'That wiring would make a role manage itself through a loop. Pick a different manager.',
  WiringIncompatible: 'That composition is not allowed — check which roles belong to the group.',
  RoleLimit: 'This organization has reached its limit on roles.',
  GroupSizeLimit: 'That group already holds the maximum number of roles.',
  GroupsPerRoleLimit: 'That role already belongs to the maximum number of groups.',
  MaxMembersOnGroup: 'That group is at its member limit.',
  PermFanoutLimit: 'Too many permissions were set at once. Split the change across two proposals.',
  VouchRateLimited: "You've used up your vouches for today. Try again tomorrow.",
  NotRegisteredModule: "That contract isn't registered to this organization, so the authority won't answer for it.",
};

/**
 * Friendly messages for legacy `require(cond, "string")` reverts (Error(string)).
 * Keyed by a lowercased substring of the require message. Kept small — most
 * POA contracts use custom errors; this covers the few Hats-protocol-style
 * string reverts (e.g. the role-claim eligibility check) so the passkey path
 * shows the same actionable copy as the EOA path's REVERT_PATTERNS.
 */
const REQUIRE_STRING_MESSAGES = {
  'not eligible to claim hat': "You're not eligible to claim this role yet. You may need more vouches, or you may already hold it.",
  'not eligible': "You're not eligible for this action yet.",
  'already wearing': 'You already hold this role.',
};

/**
 * Resolve a friendly message for a contract error NAME. Returns null if the name
 * has no curated message (callers then fall back to a generic message or to the
 * raw name).
 */
export function messageForErrorName(name) {
  if (!name) return null;
  return CONTRACT_ERROR_MESSAGES[name] || null;
}

/**
 * Resolve a friendly message for a raw require()-string revert reason via
 * substring match. Returns null when nothing matches (caller shows the raw string).
 */
export function messageForRequireString(reason) {
  if (!reason || typeof reason !== 'string') return null;
  const lower = reason.toLowerCase();
  for (const [key, message] of Object.entries(REQUIRE_STRING_MESSAGES)) {
    if (lower.includes(key)) return message;
  }
  return null;
}

/** True for a `0x…` string with at least a 4-byte selector of payload. */
function looksLikeRevertData(s) {
  return typeof s === 'string' && /^0x[0-9a-fA-F]{8,}$/.test(s.trim());
}

// ---------------------------------------------------------------------------
// Executor.CallFailed — the proposal-batch wrapper
// ---------------------------------------------------------------------------

/**
 * `Executor.CallFailed(uint256 index, bytes lowLevelData)` (Executor.sol:35).
 *
 * Every governance batch runs through `Executor.execute`, which catches each sub-call and
 * re-reverts with THIS wrapper. So the selector that reaches the app is always CallFailed and the
 * error the member actually needs — `SubjectFull`, `RemovalIneffective`, `TargetNotAllowed` — is
 * ABI-encoded INSIDE `lowLevelData`. Decoding only the outer layer produced "One of the actions in
 * this proposal failed" for every possible cause, and on the completed-poll surface it produced
 * raw hex (`executionStatus` interpolated `proposal.executionError` verbatim).
 */
export const EXECUTOR_CALL_FAILED_SELECTOR = new ethers.utils.Interface(ExecutorAbi).getSighash('CallFailed');

/** The 4-byte selector prefix of a revert blob, as the user-facing fallback identifier. */
export function shortSelector(hex) {
  if (typeof hex !== 'string') return null;
  const trimmed = hex.trim().toLowerCase();
  return /^0x[0-9a-f]{8}/.test(trimmed) ? trimmed.slice(0, 10) : null;
}

/** "Action 3 in this proposal" / "One of the actions in this proposal" when the index is unknown. */
function callIndexPhrase(index) {
  return Number.isInteger(index) && index >= 0
    ? `Action ${index + 1} in this proposal`
    : 'One of the actions in this proposal';
}

/**
 * Compose the user-facing sentence for a decoded CallFailed.
 *
 * The EMPTY-inner case is not a decode miss — it is CLAUDE.md's loudest gotcha. `announceWinner`
 * wraps the batch in a try/catch, so every estimator prices the cheap caught-failure path and an
 * under-funded finalize hits OutOfGas in a sub-call: the executor re-reverts `CallFailed(i, 0x)`,
 * the proposal is marked executed and NOTHING happened. Naming the remedy (retry with a higher gas
 * limit) is the whole point of surfacing this.
 */
function callFailedMessage({ index, innerData, inner }) {
  const where = callIndexPhrase(index);
  // `innerData === null` means the WRAPPER itself would not decode (a truncated blob) — we know
  // nothing, so do not guess a cause. `'0x'` is different: the wrapper decoded and the callee
  // returned NO revert data, which is the out-of-gas signature.
  if (innerData === null) return messageForErrorName('CallFailed');
  if (innerData === '0x') {
    return `${where} failed with no reason given — usually it ran out of gas. Nothing was applied; try counting the votes again with a higher gas limit.`;
  }
  if (inner?.message) return `${where} failed: ${inner.message}`;
  if (inner?.isStringError && inner.reason) return `${where} failed: ${inner.reason}`;
  if (inner?.name) return `${where} failed with ${inner.name}. Nothing was applied.`;
  const sel = shortSelector(innerData);
  return `${where} failed with error ${sel || 'of unknown type'}. Nothing was applied.`;
}

/**
 * Decode `Executor.CallFailed` revert bytes, recovering the INNER revert.
 *
 * @param {string} data - hex revert data whose selector is CallFailed
 * @param {Array|Object} [abi] - ABI/Interface used to name the inner error
 * @param {number} [depth] - recursion guard (an executor batch can target another executor)
 * @returns {{index: number|null, innerData: string|null, inner: object|null, message: string}|null}
 */
export function decodeExecutorCallFailure(data, abi = null, depth = 0) {
  if (!looksLikeRevertData(data)) return null;
  const hex = data.trim().toLowerCase();
  if (hex.slice(0, 10) !== EXECUTOR_CALL_FAILED_SELECTOR) return null;

  const tree = protocolRevertTree(hex, abi, Math.max(1, 4 - depth));
  return hostCallFailure(tree);
}

function hostCallFailure(tree) {
  const rawIndex = tree.callIndex;
  const index = rawIndex !== undefined && BigInt(rawIndex) <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rawIndex) : null;
  const innerData = tree.inner?.data ?? null;
  const inner = tree.inner ? hostRevert(tree.inner) : null;
  return { index, innerData, inner, message: callFailedMessage({ index, innerData, inner }) };
}

function hostRevert(tree) {
  if (tree.kind === 'string') {
    const reason = tree.args[0];
    if (!reason) return null;
    return { name: 'Error', reason, message: messageForErrorName(reason) || messageForRequireString(reason), isStringError: true };
  }
  if (tree.kind === 'panic') {
    return { name: 'Panic', reason: 'Panic', message: 'The transaction hit an internal contract error. Please refresh and try again, or contact an admin if it persists.' };
  }
  if (tree.kind === 'empty' || tree.kind === 'malformed' || tree.kind === 'bounded') return null;
  // Bare historical selectors can lack their ABI arguments. They remain diagnostic names only.
  const name = tree.kind === 'custom' ? tree.name : CONTRACT_ERROR_SELECTORS[shortSelector(tree.data)];
  if (!name) return null;
  if (name === 'CallFailed') {
    const failure = hostCallFailure(tree);
    return { name, reason: failure.inner?.name ? `CallFailed: ${failure.inner.name}` : name, message: failure.message, callFailure: failure };
  }
  return { name, reason: name, message: messageForErrorName(name), ...(tree.args.length ? { args: tree.args } : {}) };

}

/**
 * One sentence for a `ProposalExecutionFailed.reason` blob (the subgraph's
 * `Proposal.executionError`, and the same bytes the finalize receipt carries).
 *
 * Returns null when there is nothing to say, so callers can keep their existing generic copy.
 *
 * @param {string} reasonHex - the raw `reason` bytes
 * @param {Array|Object} [abi]
 * @returns {string|null}
 */
export function describeExecutionFailure(reasonHex, abi = null) {
  if (!reasonHex || typeof reasonHex !== 'string') return null;
  const hex = reasonHex.trim().toLowerCase();
  // An EMPTY reason is the executor's whole call reverting with no data — the swallowed OOG.
  if (hex === '' || hex === '0x') {
    return 'The winning action ran out of gas and was skipped, so nothing was applied. Try counting the votes again with a higher gas limit.';
  }
  const decoded = decodeRevertData(hex, abi);
  if (!decoded) {
    const sel = shortSelector(hex);
    return sel
      ? `The winning action failed on-chain with error ${sel}.`
      : 'The winning action failed on-chain.';
  }
  // CallFailed already reads as a full sentence (it names the action index and the remedy).
  if (decoded.name === 'CallFailed') return decoded.message;
  if (decoded.message) return `The winning action failed on-chain: ${decoded.message}`;
  if (decoded.isStringError && decoded.reason) return `The winning action failed on-chain: ${decoded.reason}`;
  return `The winning action failed on-chain with ${decoded.name} (${shortSelector(hex)}).`;
}

/**
 * Normalize an `abi` argument (array of fragments, JSON ABI, or an already-built
 * ethers Interface) into an Interface, or null.
 */
function toInterface(abi) {
  if (!abi) return null;
  if (typeof abi.parseError === 'function') return abi; // already an Interface
  try {
    return new ethers.utils.Interface(abi);
  } catch {
    return null;
  }
}

/**
 * Decode raw revert bytes into { name, reason, message, isStringError, args }.
 *
 * Handles the three on-chain revert shapes:
 *   - Error(string)  → returns the embedded string as `reason` (isStringError)
 *   - Panic(uint256) → a generic internal-error message
 *   - custom error   → name via the supplied Interface (preferred) or the
 *                      selector map; `message` is the curated friendly message
 *                      (or null if the name has no curated copy).
 *
 * Returns null when `data` isn't decodable revert bytes.
 *
 * @param {string} data - hex revert data (0x…)
 * @param {Array|Object} [abi] - contract ABI/fragments or a built ethers Interface
 * @param {number} [depth] - internal recursion guard for nested Executor.CallFailed wrappers
 */
export function decodeRevertData(data, abi = null, depth = 0) {
  if (!looksLikeRevertData(data)) return null;
  return hostRevert(protocolRevertTree(data.trim().toLowerCase(), abi, Math.max(1, 4 - depth)));
}

/**
 * Walk an ethers-style error object and return the FIRST hex blob that looks
 * like revert data. ethers v5 stows it inconsistently depending on whether the
 * failure was a sent-tx revert or a gas-estimation (UNPREDICTABLE_GAS_LIMIT)
 * wrapper, so we probe the gas-estimation locations first (error.error.data.data
 * / error.error.data) before the top-level (error.data) used by sent-tx reverts.
 */
export function extractRevertDataFromError(error) {
  // Preserve gas-estimation precedence when a provider also attaches outer data.
  for (const input of [error?.error?.data?.data, error?.error?.data, error, error?.originalError, error?.cause]) {
    const evidence = extractRevertEvidence(input);
    if (looksLikeRevertData(evidence.data)) return evidence.data;
  }
  return null;
}

/**
 * Extract candidate revert-data hex blobs from a FREE-TEXT error message
 * (viem / Pimlico bundler / passkey path). CRITICAL: only hex that FOLLOWS a
 * revert marker ("reason:", "reverted …") is returned — never blind-scanned —
 * so we don't accidentally grab the UserOp's own `sender`/`callData`/`paymaster`
 * hex (which would mis-decode to a confidently-wrong error). Longest blobs come
 * first (string reverts and custom errors with args are longer than bare
 * selectors), and callers should decode each in order, taking the first that
 * resolves to a known error.
 *
 * @returns {string[]} de-duplicated candidate hex strings, longest first
 */
export function extractRevertDataFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const out = [];
  // Anchor to a revert marker, allowing intervening words/punctuation but NOT
  // another `0x…` (so we bind to the hex closest after the marker).
  const re = /(?:revert(?:ed|s)?|reason)[^0]*?(0x[0-9a-fA-F]{8,})/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out.sort((a, b) => b.length - a.length);
}

/**
 * One-shot helper: given an error envelope (object) and/or its message text,
 * return a decoded { name, reason, message, isStringError } or null.
 * Tries structured object extraction first (EOA), then anchored text extraction
 * (passkey/bundler), decoding each text candidate until one resolves to a KNOWN
 * error (a curated message, a custom-error name, or a string reason).
 *
 * @param {Object} [error] - the error object (ethers or viem)
 * @param {string} [text] - free-text message(s) to scan (joined)
 * @param {Array|Object} [abi] - contract ABI/fragments or Interface for custom-error names
 */
export function decodeContractRevert(error = null, text = '', abi = null) {
  // 1. Structured (EOA / ethers): the revert bytes live in the error object.
  if (error) {
    const data = extractRevertDataFromError(error);
    if (data) {
      const decoded = decodeRevertData(data, abi);
      if (decoded) return decoded;
    }
  }

  // 2. Free-text (passkey / viem bundler): scan anchored hex candidates and keep
  // the first that decodes to something we recognize.
  if (text) {
    const candidates = extractRevertDataFromText(text);
    let firstAny = null;
    for (const hex of candidates) {
      const decoded = decodeRevertData(hex, abi);
      if (!decoded) continue;
      if (!firstAny) firstAny = decoded;
      // Prefer a candidate we have a curated message for, or a string reason.
      if (decoded.message || decoded.isStringError) return decoded;
    }
    if (firstAny) return firstAny;
  }

  return null;
}
