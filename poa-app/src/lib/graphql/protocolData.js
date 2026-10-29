import { print } from 'graphql';
import { FETCH_PROTOCOL_OVERVIEW, FETCH_BEACON_EVENTS_PAGE, FETCH_SOLIDARITY_EVENTS_PAGE } from '@poa-box/core/graph/documents/protocol';
import { readProtocolOverviewFacts, readProtocolOrgFacts, sumIndexedOrgGasFacts } from '@poa-box/core/reads/protocol';
import { requireRawUint } from '@poa-box/core/amounts';
import { coreDocument } from '@/lib/graphql/coreDocuments';
import { createApolloProtocolQuery, PublicDataUnavailable } from '@/lib/graphql/coreQuery';

const SINGLETONS = ['poaManagerContracts', 'orgRegistryContracts', 'universalAccountRegistries', 'paymasterHubContracts', 'onboardingConfigs', 'orgDeployConfigs'];
// Discover public instance identity, never choose the first of several registries/hubs.
export const PROTOCOL_DISCOVERY_QUERY = print(coreDocument(FETCH_PROTOCOL_OVERVIEW, {
  name: 'DiscoverProtocolInstances', variables: '$block: Block_height',
  fields: { ...Object.fromEntries(SINGLETONS.map((field) => [field, { args: 'first: 2, block: $block' }])),
    _meta: { add: 'hasIndexingErrors' } },
}));
const historyWindow = (kind) => print(coreDocument(kind === 'beacon' ? FETCH_BEACON_EVENTS_PAGE : FETCH_SOLIDARITY_EVENTS_PAGE, {
  variables: kind === 'beacon' ? '$manager: String!, $block: Block_height' : '$hub: String!, $block: Block_height',
  fields: kind === 'beacon'
    ? { beaconUpgradeEvents: { args: 'where: { poaManager: $manager }, first: 50, orderBy: upgradedAt, orderDirection: desc, block: $block' } }
    : { solidarityEvents: { args: 'where: { paymasterHub: $hub }, first: 30, orderBy: eventAt, orderDirection: desc, block: $block' } },
}));
export const RECENT_BEACONS = historyWindow('beacon');
export const RECENT_SOLIDARITY = historyWindow('solidarity');

const rawOrNull = (value) => { try { return requireRawUint(value); } catch { return null; } };
/** Exact display rounding happens only after core has validated raw integer units. */
export function displayRawUnits(value, places = 6) {
  const raw = rawOrNull(value);
  if (raw === null) return null;
  const divisor = 10n ** BigInt(18 - places);
  const scaled = (BigInt(raw) + divisor / 2n) / divisor;
  const unit = 10n ** BigInt(places);
  return `${scaled / unit}.${(scaled % unit).toString().padStart(places, '0')}`;
}
const displayed = (fact) => fact.state === 'known' ? displayRawUnits(fact.value) : null;
const first = (data, collection) => data[collection]?.[0] || null;
const addressOf = (data, collection) => {
  const rows = data[collection];
  if (!Array.isArray(rows) || rows.length !== 1 || !/^0x[\da-f]{40}$/i.test(rows[0]?.id)) throw new PublicDataUnavailable();
  return rows[0].id.toLowerCase();
};
const blockVariables = (source) => source.snapshot !== 'pinned' ? {} : {
  block: source.block.hash ? { hash: source.block.hash } : { number: Number(source.block.number) },
};

