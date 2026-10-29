import { describe, it, expect, vi } from 'vitest';
vi.mock('@/context/POContext', () => ({ usePOContext: () => ({}) }));
vi.mock('@/context/UserContext', () => ({ useUserContext: () => ({}) }));
vi.mock('@/context/authState', () => ({ useAuth: () => ({}) }));
vi.mock('@/context/RefreshContext', () => ({ RefreshEvent: {}, useRefreshSubscription: () => {} }));
vi.mock('@/util/apolloClient', () => ({ getClient: vi.fn(), useSubgraphClient: vi.fn() }));
import { readOrgFeeFund } from '@/services/web3/domain/TreasuryService';
import { readOrgPotBalances } from '@/hooks/useOrgPotBalances';
import { readTreasuryFinancialFacts } from '@/hooks/useTreasuryReadQueries';
import { calculateTreasuryShare } from '@/hooks/useTreasuryShare';
import { paymentManagerAvailability } from '@/lib/voting/treasuryBatches';
import { prepareDistributionSnapshot, buildDistributionTree } from '@/util/merkleDistribution';

const ORG = `0x${'1'.repeat(64)}`, EXEC = `0x${'2'.repeat(40)}`, PM = `0x${'3'.repeat(40)}`;
const TM = `0x${'4'.repeat(40)}`, TOKEN = `0x${'5'.repeat(40)}`, USER = `0x${'6'.repeat(40)}`, HASH = `0x${'7'.repeat(64)}`, ROOT = `0x${'8'.repeat(64)}`;
const network = { chainId: 100, rpcUrl: 'https://rpc.invalid', subgraphUrl: 'https://index.invalid' };
const meta = { block: { number: 100, hash: HASH, timestamp: null }, hasIndexingErrors: false };
const org = module => ({ id: ORG, [module]: { id: module === 'taskManager' ? TM : PM, organization: { id: ORG } } });
function potFixture({ failRound, counter = 1n, missingCreation = false } = {}) {
  const client = { request: vi.fn(async ({ method }) => method === 'eth_chainId' ? '0x64' : { number: '0x64', hash: HASH }),
    getBalance: vi.fn(async () => 1n), readContract: vi.fn(async ({ functionName, args }) => {
      if (functionName === 'distributionCounter') return counter;
      if (functionName === 'balanceOf') return 70n;
      if (functionName === 'getDistribution') {
        if (args[0] === BigInt(failRound || 0)) throw new Error('offline missing round');
        return [TOKEN, 100n, 10n, ROOT, 100n, false];
      }
      throw new Error('Unexpected read');
    }) };
  client.multicall = vi.fn(async ({ contracts }) => contracts.map(({ args }) => args[0] === BigInt(failRound || 0)
    ? { status: 'failure', error: new Error('offline missing round') } : { status: 'success', result: [TOKEN, 100n, 10n, ROOT, 100n, false] }));
  const apollo = { query: vi.fn(async ({ query }) => ({ data: query.loc.source.body.includes('FetchDistributionsPage') ? {
    _meta: meta, organization: org('paymentManager'), distributions: missingCreation ? [] : [{ id: `${PM}-1`, distributionId: '1', payoutToken: TOKEN,
      totalAmount: '100', totalClaimed: '100', checkpointBlock: '10', createdAtBlock: '20', merkleRoot: ROOT, status: 'Active',
      paymentManager: org('paymentManager').paymentManager }],
  } : { _meta: meta } })) };
  return { client, apollo, network, orgId: ORG, token: TOKEN, decimals: 18, executor: EXEC, paymentManager: PM, bountyPool: TM };
}

describe('treasury action evidence adapter', () => {
  it('pins all three distinct balances and round reads, and closes fully claimed rounds with indexed creation proof', async () => {
    const fixture = potFixture(), data = await readOrgPotBalances(fixture);
    expect(data).toMatchObject({ executor: '70', paymentManager: '70', bountyPool: '70', error: null, distributionsTruncated: false });
    expect(paymentManagerAvailability({ evidence: data.planningEvidence })).toMatchObject({ spendable: '0', spendableAfterRelease: '70', releaseIds: ['1'] });
    fixture.client.readContract.mock.calls.forEach(([call]) => expect(call.blockNumber).toBe(100n));
    expect(fixture.client.readContract.mock.calls.filter(([call]) => call.functionName === 'balanceOf').map(([call]) => call.args[0].toLowerCase()).sort())
      .toEqual([EXEC, PM, TM].sort());
  });
  it('keeps a failed round explicit and refuses truncated counter enumeration', async () => {
    const missing = await readOrgPotBalances(potFixture({ failRound: '2', counter: 2n }));
    expect(missing.coverage).toMatchObject({ status: 'incomplete', failedIds: ['2'] });
    expect(missing.error).toBeTruthy();
    expect(missing.planningEvidence.paymentManager).toBeNull();
    const cappedFixture = potFixture({ counter: 51n });
    const capped = await readOrgPotBalances(cappedFixture);
    expect(capped.coverage.issues).toContainEqual({ code: 'ROUND_CAP' });
    expect(cappedFixture.client.readContract.mock.calls.some(([c]) => c.functionName === 'getDistribution')).toBe(false);
  });
  it('blocks free closure when creation evidence is unknown and rejects a block changing during reads', async () => {
    const unknown = await readOrgPotBalances(potFixture({ missingCreation: true }));
    expect(paymentManagerAvailability({ evidence: unknown.planningEvidence })).toMatchObject({ status: 'ready',
      committed: '100', spendable: '0', releasable: '0', releaseIds: [], spendableAfterRelease: '0' });
    expect(unknown.planningEvidence.paymentManager.data.rounds[0].creationBlock.state).toBe('unknown');
    const changed = potFixture();
    changed.client.request.mockResolvedValueOnce('0x64').mockResolvedValueOnce({ number: '0x64', hash: HASH })
      .mockResolvedValueOnce({ number: '0x64', hash: ROOT });
    await expect(readOrgPotBalances(changed)).rejects.toThrow('block changed');
  });
});

