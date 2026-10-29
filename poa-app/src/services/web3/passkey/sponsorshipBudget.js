/**
 * sponsorshipBudget — will PaymasterHub still sponsor this UserOp at SUBMISSION?
 *
 * WHY THIS EXISTS. The bundler estimates a sponsored UserOp with its own, small gas limits and
 * the hub's per-subject budget check passes. We then inflate the limits (the 3x multiplier, the
 * governance-batch floors) and the hub re-runs the same check at submission — against the
 * EntryPoint's `requiredPrefund`, i.e. the FINAL limits × maxFeePerGas. A budget with 0.002 xDAI
 * left this epoch passes estimation and rejects the real op (`AA33 reverted 0x50b2c4e1`,
 * BudgetExceeded) after the biometric prompt, with nothing to fall back to — even though the op
 * would have cost 0.001 and the account could have paid it. Test6's #53 count died exactly so.
 *
 * Two pure pieces (tested) and one reader:
 *   • `requiredPrefund(userOp)` — what the hub is asked to reserve (EntryPoint v0.7).
 *   • `remainingBudget(budget, now)` — the hub's epoch-rolling arithmetic, mirrored from
 *     PaymasterHubLens.remaining / PaymasterHub._checkBudget.
 *   • `checkSponsorship(...)` — reads `getBudget(orgId, keccak(type ‖ id))` for the entry the
 *     builder is about to commit to and says whether the reservation fits.
 */

import { formatEther } from 'viem';
import { ethers } from 'ethers';
import { parseSponsorshipPayload, paymasterSubjectKey, SUBJECT_TYPE } from '@poa-box/core/sponsorship/codec';
import { requiredPrefundV07, remainingBudget as coreRemainingBudget } from '@poa-box/core/sponsorship/budget';
import { requireRawUint } from '@poa-box/core/amounts';
import { PaymasterHubAbi } from '@poa-box/core/abis/PaymasterHub';

// A leaf ABI keeps account/write support inside the existing lazy runtime.
export const HUB_BUDGET_ABI = PaymasterHubAbi;

/** The hub's `BudgetExceeded()` selector — shared with BudgetLib, disambiguated by the AA33 marker. */
export const BUDGET_EXCEEDED_SELECTOR = new ethers.utils.Interface(PaymasterHubAbi).getSighash('BudgetExceeded');

/**
 * Subject types whose budget lives under `keccak256(abi.encodePacked(type, id))` — the org-scoped
 * paths (ACCOUNT 0x00, HAT 0x01, CLAIM 0x05). ONBOARDING (0x03) and ORG_DEPLOY (0x04) are paid by
 * the solidarity fund through a different check and are not pre-flighted here.
 */
const KEYED_SUBJECT_TYPES = new Set([SUBJECT_TYPE.ACCOUNT, SUBJECT_TYPE.HAT, SUBJECT_TYPE.CLAIM]);

/** paymasterData layout (after the paymaster address): version(1) orgId(32) type(1) id(32) ruleId(4) mailbox(8). */
export function parsePaymasterData(hex) {
  if (typeof hex !== 'string') return null;
  try {
    const parsed = parseSponsorshipPayload(hex);
    // Preserve this host helper's historical numeric uint32 field.
    return { ...parsed, ruleId: Number(parsed.ruleId) };
  } catch {
    return null;
  }
}

export const subjectKey = paymasterSubjectKey;

/** Host operations omit self-funded paymaster gas; core takes explicit zeroes. */
export function requiredPrefund(userOp) {
  return BigInt(requiredPrefundV07({
    ...userOp,
    paymasterVerificationGasLimit: userOp.paymasterVerificationGasLimit ?? 0,
    paymasterPostOpGasLimit: userOp.paymasterPostOpGasLimit ?? 0,
  }));
}

export function remainingBudget(budget, nowSeconds) {
  return BigInt(coreRemainingBudget({
    capPerEpoch: budget.capPerEpoch ?? 0,
    usedInEpoch: budget.usedInEpoch ?? 0,
    epochLen: budget.epochLen ?? 0,
    epochStart: budget.epochStart ?? 0,
  }, nowSeconds));
}

/**
 * The hub's decision, ahead of time: `usedInEpoch + maxCost > capPerEpoch` reverts. An UNSET
 * budget (cap 0) reverts for any cost, which is how an org blocks a subject type entirely.
 */
export const EPOCH_GRACE_SECONDS = 60;