export async function fetchProtocolChainData(chain, network, { query = createApolloProtocolQuery({ fetchPolicy: 'network-only' }), minimumBlockNumber } = {}) {
  const base = { chainId: chain.chainId, endpoint: chain.url, indexed: true, snapshot: 'latest', method: 'graph' };
  const discovery = await query(PROTOCOL_DISCOVERY_QUERY, {}, base);
  if (discovery._meta?.hasIndexingErrors) throw new PublicDataUnavailable();
  if (minimumBlockNumber != null) {
    const minimum = requireRawUint(minimumBlockNumber);
    const observed = rawOrNull(discovery._meta?.block?.number);
    if (observed === null || BigInt(observed) < BigInt(minimum)) throw new PublicDataUnavailable();
  }
  const contracts = {
    manager: addressOf(discovery, 'poaManagerContracts'), registry: addressOf(discovery, 'orgRegistryContracts'),
    accountRegistry: addressOf(discovery, 'universalAccountRegistries'), hub: addressOf(discovery, 'paymasterHubContracts'),
  };
  const source = { ...base, contract: contracts.hub, contracts };
  // A requested block becomes a pin only from actual same-response _meta evidence.
  const block = discovery._meta?.block;
  if (rawOrNull(block?.number) !== null && (block.hash == null || /^0x[\da-f]{64}$/i.test(block.hash))) {
    source.snapshot = 'pinned';
    source.block = { number: rawOrNull(block.number), ...(block.hash ? { hash: block.hash } : {}) };
  }
  if (minimumBlockNumber != null && source.snapshot !== 'pinned') throw new PublicDataUnavailable();
  const [overview, orgs, beaconResult, solidarityResult] = await Promise.all([
    readProtocolOverviewFacts(source, query), readProtocolOrgFacts({ source, query }),
    query(RECENT_BEACONS, { manager: contracts.manager, ...blockVariables(source) }, { ...source, contract: contracts.manager })
      .then((data) => ({ data }), () => ({ data: null })),
    query(RECENT_SOLIDARITY, { hub: contracts.hub, ...blockVariables(source) }, source)
      .then((data) => ({ data }), () => ({ data: null })),
  ]);
  // Overview mismatches/partial response cannot be promoted to installed configuration.
  if (overview.coverage.status !== 'complete') throw new PublicDataUnavailable(overview.coverage);
  const data = overview.data;
  const pm = first(data, 'paymasterHubContracts');
  const onboarding = first(data, 'onboardingConfigs');
  const deploy = first(data, 'orgDeployConfigs');
  const gasFacts = sumIndexedOrgGasFacts(orgs);
  const beaconRows = Array.isArray(beaconResult.data?.beaconUpgradeEvents) ? beaconResult.data.beaconUpgradeEvents : null;
  const solidarityRows = Array.isArray(solidarityResult.data?.solidarityEvents) ? solidarityResult.data.solidarityEvents : null;
  const gasUsage = {
    totalSpent: displayed(gasFacts.totalSpent), totalDeposited: displayed(gasFacts.totalDeposited),
    totalSolidarityReceived: displayed(gasFacts.totalSolidarityReceived), currentBalance: displayed(gasFacts.depositBalance),
    totalUserOps: gasFacts['stats.totalUserOps'].state === 'known' ? gasFacts['stats.totalUserOps'].value : null,
    totalGasSponsored: displayed(gasFacts['stats.totalGasSponsored']),
    orgCount: orgs.coverage.status === 'complete' ? orgs.data.length : null,
  };
  return {
    name: chain.name, chainId: chain.chainId, blockExplorer: network?.blockExplorer || '',
    nativeCurrency: network?.nativeCurrency?.symbol || '', source: overview.source,
    infrastructure: first(data, 'poaManagerContracts'), orgStats: first(data, 'orgRegistryContracts'),
    accountStats: first(data, 'universalAccountRegistries'), paymaster: pm,
    beaconUpgrades: beaconRows || [], solidarityEvents: solidarityRows || [],
    historyCoverage: { beacon: { status: beaconRows ? 'window' : 'unavailable', cap: 50 }, solidarity: { status: solidarityRows ? 'window' : 'unavailable', cap: 30 } },
    gasUsage, rawGasFacts: gasFacts, gasCoverage: orgs.coverage,
    solidarity: pm ? {
      balance: displayRawUnits(pm.solidarityBalance, 4), totalFeesCollected: displayRawUnits(pm.totalFeesCollected),
      distributionPaused: typeof pm.solidarityDistributionPaused === 'boolean' ? pm.solidarityDistributionPaused : null,
      // Fee percentage is not indexed by these documents; a deployment default is not observed state.
      feePercentageBps: null,
    } : null,
    grace: pm ? {
      initialGraceDays: rawOrNull(pm.gracePeriodDays), maxSpendDuringGrace: displayRawUnits(pm.maxSpendDuringGrace, 4),
      minDepositRequired: displayRawUnits(pm.minDepositRequired, 4),
    } : null,
    onboarding: onboarding ? {
      maxGasPerCreation: displayRawUnits(onboarding.maxGasPerCreation, 4), dailyCreationLimit: rawOrNull(onboarding.dailyCreationLimit),
      enabled: typeof onboarding.enabled === 'boolean' ? onboarding.enabled : null, accountRegistry: onboarding.accountRegistry,
    } : null,
    orgDeploy: deploy ? {
      maxGasPerDeploy: displayRawUnits(deploy.maxGasPerDeploy, 4), dailyDeployLimit: rawOrNull(deploy.dailyDeployLimit),
      maxDeploysPerAccount: rawOrNull(deploy.maxDeploysPerAccount), enabled: typeof deploy.enabled === 'boolean' ? deploy.enabled : null,
      orgDeployer: deploy.orgDeployer,
    } : null,
  };
}

export function aggregateProtocolChains(chains, expectedCount) {
  const rows = Object.values(chains);
  const complete = expectedCount > 0 && rows.length === expectedCount;
  const sum = (get) => {
    const values = rows.map((row) => rawOrNull(get(row)));
    return complete && values.every((value) => value !== null) ? values.reduce((total, value) => total + BigInt(value), 0n).toString() : null;
  };
  const beacons = rows.map((row) => rawOrNull(row.infrastructure?.beaconCount));
  return {
    totalOrgs: sum((row) => row.orgStats?.totalOrgs), totalAccounts: sum((row) => row.accountStats?.totalAccounts),
    totalContracts: sum((row) => row.orgStats?.totalContracts),
    totalBeacons: complete && beacons.every((value) => value !== null) ? beacons.reduce((max, value) => BigInt(value) > max ? BigInt(value) : max, 0n).toString() : null,
    chainsActive: rows.length, totalUserOps: sum((row) => row.gasUsage.totalUserOps),
    // Different native assets cannot be added. Keep each chain's exact displayed value.
    totalGasSponsored: rows.length === 1 && complete ? rows[0].gasUsage.totalGasSponsored : null,
    isComplete: complete, expectedChains: expectedCount,
  };
}
