import { describe, it, expect } from 'vitest';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { buildDistributionTree } from '@/util/merkleDistribution';
import { buildDistributionClaimsDocument, verifyDistributionClaimsDocument, findDistributionClaim } from '@poa-box/core/metadata/distribution';

const ORG = `0x${'4'.repeat(64)}`, PM = `0x${'5'.repeat(40)}`, PT = `0x${'6'.repeat(40)}`;
const CID = 'QmYwAPJzv5CZsnAzt8auVZRnGi2CJLNm5KWCVUPnZTkqmn';
const address = n => `0x${n.toString(16).padStart(40, '0')}`;
const holders = balances => balances.map((balance, i) => ({ address: address(i + 1), balance, membershipStatus: 'Active' }));
function evidence(rows) {
  const checkpoint = { number: '100', hash: `0x${'7'.repeat(64)}` };
  const source = { chainId: 100, orgId: ORG, endpoint: 'https://index.invalid', method: 'graphql', indexed: true, snapshot: 'pinned',
    block: checkpoint, contracts: { participationToken: PT, paymentManager: PM } };
  const coverage = { status: 'complete', receivedKeys: rows.map(h => h.address), missingIds: [], failedIds: [], issues: [] };
  return { chainId: 100, orgId: ORG, holderContract: PT, paymentManager: PM, checkpoint,
    holders: { source: { ...source, contract: PT }, data: rows.map(h => ({ address: h.address, participationTokenBalance: h.balance, membershipStatus: h.membershipStatus })), coverage },
    optOutFacts: { source: { ...source, contract: PM }, data: rows.map(h => ({ address: h.address, optedOut: false })), coverage } };
}
function documentFor(result) {
  return buildDistributionClaimsDocument({ token: PT, tokenSymbol: 'MiXeD', totalAmount: result.totalDistributed,
    checkpointBlock: '100', merkleRoot: result.root, claims: result.claims, createdAt: 1000 });
}
const reference = doc => ({ chainId: 100, orgId: ORG, paymentManager: PM, distributionId: '1', cid: CID,
  merkleRoot: doc.merkleRoot, token: doc.token, totalAmount: doc.totalAmount, checkpointBlock: '100' });

describe('frontend distribution policy through core', () => {
  it('preserves sorted last-address dust and the historic 5/2/3 root regardless of input order', () => {
    const rows = holders(['2', '1', '1']);
    const result = buildDistributionTree([...rows].reverse(), '10', evidence(rows));
    expect(Object.values(result.claims).map(c => c.amount)).toEqual(['5', '2', '3']);
    const expected = StandardMerkleTree.of([[address(1), '5'], [address(2), '2'], [address(3), '3']], ['address', 'uint256']);
    expect(result.root).toBe(expected.root);
  });
  it('omits zero leaves for one wei and verifies 1/3/5/7-holder proofs and large raw amounts', () => {
    for (const count of [1, 3, 5, 7]) {
      const rows = holders(Array(count).fill('9007199254740993'));
      for (const total of ['1', '9007199254740993123456789']) {
        const result = buildDistributionTree(rows, total, evidence(rows));
        expect(Object.values(result.claims).reduce((sum, c) => sum + BigInt(c.amount), 0n).toString()).toBe(total);
        if (total === '1') expect(result.holderCount).toBe(1);
        for (const [who, claim] of Object.entries(result.claims)) {
          expect(StandardMerkleTree.verify(result.root, ['address', 'uint256'], [who, claim.amount], claim.proof)).toBe(true);
        }
      }
    }
  });
  it('verifies old stored claims independently of changed holder balances and rejects binding/proof tampering', () => {
    const rows = holders(['2', '1', '1']), result = buildDistributionTree(rows, '10', evidence(rows));
    const doc = documentFor(result), ref = reference(doc);
    const verified = verifyDistributionClaimsDocument(doc, { reference: ref, loadedCid: CID });
    expect(findDistributionClaim(verified, address(3))).toEqual({ state: 'known', value: result.claims[address(3)] });
    expect(findDistributionClaim(verified, address(99))).toEqual({ state: 'known', value: null });
    for (const invalid of [ { ...doc, totalAmount: '11' }, { ...doc, checkpointBlock: '101' },
      { ...doc, token: PM }, { ...doc, claims: { ...doc.claims, [address(1)]: { amount: '6', proof: doc.claims[address(1)].proof } } } ]) {
      expect(verifyDistributionClaimsDocument(invalid, { reference: ref, loadedCid: CID }).state).toBe('unknown');
    }
    expect(verifyDistributionClaimsDocument(doc, { reference: ref, loadedCid: 'Qm' + '1'.repeat(44) }).state).toBe('unknown');
  });
  it('refuses missing or partial snapshots and unknown opt-outs rather than inventing eligibility', () => {
    const rows = holders(['1']);
    expect(() => buildDistributionTree(rows, '1')).toThrow('snapshot');
    const partial = evidence(rows); partial.holders.coverage.status = 'incomplete';
    expect(() => buildDistributionTree(rows, '1', partial)).toThrow();
    const missing = evidence(rows); missing.optOutFacts.data = [];
    expect(() => buildDistributionTree(rows, '1', missing)).toThrow('OPT_OUT_UNKNOWN');
  });
});