export function budgetVerdict({ budget, userOp, now, graceSeconds = EPOCH_GRACE_SECONDS }) {
  // Inclusion happens after the prompt; within a minute of the roll, judge as if it had rolled.
  // Wrong in that direction costs nothing — a genuine refusal is caught by the submission retry —
  // while wrong the other way pushes an op the hub would have sponsored onto the member's wallet.
  const epochLen = BigInt(requireRawUint(budget.epochLen ?? 0, 32));
  const epochEnd = BigInt(requireRawUint(budget.epochStart ?? 0, 32)) + epochLen;
  const current = BigInt(requireRawUint(now));
  const grace = BigInt(requireRawUint(graceSeconds));
  const at = epochLen > 0n && current < epochEnd && epochEnd - current <= grace ? epochEnd : current;
  const remaining = remainingBudget(budget, at);
  const needed = requiredPrefund(userOp);
  return { fits: needed <= remaining, remaining, needed, unset: BigInt(budget.capPerEpoch ?? 0) === 0n };
}

/**
 * Read the live budget for the entry the op carries and decide. `checked: false` means the
 * entry is not one this module can judge (solidarity paths) — the caller trusts the estimate.
 */
export async function checkSponsorship({ publicClient, paymasterAddress, userOp, now = null }) {
  const parsed = parsePaymasterData(userOp?.paymasterData);
  if (!parsed || !KEYED_SUBJECT_TYPES.has(parsed.subjectType)) return { checked: false, fits: true };
  // The hub rolls the epoch on block.timestamp, not on the member's laptop clock — read both in
  // one round of RPCs so a skewed clock near an epoch boundary cannot flip the verdict.
  const [budget, block] = await Promise.all([
    publicClient.readContract({
      address: paymasterAddress,
      abi: HUB_BUDGET_ABI,
      functionName: 'getBudget',
      args: [parsed.orgId, subjectKey(parsed.subjectType, parsed.subjectId)],
    }),
    now === null ? publicClient.getBlock({ blockTag: 'latest' }).catch(() => null) : Promise.resolve(null),
  ]);
  const at = now !== null ? now : (block?.timestamp !== undefined ? Number(block.timestamp) : Math.floor(Date.now() / 1000));
  return { checked: true, subjectType: parsed.subjectType, ...budgetVerdict({ budget, userOp, now: at }) };
}

/**
 * The rejection the hub WOULD have returned, as an Error the existing copy machinery already
 * understands: the message carries the `AA33 reverted <selector>` marker that
 * `SmartAccountTransactionManager._parseAAError` / `_composeSponsorshipDenial` decode to the
 * gas-allowance wording. Attached to the self-funded op (or its failure) exactly like a real
 * estimation-time rejection, so "why sponsorship fell through" reads the same either way.
 */
export function budgetRejection(verdict) {
  const left = formatEther(verdict.remaining ?? 0n);
  const need = formatEther(verdict.needed ?? 0n);
  const err = new Error(
    `Sponsored-gas budget pre-flight: validatePaymasterUserOp would revert — AA33 reverted ${BUDGET_EXCEEDED_SELECTOR} `
    + `(BudgetExceeded). ${verdict.unset ? 'No budget is configured for this subject' : `${left} left this period`}; `
    + `this transaction reserves up to ${need}.`
  );
  err.code = 'SPONSOR_BUDGET_EXCEEDED';
  err.remaining = verdict.remaining;
  err.needed = verdict.needed;
  return err;
}

/**
 * Is this bundler/paymaster error a sponsorship refusal (as opposed to the op itself being bad)?
 * AA31 = paymaster validation failed, AA32 = paymaster deposit too low, AA33 = validatePaymasterUserOp
 * reverted. ONE definition, shared by the builder's estimation loop and the managers' submission retry.
 */
export function isPaymasterRejection(e) {
  // viem prints the WHOLE UserOp under "Request Arguments:" in every error it throws — including
  // `paymaster: 0x…` on a sponsored op — so a bare /paymaster/ test would call an AA21, an AA23
  // out-of-gas or a plain RPC failure a "paymaster rejection" and trigger a pointless self-funded
  // retry. Judge only the diagnostic parts: the short message, details, and the message with the
  // argument dump removed.
  const text = [
    e?.shortMessage,
    e?.details,
    e?.cause?.shortMessage,
    e?.cause?.details,
    stripRequestArguments(e?.message),
    stripRequestArguments(e?.cause?.message),
  ].filter(Boolean).join('\n');
  return PAYMASTER_REJECTION_RE.test(text);
}

const PAYMASTER_REJECTION_RE = /\bAA3[123]\b|validatePaymasterUserOp|on the Paymaster reverted|paymaster (?:validation|deposit|rejected|reverted)/i;

/** Drop viem's "Request Arguments:" block (up to the next "Details:"/"Version:" line, or the end). */
export function stripRequestArguments(message) {
  if (!message) return '';
  return String(message).replace(/Request Arguments:[\s\S]*?(?=\n\s*(?:Details|Version|Docs):|$)/, '');
}

/** Rebuild an op's v0.7 factory fields into the `initCode` the builder takes. */
export function initCodeOf(userOp) {
  if (!userOp?.factory) return '0x';
  return userOp.factory + String(userOp.factoryData || '0x').slice(2);
}

export const hexToBigIntSafe = (v) => BigInt(v ?? 0);
