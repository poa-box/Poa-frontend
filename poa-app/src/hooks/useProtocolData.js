import { useState, useEffect, useMemo } from 'react';
import { getAllSubgraphUrls, getNetworkByChainId } from '@/config/networks';

/**
 * GraphQL query for protocol-level data.
 * Uses direct fetch() to each subgraph (not Apollo useQuery) to avoid
 * deduplication issues when querying multiple chains with the same document.
 */
const PROTOCOL_QUERY = `{
  poaManagerContracts(first: 1) {
    id
    beaconCount
    orgDeployerProxy
    orgRegistryProxy
    paymasterHubProxy
    globalAccountRegistryProxy
    passkeyAccountFactoryProxy
    createdAt
  }
  orgRegistryContracts(first: 1) {
    id
    totalOrgs
    totalContracts
  }
  universalAccountRegistries(first: 1) {
    id
    totalAccounts
  }
  beaconUpgradeEvents(first: 50, orderBy: upgradedAt, orderDirection: desc) {
    id
    typeId
    newImplementation
    version
    upgradedAt
    transactionHash
  }
  paymasterHubContracts(first: 1) {
    id
    totalDeposit
    solidarityBalance
    totalFeesCollected
    solidarityDistributionPaused
    gracePeriodDays
    maxSpendDuringGrace
    minDepositRequired
    createdAt
  }
  onboardingConfigs(first: 1) {
    maxGasPerCreation
    dailyCreationLimit
    enabled
    accountRegistry
  }
  orgDeployConfigs(first: 1) {
    maxGasPerDeploy
    dailyDeployLimit
    maxDeploysPerAccount
    enabled
    orgDeployer
  }
  solidarityEvents(first: 30, orderBy: eventAt, orderDirection: desc) {
    id
    eventType
    from
    amount
    eventAt
    transactionHash
  }
  paymasterOrgConfigs(first: 1000) {
    id
    orgId
    totalSpent
    totalSolidarityReceived
    depositBalance
    totalDeposited
    stats {
      totalUserOps
      totalGasSponsored
    }
  }
}`;

/**
 * Deploy-time defaults for onboarding config.
 * These events fired before the PaymasterHub template was instantiated,
 * so the subgraph never indexed them. Values are from MainDeploy.s.sol.
 */
function getOnboardingDefaults(chainId) {
  // Arbitrum: onboarding disabled (governance-only chain)
  if (chainId === 42161) {
    return { maxGasPerCreation: '0.0050', dailyCreationLimit: 1000, enabled: false, accountRegistry: null };
  }
  // Gnosis: onboarding enabled
  return { maxGasPerCreation: '0.0100', dailyCreationLimit: 1000, enabled: true, accountRegistry: null };
}

function getOrgDeployDefaults(chainId) {
  // Arbitrum: org deploy disabled
  if (chainId === 42161) {
    return { maxGasPerDeploy: '0.0050', dailyDeployLimit: 50, maxDeploysPerAccount: 2, enabled: false, orgDeployer: null };
  }
  // Gnosis: org deploy enabled
  return { maxGasPerDeploy: '0.0100', dailyDeployLimit: 50, maxDeploysPerAccount: 2, enabled: true, orgDeployer: null };
}

/**
 * Fetch protocol data from a single subgraph endpoint.
 */
async function fetchChainData(url) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: PROTOCOL_QUERY }),
  });
  const json = await res.json();
  return json?.data || null;
}

/**
 * Hook to fetch protocol-level data from all production chain subgraphs.
 * Uses direct fetch() (not Apollo) to avoid query deduplication issues.
 */
