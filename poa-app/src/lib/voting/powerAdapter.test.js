import { describe, expect, it } from 'vitest';
import { classPowerFact, computeClassEntry, proposalEligibilityFact, bindPowerEvidence } from './powerAdapter';
import { knownFact, unknownFact } from '@poa-box/core/data/facts';
import { projectProposalPowerSnapshot, deriveWeightedTally, rankAllocationWeights } from '@poa-box/core/governance/power';
import { voterEligibility } from '@/components/voting/votingDisplay';

const asset = '0x1111111111111111111111111111111111111111';
const account = '0x2222222222222222222222222222222222222222';
const authorityAddress = '0x3333333333333333333333333333333333333333';
const cls = { strategy: 'ERC20_BAL', slicePct: 100, minBalance: '1', asset, hatIds: [], quadratic: false };
const coverage = { status: 'complete', receivedKeys: [], missingIds: [], failedIds: [], issues: [] };
const scope = { chainId: 100, orgId: 'org', account, contract: asset, contracts: { membershipAuthority: authorityAddress } };
const source = { ...scope, endpoint: 'mock://governance', method: 'fixture', indexed: true, snapshot: 'pinned', block: { number: '123' } };
const snapshot = data => ({ source, coverage, data });

describe('exact host power projection', () => {
  it('uses raw sub-share balances, gates before strategy, and retains exact uint values', () => {
    expect(classPowerFact(cls, [], '1', asset)).toEqual(knownFact('100'));
    expect(classPowerFact({ ...cls, minBalance: '2' }, [], '1', asset)).toEqual(knownFact('0'));
    expect(classPowerFact({ ...cls, hatIds: ['900719925474099312345'] }, [], '999999999999999999999', asset)).toEqual(knownFact('0'));
    expect(classPowerFact({ ...cls, quadratic: true }, [], '999999999999999999999999', asset)).toEqual(knownFact('99999999999900'));
    expect(classPowerFact(cls, [], '900719925474099312345', asset)).toEqual(knownFact('90071992547409931234500'));
  });

  it('keeps missing, wrong-asset, unknown strategy and overflow power unknown', () => {
    expect(classPowerFact(cls, [], undefined, asset).state).toBe('unknown');
    expect(classPowerFact(cls, [], '100', account).state).toBe('unknown');
    expect(classPowerFact({ ...cls, strategy: 'UNKNOWN' }, [], '100', asset).state).toBe('unknown');
    expect(classPowerFact(cls, [], ((1n << 256n) - 1n).toString(), asset).state).toBe('unknown');
  });

  it('does not reconstruct a denominator from rounded leaderboard text', () => {
    const input = { cls, userBalanceWei: '1500000000000000000', balanceAsset: asset,
      leaderboardData: [{ token: '2', hatIds: [] }] };
    const unknown = computeClassEntry(input);
    expect(unknown.eligible).toBe(true);
    expect(unknown.shareKnown).toBe(false);
    expect(unknown.userRawPowerExact).toBe('150000000000000000000');
    const known = computeClassEntry({ ...input, leaderboardData: [
      { participationTokenBalanceWei: '1500000000000000000', hatIds: [] },
      { participationTokenBalanceWei: '500000000000000000', hatIds: [] },
    ] });
    expect(known.userClassSharePct).toBe(0.75);
    expect(known.contributionToTotalPct).toBe(75);
    expect(known.approximate).toBe(true);
  });

  it('requires immutable subject bindings before claiming a proposal class vote', () => {
    const project = bindings => projectProposalPowerSnapshot({ scope, snapshot: snapshot({
      classes: knownFact([{ ...cls, strategy: 'DIRECT' }]), proposalClassSubjects: bindings,
      createdAt: knownFact('100'), restrictedSubjectIds: knownFact([]),
    }) });
    const unknown = project(unknownFact('IMMUTABLE_BINDINGS_MISSING'));
    expect(unknown.state).toBe('known');
    expect(proposalEligibilityFact({ scope, proposal: unknown.value, viewerIsExecutor: knownFact(false) }).state).toBe('unknown');
    const known = project(knownFact(['0']));
    expect(proposalEligibilityFact({ scope, proposal: known.value, viewerIsExecutor: knownFact(false) })).toEqual(knownFact(true));
    const foreign = { ...scope, chainId: 42161 };
    const bound = bindPowerEvidence({ scope, proposal: known.value, viewerIsExecutor: knownFact(false) }, foreign);
    expect(proposalEligibilityFact(bound).state).toBe('unknown');
    expect(proposalEligibilityFact({ scope: foreign, proposal: known.value, viewerIsExecutor: knownFact(false) }).state).toBe('unknown');
  });

  it('rejects a restored balance belonging to a different account even for an open class', () => {
    const projected = projectProposalPowerSnapshot({ scope, snapshot: snapshot({
      classes: knownFact([cls]), proposalClassSubjects: knownFact(['0']),
      createdAt: knownFact('100'), restrictedSubjectIds: knownFact([]),
    }) });
    const stale = { scope, proposal: projected.value, viewerIsExecutor: knownFact(false),
      balanceScope: { ...scope, account: authorityAddress },
      balances: { [asset]: knownFact('100', { ...source, account: authorityAddress }) } };
    expect(proposalEligibilityFact(stale).state).toBe('unknown');
    stale.balances[asset] = knownFact('100', source);
    expect(proposalEligibilityFact(stale)).toEqual(knownFact(true));
  });

  it('does not authorize or deny a ballot from unknown post-gate power', () => {
    expect(voterEligibility({ type: 'Hybrid' }, [], { proposalClasses: [cls], userBalance: undefined,
      balanceAsset: asset })).toEqual({ eligible: true, reason: null, indeterminate: true });
  });

  it('separates allocation rankings from class-weighted results, including ties and abstain', () => {
    const result = deriveWeightedTally({ perOptionClassRaw: [['100', '0'], ['0', '200'], ['100', '200']],
      totalsRaw: ['200', '400'], slices: [70, 30] });
    expect(result).toEqual(knownFact(['350000', '150000', '500000']));
    expect(rankAllocationWeights(['100', '100', '200']).map(row => [row.optionIndex, row.tied])).toEqual([[2, false], [0, true], [1, true]]);
  });
});
