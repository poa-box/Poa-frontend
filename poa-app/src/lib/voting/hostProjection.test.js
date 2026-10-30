import { describe, expect, it } from 'vitest';
import { indexedParticipationBalance } from '@/lib/voting/rawBalance';
import { proposalTallyView } from '@/lib/voting/hostProjection';

describe('host voting projection', () => {
  it('retains 1 wei and very large balances without recovering them from display text', () => {
    const asset = { chainId: 100, address: `0x${'11'.repeat(20)}`, orgId: 'org', endpoint: 'index' };
    for (const raw of ['1', '900719925474099312345678901234567890']) {
      expect(indexedParticipationBalance(raw, asset)).toEqual({ participationTokenBalanceWei: raw, participationTokenBalanceAsset: asset });
    }
    for (const raw of [null, undefined, '1.5', '-1']) expect(indexedParticipationBalance(raw, asset).participationTokenBalanceWei).toBeNull();
  });
  it('uses class slices, exact rounding, weighted allocations and announced winner provenance', () => {
    const proposal = { proposalId: '4', numOptions: 2, winningOption: '1', isValid: true,
      votes: [
        { voter: 'a', optionIndexes: [0, 1], optionWeights: [25, 75], classRawPowers: ['100', '0'] },
        { voter: 'b', optionIndexes: [0], optionWeights: [100], classRawPowers: ['0', '10000000000000000000000'] },
      ] };
    const result = proposalTallyView(proposal, 'Hybrid', [{ slicePct: 60 }, { slicePct: 40 }], 51, 2);
    expect(result.scores).toEqual([55, 45]);
    expect(result.results.announcedWinningOption).toBe(1);
    expect(result.results.winner.option).toBe(1);
    expect(result.complete).toBe(false);
    const partial = proposalTallyView({ ...proposal, votes: [{ optionIndexes: [0], optionWeights: [100] }] }, 'Hybrid', [{ slicePct: 100 }]);
    expect(partial.known).toBe(false);
  });
  it('counts split DD allocations and does not substitute a predicted winner before announcement', () => {
    const result = proposalTallyView({ numOptions: 2, votes: [{ optionIndexes: [0, 1], optionWeights: [25, 75] }] }, 'Direct Democracy', []);
    expect(result.scores).toEqual([25, 75]);
    expect(result.results.winner).toBeNull();
    expect(result.totalVotes).toBe(1);
  });  it('does not crash or count malformed preview allocations as known totals', () => {
    for (const ballot of [
      { optionIndexes: [0, 0], optionWeights: [50, 50] },
      { optionIndexes: [0, 1], optionWeights: [0.5, 99.5] },
      { optionIndexes: [0], optionWeights: ['100'] },
      { optionIndexes: [0], optionWeights: undefined },
    ]) {
      const result = proposalTallyView({ numOptions: 2, winningOption: '1', isValid: true, votes: [ballot] }, 'Direct Democracy', []);
      expect(result.known).toBe(false);
      expect(result.complete).toBe(false);
      expect(result.results.announcedWinningOption).toBe(1);
    }
  });

});