export function useProtocolData() {
  const chains = useMemo(() => getAllSubgraphUrls(), []);
  const [chainData, setChainData] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      setIsLoading(true);
      const results = {};

      const settled = await Promise.allSettled(
        chains.map(async (chain) => {
          const d = await fetchChainData(chain.url);
          return { chainId: chain.chainId, name: chain.name, data: d };
        })
      );

      for (const result of settled) {
        if (result.status !== 'fulfilled' || !result.value.data) continue;
        const { chainId, name, data: d } = result.value;
        const network = getNetworkByChainId(chainId);
        const pm = d.paymasterHubContracts?.[0];
        const onboarding = d.onboardingConfigs?.[0];
        const orgDeploy = d.orgDeployConfigs?.[0];

        // Aggregate gas usage from all org configs on this chain
        const orgConfigs = d.paymasterOrgConfigs || [];
        const gasUsage = orgConfigs.reduce((acc, cfg) => {
          acc.totalSpent += parseInt(cfg.totalSpent || '0');
          acc.totalDeposited += parseInt(cfg.totalDeposited || '0');
          acc.totalSolidarityReceived += parseInt(cfg.totalSolidarityReceived || '0');
          acc.currentBalance += parseInt(cfg.depositBalance || '0');
          acc.totalUserOps += parseInt(cfg.stats?.totalUserOps || '0');
          acc.totalGasSponsored += parseInt(cfg.stats?.totalGasSponsored || '0');
          acc.orgCount += 1;
          return acc;
        }, { totalSpent: 0, totalDeposited: 0, totalSolidarityReceived: 0, currentBalance: 0, totalUserOps: 0, totalGasSponsored: 0, orgCount: 0 });

        results[chainId] = {
          name,
          chainId,
          blockExplorer: network?.blockExplorer || '',
          nativeCurrency: network?.nativeCurrency?.symbol || 'ETH',
          infrastructure: d.poaManagerContracts?.[0] || null,
          orgStats: d.orgRegistryContracts?.[0] || null,
          accountStats: d.universalAccountRegistries?.[0] || null,
          paymaster: pm || null,
          beaconUpgrades: d.beaconUpgradeEvents || [],
          solidarityEvents: d.solidarityEvents || [],
          gasUsage: {
            totalSpent: (gasUsage.totalSpent / 1e18).toFixed(6),
            totalDeposited: (gasUsage.totalDeposited / 1e18).toFixed(6),
            totalSolidarityReceived: (gasUsage.totalSolidarityReceived / 1e18).toFixed(6),
            currentBalance: (gasUsage.currentBalance / 1e18).toFixed(6),
            totalUserOps: gasUsage.totalUserOps,
            totalGasSponsored: (gasUsage.totalGasSponsored / 1e18).toFixed(6),
            orgCount: gasUsage.orgCount,
          },
          solidarity: pm ? {
            balance: pm.solidarityBalance ? (parseInt(pm.solidarityBalance) / 1e18).toFixed(4) : '0',
            totalFeesCollected: pm.totalFeesCollected ? (parseInt(pm.totalFeesCollected) / 1e18).toFixed(6) : '0',
            distributionPaused: pm.solidarityDistributionPaused,
            feePercentageBps: 100,
          } : null,
          grace: pm ? {
            initialGraceDays: parseInt(pm.gracePeriodDays || '90'),
            maxSpendDuringGrace: pm.maxSpendDuringGrace ? (parseInt(pm.maxSpendDuringGrace) / 1e18).toFixed(4) : '0.05',
            minDepositRequired: pm.minDepositRequired ? (parseInt(pm.minDepositRequired) / 1e18).toFixed(4) : '0.0001',
          } : null,
          // Onboarding config: use subgraph if indexed, otherwise fall back to
          // known deploy-time defaults (events fired before template was instantiated)
          onboarding: onboarding ? {
            maxGasPerCreation: (parseInt(onboarding.maxGasPerCreation) / 1e18).toFixed(4),
            dailyCreationLimit: parseInt(onboarding.dailyCreationLimit),
            enabled: onboarding.enabled,
            accountRegistry: onboarding.accountRegistry,
          } : pm ? getOnboardingDefaults(chainId) : null,
          orgDeploy: orgDeploy ? {
            maxGasPerDeploy: (parseInt(orgDeploy.maxGasPerDeploy) / 1e18).toFixed(4),
            dailyDeployLimit: parseInt(orgDeploy.dailyDeployLimit),
            maxDeploysPerAccount: orgDeploy.maxDeploysPerAccount,
            enabled: orgDeploy.enabled,
            orgDeployer: orgDeploy.orgDeployer,
          } : pm ? getOrgDeployDefaults(chainId) : null,
        };
      }

      if (!cancelled) {
        setChainData(results);
        setIsLoading(false);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [chains]);

  // Aggregate stats
  const aggregated = useMemo(() => {
    let totalOrgs = 0;
    let totalAccounts = 0;
    let totalContracts = 0;
    let totalBeacons = 0;
    let totalUserOps = 0;
    let totalGasSponsored = 0;

    Object.values(chainData).forEach(chain => {
      totalOrgs += parseInt(chain.orgStats?.totalOrgs || '0');
      totalAccounts += parseInt(chain.accountStats?.totalAccounts || '0');
      totalContracts += parseInt(chain.orgStats?.totalContracts || '0');
      totalBeacons = Math.max(totalBeacons, parseInt(chain.infrastructure?.beaconCount || '0'));
      totalUserOps += chain.gasUsage?.totalUserOps || 0;
      totalGasSponsored += parseFloat(chain.gasUsage?.totalGasSponsored || '0');
    });

    return {
      totalOrgs,
      totalAccounts,
      totalContracts,
      totalBeacons,
      chainsActive: Object.keys(chainData).length,
      totalUserOps,
      totalGasSponsored: totalGasSponsored.toFixed(6),
    };
  }, [chainData]);

  return {
    isLoading,
    chains: chainData,
    aggregated,
  };
}
