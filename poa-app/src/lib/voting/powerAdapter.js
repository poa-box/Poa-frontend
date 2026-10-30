/** Presentation projection of core power facts. No balance is reconstructed from display text. */
import { requireRawUint } from '@poa-box/core/amounts';
import { knownFact, unknownFact } from '@poa-box/core/data/facts';
import { calculateClassRawPower, derivePersonalVotingShare, deriveClassEligibility } from '@poa-box/core/governance/power';
import { normalizeSubjectId } from '@poa-box/core/authority/ids';

export function normalizeVotingSubject(id) {
  try { return normalizeSubjectId(id); } catch { return ''; }
}

export function holdsClassRole(hatIds = [], userHatIds = []) {
  if (!hatIds.length) return true;
  const mine = new Set(userHatIds.map(normalizeVotingSubject).filter(Boolean));
  return hatIds.some(id => mine.has(normalizeVotingSubject(id)));
}

export function classPowerFact(cls, userHatIds = [], balanceWei, balanceAsset) {
  if (!cls || !Array.isArray(cls.hatIds || []) || !Array.isArray(userHatIds)) return unknownFact('CLASS_UNAVAILABLE');
  const strategy = cls.strategy === 0 || cls.strategy === '0' ? 'DIRECT'
    : cls.strategy === 1 || cls.strategy === '1' ? 'ERC20_BAL' : cls.strategy;
  if (strategy === 'ERC20_BAL' && typeof cls.quadratic !== 'boolean') return unknownFact('CLASS_UNAVAILABLE');
  const assetMatches = strategy === 'DIRECT' || (typeof cls.asset === 'string'
    && typeof balanceAsset === 'string' && cls.asset.toLowerCase() === balanceAsset.toLowerCase());
  let minBalance;
  let balance;
  try {
    minBalance = requireRawUint(cls.minBalance?._isBigNumber ? cls.minBalance.toString() : cls.minBalance ?? '0');
    balance = assetMatches && balanceWei != null ? knownFact(requireRawUint(balanceWei)) : unknownFact('EXACT_ASSET_BALANCE_UNAVAILABLE');
  } catch { return unknownFact('POWER_INVALID_OR_OVERFLOW'); }
  return calculateClassRawPower({
    classConfig: knownFact({ ...cls, strategy, quadratic: Boolean(cls.quadratic), minBalance }),
    eligible: knownFact(holdsClassRole(cls.hatIds || [], userHatIds)),
    balance,
  });
}

// Ratios become floating point only at the display boundary.
const ratio = (a, b) => Number(BigInt(a) * 1_000_000_000_000n / BigInt(b)) / 1_000_000_000_000;

export function computeClassEntry({ cls, userHatIds = [], userBalanceWei, balanceAsset,
  leaderboardData = [], poMembers = 0, roleNames = [] }) {
  const power = classPowerFact(cls, userHatIds, userBalanceWei, balanceAsset);
  const direct = cls.strategy === 'DIRECT' || cls.strategy === 0 || cls.strategy === '0';
  const base = {
    ...cls, classIndex: Number(cls.classIndex ?? 0), strategy: direct ? 'DIRECT' : cls.strategy,
    slicePct: Number(cls.slicePct), roleNames, label: '', eligible: false,
    ineligibleReason: null, userRawPower: 0, userRawPowerExact: power.state === 'known' ? power.value : null,
    userClassSharePct: 0, contributionToTotalPct: 0, approximate: true,
    indeterminate: power.state !== 'known', powerFact: power,
  };
  if (power.state !== 'known') return base;
  if (power.value === '0') {
    const reason = !holdsClassRole(cls.hatIds || [], userHatIds) ? 'no_role'
      : userBalanceWei === '0' ? 'no_balance' : 'below_min_balance';
    return { ...base, ineligibleReason: reason };
  }
  let total;
  let holders;
  if (direct) {
    const eligible = leaderboardData.filter(user => holdsClassRole(cls.hatIds || [], user.hatIds || []));
    holders = eligible.length || poMembers || 1;
    total = knownFact((BigInt(holders) * 100n).toString());
  } else {
    const powers = leaderboardData.map(user => classPowerFact(cls, user.hatIds || [],
      user.participationTokenBalanceWei, balanceAsset));
    total = powers.length && powers.every(fact => fact.state === 'known')
      ? knownFact(powers.reduce((sum, fact) => sum + BigInt(fact.value), 0n).toString())
      : unknownFact('EXACT_ELECTORATE_BALANCES_UNAVAILABLE');
  }
  const share = derivePersonalVotingShare({ rawPower: power, totalRawPower: total,
    slicePct: Number(cls.slicePct), denominatorKind: 'estimate' });
  const shareKnown = share.state === 'known';
  // Existing display fields retain their units; exact contract power is exposed separately.
  const displayScale = direct ? 100 : cls.quadratic ? 100e9 : 100e18;
  return { ...base, eligible: true, indeterminate: false, shareKnown,
    userRawPower: Number(power.value) / displayScale,
    userClassSharePct: shareKnown ? ratio(share.value.numerator, share.value.denominator) : 0,
    contributionToTotalPct: shareKnown ? ratio(share.value.percentNumerator, share.value.percentDenominator) : 0,
    shareFact: share, ...(direct ? { _holders: holders } : {}) };
}

/** Immutable proposal powers stay exact through optimistic display as well as gates. */
function proposalPowerFacts(input) {
  return input.proposal.data.classes.map((cls, classIndex) => calculateClassRawPower({
    classConfig: knownFact(cls, input.proposal.source),
    eligible: deriveClassEligibility({ ...input, classIndex }),
    balance: input.balances?.[String(cls.asset).toLowerCase()] || unknownFact('EXACT_ASSET_BALANCE_UNAVAILABLE'),
    balanceScope: { ...input.balanceScope, chainId: input.scope.chainId,
      orgId: input.scope.orgId, account: input.scope.account },
  }));
}

export function proposalRawPowerPreview(input) {
  try {
    const powers = proposalPowerFacts(input);
    return powers.length && powers.every(power => power.state === 'known') ? powers.map(power => power.value) : undefined;
  } catch { return undefined; }
}

export function proposalEligibilityFact(input) {
  try {
    const powers = proposalPowerFacts(input);
    if (powers.some(power => power.state === 'known' && power.value !== '0')) return knownFact(true);
    if (!powers.length || powers.some(power => power.state === 'unknown')) return unknownFact('PROPOSAL_POWER_UNAVAILABLE');
    return knownFact(false);
  } catch { return unknownFact('PROPOSAL_POWER_UNAVAILABLE'); }
}

/** Rebind expected identity to the mounted host scope; stored evidence never selects the account. */
export function bindPowerEvidence(evidence, scope) {
  return evidence ? { ...evidence, scope: { ...evidence.scope, ...scope } } : undefined;
}
