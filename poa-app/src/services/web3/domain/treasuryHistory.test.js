import { describe, it, expect } from 'vitest';
import { treasuryHistorySummary } from '@/components/treasury/historySummary';
const TOKEN = `0x${'1'.repeat(40)}`, OTHER = `0x${'2'.repeat(40)}`;
const assets = [{ chainId: 100, address: TOKEN, decimals: 6, symbol: 'USDC' }, { chainId: 100, address: OTHER, decimals: 18, symbol: 'MiXeD' }];
const snapshot = data => ({ source: { chainId: 100, endpoint: 'https://index.invalid', method: 'graphql', indexed: true, snapshot: 'pinned', block: { number: '100' } },
  data, coverage: { status: 'complete', receivedKeys: [], missingIds: [], failedIds: [], issues: [] } });
const facts = () => ({ payments: snapshot([{ token: TOKEN, amount: '1000001' }, { token: OTHER, amount: '9007199254740993123456789' }]),
  distributions: snapshot([{ payoutToken: TOKEN, totalAmount: '1234567', totalClaimed: '1' }, { payoutToken: OTHER, totalAmount: '9007199254740993123456789', totalClaimed: '9007199254740993123456788' }]) });
describe('complete asset-separated treasury summary', () => {
  it('retains one wei and large integer units without summing incompatible assets', () => {
    const summary = treasuryHistorySummary(facts(), assets);
    expect(summary.state).toBe('known');
    expect(summary.assets.map(row => [row.asset.symbol, row.totalReceived, row.totalClaimed])).toEqual([
      ['USDC', '1000001', '1'], ['MiXeD', '9007199254740993123456789', '9007199254740993123456788'],
    ]);
    expect(summary.paymentCount).toBe(2);
  });
  it('keeps incomplete pages, missing units, unaligned sources and missing amounts unknown', () => {
    for (const mutate of [f => { f.payments.coverage.status = 'incomplete'; },
      f => { f.payments.source.block.number = '101'; }, f => { delete f.distributions.data[0].totalClaimed; }]) {
      const invalid = facts(); mutate(invalid);
      expect(treasuryHistorySummary(invalid, assets).state).toBe('unknown');
    }
    expect(treasuryHistorySummary(facts(), assets.slice(0, 1)).state).toBe('unknown');
    expect(treasuryHistorySummary(undefined, assets).state).toBe('unknown');
    expect(treasuryHistorySummary({ payments: snapshot([]), distributions: snapshot([]) }, assets)).toMatchObject({ state: 'known', paymentCount: 0, distributionCount: 0, assets: [] });
  });
});
