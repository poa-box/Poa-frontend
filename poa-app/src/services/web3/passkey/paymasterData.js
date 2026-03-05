/**
 * paymasterData.js
 * Encode paymaster-specific data for PaymasterHub.
 *
 * PaymasterHub paymasterAndData format (from _decodePaymasterData):
 *   paymaster(20) | version(1) | orgId(32) | subjectType(1) | subjectId(20) | ruleId(4) | mailboxCommit(8)
 *   Total = 86 bytes
 *
 * The paymaster address (first 20 bytes) is handled by the UserOp builder.
 * This module encodes the remaining 66 bytes (version through mailboxCommit).
 */

import { concat, toHex, pad } from 'viem';

/** Paymaster data version */
const PAYMASTER_VERSION = 0x01;

/** Default rule ID (0 = no specific rule) */
const DEFAULT_RULE_ID = 0;

/** Default mailbox commit (0 = not used) */
const DEFAULT_MAILBOX_COMMIT = 0n;

/** Subject types matching PaymasterHub contract */
export const SubjectType = {
  ACCOUNT: 0x00,
  HAT: 0x01,
  ONBOARDING: 0x03,
};

/**
 * Encode paymaster data (everything after the paymaster address).
 *
 * Format: version(1) | orgId(32) | subjectType(1) | subjectId(20) | ruleId(4) | mailboxCommit(8)
 *
 * @param {Object} params
 * @param {number} params.subjectType - 0x00=account, 0x01=hat, 0x03=onboarding
 * @param {string} params.subjectId - Address (20 bytes hex) for type 0x00/0x03, or hat-derived for 0x01
 * @param {string} params.orgId - bytes32 org ID hex string
 * @param {number} [params.ruleId=0] - Rule ID (uint32)
 * @param {bigint} [params.mailboxCommit=0n] - Mailbox commit (uint64)
 * @returns {string} Hex-encoded paymaster data (66 bytes)
 */
export function encodePaymasterData({ subjectType, subjectId, orgId, ruleId = DEFAULT_RULE_ID, mailboxCommit = DEFAULT_MAILBOX_COMMIT }) {
  const versionByte = toHex(PAYMASTER_VERSION, { size: 1 });
  // orgId is already bytes32 (32 bytes)
  const orgIdPadded = pad(orgId, { size: 32 });
  const subjectTypeByte = toHex(subjectType, { size: 1 });
  const subjectIdPadded = pad(subjectId, { size: 20 });
  const ruleIdBytes = toHex(ruleId, { size: 4 });
  const mailboxCommitBytes = toHex(mailboxCommit, { size: 8 });

  return concat([versionByte, orgIdPadded, subjectTypeByte, subjectIdPadded, ruleIdBytes, mailboxCommitBytes]);
}

/**
 * Encode paymaster data for org-based onboarding (account creation within an org).
 * Uses SubjectType.HAT (0x01) so the budget is checked against the hat's shared
 * budget (set by OrgDeployer) rather than a per-account budget (which doesn't exist
 * for new accounts). The EligibilityModule's isEligible returns true for vouched
 * accounts and for direct-join members via default rules.
 *
 * @param {string} hatId - The hat ID (uint256 hex) the user will claim/wear
 * @param {string} orgId - bytes32 org ID hex string
 */
export function encodeOnboardingPaymasterData({ hatId, orgId }) {
  return encodePaymasterData({
    subjectType: SubjectType.HAT,
    subjectId: toHex(BigInt(hatId), { size: 20 }),
    orgId,
  });
}

/**
 * Encode paymaster data for solidarity-fund onboarding (no org context).
 * Uses SubjectType.ONBOARDING (0x03) with zero orgId and zero subjectId.
 * Contract requirement: orgId must be bytes32(0), subjectId must be bytes20(0).
 * Paid 100% from the solidarity fund.
 */
export function encodeSolidarityOnboardingPaymasterData() {
  return encodePaymasterData({
    subjectType: SubjectType.ONBOARDING,
    subjectId: '0x0000000000000000000000000000000000000000',
    orgId: '0x0000000000000000000000000000000000000000000000000000000000000000',
  });
}

/**
 * Encode paymaster data for a standard account transaction.
 * Uses SubjectType.ACCOUNT (0x00) with the smart account address.
 */
export function encodeAccountPaymasterData({ accountAddress, orgId }) {
  return encodePaymasterData({
    subjectType: SubjectType.ACCOUNT,
    subjectId: accountAddress,
    orgId,
  });
}
