import { describe, expect, it, vi } from 'vitest';
import { fetchProtocolChainData, aggregateProtocolChains, displayRawUnits } from '@/lib/graphql/protocolData';
const addr = (digit) => `0x${digit.repeat(40)}`;
const hash = `0x${'c'.repeat(64)}`;
const meta = { block: { number: 10, hash, timestamp: 1 } };
const chain = { chainId: 100, url: 'https://protocol.invalid/graphql', name: 'Fixture' };
const network = { nativeCurrency: { symbol: 'XDAI' }, blockExplorer: 'https://explorer.invalid' };
const overview = () => ({
  _meta: meta,
  poaManagerContracts: [{ id: addr('1'), registry: addr('2'), beaconCount: '7' }],
  orgRegistryContracts: [{ id: addr('2'), totalOrgs: '0', totalContracts: '0' }],
  universalAccountRegistries: [{ id: addr('3'), totalAccounts: '9007199254740993' }],
  paymasterHubContracts: [{ id: addr('4'), solidarityBalance: '0', totalFeesCollected: '0', solidarityDistributionPaused: false,
    gracePeriodDays: '0', maxSpendDuringGrace: '0', minDepositRequired: '0' }],
  onboardingConfigs: [], orgDeployConfigs: [],
});
const queryFor = ({ orgs = [], failOrgs = false, multipleHub = false } = {}) => vi.fn(async (document, variables, source) => {
  expect(source.endpoint).toBe(chain.url); expect(source.chainId).toBe(100);
  if (document.includes('DiscoverProtocolInstances')) {
    const data = overview(); if (multipleHub) data.paymasterHubContracts.push({ id: addr('5') }); return data;
  }
  expect(variables.block).toEqual({ hash });
  if (document.includes('ProtocolOrgsPage')) {
    if (failOrgs) throw new Error('mock outage');
    return { _meta: meta, paymasterOrgConfigs: orgs };
  }
  if (document.includes('BeaconEventsPage')) return { _meta: meta, beaconUpgradeEvents: [] };
  if (document.includes('SolidarityEventsPage')) return { _meta: meta, solidarityEvents: [] };
  return overview();
});

describe('public protocol projection from actual core facts', () => {
  it('retains exact totals above safe integer range and preserves known zero, false and missing configuration', async () => {
    const amount = '900719925474099300000000000001';
    const row = { id: 'config', paymasterHub: { id: addr('4') }, totalSpent: '0', totalDeposited: amount,
      totalSolidarityReceived: '0', depositBalance: '0', stats: { totalUserOps: '9007199254740993', totalGasSponsored: '0' } };
    const result = await fetchProtocolChainData(chain, network, { query: queryFor({ orgs: [row] }) });
    expect(result.rawGasFacts.totalDeposited).toMatchObject({ state: 'known', value: amount });
    expect(result.gasUsage.totalDeposited).toBe('900719925474.099300');
    expect(result.gasUsage.totalUserOps).toBe('9007199254740993');
    expect(result.solidarity).toMatchObject({ balance: '0.0000', distributionPaused: false, feePercentageBps: null });
    expect(result.onboarding).toBeNull(); expect(result.orgDeploy).toBeNull();
    expect(aggregateProtocolChains({ 100: result }, 1).totalAccounts).toBe('9007199254740993');
  });
  it('keeps unknown gas totals distinct from empty successful enumeration and detects ambiguous protocol instances', async () => {
    const failed = await fetchProtocolChainData(chain, network, { query: queryFor({ failOrgs: true }) });
    expect(failed.gasUsage).toMatchObject({ totalSpent: null, totalUserOps: null, orgCount: null });
    const empty = await fetchProtocolChainData(chain, network, { query: queryFor() });
    expect(empty.gasUsage).toMatchObject({ totalSpent: '0.000000', totalUserOps: '0', orgCount: 0 });
    await expect(fetchProtocolChainData(chain, network, { query: queryFor({ multipleHub: true }) })).rejects.toMatchObject({ name: 'PublicDataUnavailable' });
  });
  it('rejects a donation refresh before the confirmed block is indexed, including missing proof', async () => {
    await expect(fetchProtocolChainData(chain, network, { query: queryFor(), minimumBlockNumber: '11' })).rejects.toMatchObject({ name: 'PublicDataUnavailable' });
    const query = queryFor();
    const missing = async (...args) => { const data = await query(...args); return args[0].includes('DiscoverProtocol') ? { ...data, _meta: undefined } : data; };
    await expect(fetchProtocolChainData(chain, network, { query: missing, minimumBlockNumber: '10' })).rejects.toMatchObject({ name: 'PublicDataUnavailable' });
    const malformed = async (...args) => { const data = await query(...args); return args[0].includes('DiscoverProtocol') ? { ...data, _meta: { block: { number: 10, hash: 'invalid' } } } : data; };
    await expect(fetchProtocolChainData(chain, network, { query: malformed, minimumBlockNumber: '10' })).rejects.toMatchObject({ name: 'PublicDataUnavailable' });
    expect((await fetchProtocolChainData(chain, network, { query: queryFor(), minimumBlockNumber: '10' })).source.block.number).toBe('10');
  });
  it('refuses requested-block echo, retains honest history windows, and leaves missing sources/assets unaggregated', async () => {
    const query = queryFor();
    const wrongProof = vi.fn(async (...args) => { const data = await query(...args); return args[0].includes('ProtocolOverview') ? { ...data, _meta: { block: { number: 11, hash } } } : data; });
    await expect(fetchProtocolChainData(chain, network, { query: wrongProof })).rejects.toMatchObject({ name: 'PublicDataUnavailable' });
    const result = await fetchProtocolChainData(chain, network, { query: queryFor() });
    expect(result.historyCoverage).toMatchObject({ beacon: { status: 'window', cap: 50 }, solidarity: { status: 'window', cap: 30 } });
    expect(aggregateProtocolChains({ 100: result }, 2)).toMatchObject({ totalAccounts: null, totalOrgs: null, totalUserOps: null, isComplete: false });
    expect(aggregateProtocolChains({ 100: result, 42161: { ...result, nativeCurrency: 'ETH' } }, 2).totalGasSponsored).toBeNull();
    expect(aggregateProtocolChains({}, 0)).toMatchObject({ totalOrgs: null, isComplete: false });
    expect(displayRawUnits(null)).toBeNull(); expect(displayRawUnits('1000000500000000000')).toBe('1.000001');
  });
});
