import { describe, it, expect } from 'vitest';
import { committedBountiesByToken, bountyShortfall } from './bountyFunding';

const BREAD = '0xA555d5344f6FB6c65da19e403Cb4c1eC4a1a5Ee3';
const evidence = projects => ({ snapshot: { source: { chainId: 100, endpoint: 'https://index.invalid', method: 'graphql', indexed: true, snapshot: 'pinned', block: { number: '100' } },
  data: (projects || []).flatMap(p => p?.bountyTasks || []), coverage: { status: 'complete', receivedKeys: [], missingIds: [], failedIds: [], issues: [] } },
  assets: [{ chainId: 100, address: BREAD.toLowerCase(), decimals: 18 }, { chainId: 100, address: '0xddafbb505ad214d7b80b1f830fccc89b60fb7a83', decimals: 6 }] });
const USDC = '0xddafbb505ad214d7b80b1f830fccc89b60fb7a83';

describe('committedBountiesByToken', () => {
  it('sums bounty payouts per token across projects, keyed lowercase', () => {
    const projects = [
      { bountyTasks: [
        { bountyToken: BREAD, bountyPayout: '20000000000000000000' },
        { bountyToken: BREAD.toLowerCase(), bountyPayout: '100000000000000000000' },
      ] },
      { bountyTasks: [
        { bountyToken: USDC, bountyPayout: '5000000' },
      ] },
    ];
    expect(committedBountiesByToken(projects, evidence(projects))).toEqual({
      [BREAD.toLowerCase()]: '120000000000000000000',
      [USDC]: '5000000',
    });
  });

  it('keeps malformed or unknown-asset bounty amounts unknown', () => {
    const projects = [
      { bountyTasks: [
        { bountyToken: '0x0000000000000000000000000000000000000000', bountyPayout: '5' },
        { bountyToken: BREAD, bountyPayout: '0' },
        { bountyToken: BREAD, bountyPayout: 'not-a-number' },
        { bountyToken: null, bountyPayout: '5' },
      ] },
    ];
    expect(committedBountiesByToken(projects, evidence(projects))).toBeNull();
  });

  it('handles missing projects, missing bountyTasks and empty input', () => {
    expect(committedBountiesByToken()).toBeNull();
    expect(committedBountiesByToken([], evidence([]))).toEqual({});
    expect(committedBountiesByToken([null, {}, { bountyTasks: null }])).toBeNull();
  });
});

describe('bountyShortfall', () => {
  it('returns committed minus balance when underfunded', () => {
    expect(bountyShortfall('100000000000000000000', '280000000000000000000'))
      .toBe('180000000000000000000');
  });

  it('returns 0 when the pool covers everything (or over-covers)', () => {
    expect(bountyShortfall('280000000000000000000', '280000000000000000000')).toBe('0');
    expect(bountyShortfall('300000000000000000000', '280000000000000000000')).toBe('0');
  });

  it('keeps missing or malformed values unknown', () => {
    expect(bountyShortfall(undefined, '5')).toBeNull();
    expect(bountyShortfall('junk', '5')).toBeNull();
    expect(bountyShortfall('5', undefined)).toBeNull();
  });
});

it('refuses partial pages and preserves exact one-wei obligations', () => {
  const input = evidence([{ bountyTasks: [{ bountyToken: BREAD, bountyPayout: '9007199254740993' }, { bountyToken: BREAD, bountyPayout: '1' }] }]);
  expect(committedBountiesByToken(null, input)[BREAD.toLowerCase()]).toBe('9007199254740994');
  input.snapshot.coverage.status = 'incomplete';
  expect(committedBountiesByToken(null, input)).toBeNull();
});