describe('financial history and unit projection', () => {
  it('retains deleted-project completion facts and returns unknown coverage for a missing page proof', async () => {
    const completed = { id: `${TM}-1`, taskId: '1', taskManager: TM, status: 'Completed', payout: '1', bountyToken: TOKEN, bountyPayout: '0',
      project: { id: `${TM}-1`, projectId: '1', deleted: true, taskManager: { id: TM, organization: { id: ORG } } } };
    const client = { query: vi.fn(async ({ query }) => {
      const text = query.loc.source.body;
      return { data: text.includes('TreasuryHistoryHead') ? { _meta: meta } : { _meta: meta,
        organization: org(text.includes('Tasks') || text.includes('Task') || text.includes('Bounties') ? 'taskManager' : 'paymentManager'),
        tasks: text.includes('TaskActivity') ? [completed] : [], distributions: [], payments: [] } };
    }) };
    const input = { client, orgId: ORG, chainId: 100, endpoint: network.subgraphUrl, taskManager: TM, paymentManager: PM };
    const facts = await readTreasuryFinancialFacts(input);
    expect(facts.completed.coverage.status).toBe('complete');
    expect(facts.completed.data[0].project.deleted).toBe(true);
    expect(facts.promised.data).toEqual([]);
    client.query.mockImplementation(async ({ query }) => ({ data: query.loc.source.body.includes('TreasuryHistoryHead') ? { _meta: meta } :
      { organization: org('taskManager'), tasks: [] } }));
    expect((await readTreasuryFinancialFacts(input)).completed.coverage.status).not.toBe('complete');
  });
  it('uses raw Shares exactly once and preserves one wei across large multi-asset balances', () => {
    const balances = [{ asset: { chainId: 100, address: TOKEN, decimals: 6 }, rawAmount: '1000001' },
      { asset: { chainId: 100, address: PM, decimals: 18 }, rawAmount: '9007199254740993000000000000000001' }];
    const share = calculateTreasuryShare({ balances, userBalanceRaw: '1000000000000000000', totalSupplyRaw: '2000000000000000000' });
    expect(share.userSharePct).toBe(0.5);
    expect(share.userPtBalance).toBe('1');
    expect(share.stableTotalRaw).toBe('9007199254740994000001000000000001');
    expect(share.treasuryShareRaw).toBe('4503599627370497000000500000000000');
    expect(() => calculateTreasuryShare({ balances, userBalanceRaw: '1', totalSupplyRaw: undefined })).toThrow();
  });
});

describe('checkpoint allocation read boundary', () => {
  it('uses actual checkpoint opt-outs and rejects incomplete holder pages', async () => {
    const fixture = potFixture();
    fixture.client.readContract.mockImplementation(() => { throw new Error('Unexpected unbatched read'); });
    fixture.client.multicall.mockResolvedValue([{ status: 'success', result: false }]);
    const holderData = { _meta: meta, organization: { id: ORG, paymentManager: { id: PM }, participationToken: { id: TOKEN, totalSupply: '1' },
      users: [{ address: USER, membershipStatus: 'Active', participationTokenBalance: '1' }] } };
    fixture.apollo.query.mockImplementation(async ({ query }) => ({ data: query.loc.source.body.includes('DistributionSnapshotHead') ? { _meta: meta } : holderData }));
    const input = { apollo: fixture.apollo, client: fixture.client, chainId: 100, orgId: ORG, holderContract: TOKEN,
      paymentManager: PM, endpoint: network.subgraphUrl, rpcEndpoint: network.rpcUrl };
    const prepared = await prepareDistributionSnapshot(input);
    expect(buildDistributionTree(prepared.holders, '1', prepared.evidence).holderCount).toBe(1);
    expect(fixture.client.readContract).not.toHaveBeenCalled();
    expect(fixture.client.multicall).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ blockNumber: 100n, allowFailure: true,
      contracts: [expect.objectContaining({ address: PM, functionName: 'isOptedOut', args: [USER] })] }));
    holderData.organization.users = Array(1000).fill(holderData.organization.users[0]);
    await expect(prepareDistributionSnapshot(input)).rejects.toThrow('incomplete');
  });
});

it('uses authoritative fee-fund getters with exact units instead of indexed subsidy arithmetic', async () => {
  const fixture = potFixture();
  fixture.client.readContract.mockImplementation(async ({ functionName }) => functionName === 'getOrgFinancials'
    ? { deposited: 9007199254740994n, spent: 9007199254740993n } : { registeredAt: 10n });
  const result = await readOrgFeeFund(fixture.client, { orgId: ORG, chainId: 100, hubAddress: PM, endpoint: network.rpcUrl });
  expect(result).toMatchObject({ available: '1', deposited: '9007199254740994', spent: '9007199254740993', registered: true });
  expect(result.source.indexed).toBe(false);
  fixture.client.readContract.mock.calls.forEach(([call]) => expect(call.blockNumber).toBe(100n));
});
