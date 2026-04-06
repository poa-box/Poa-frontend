import { useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { FETCH_PROTOCOL_DATA } from '@/util/protocolQueries';
import { getAllSubgraphUrls, getNetworkByChainId } from '@/config/networks';

/**
 * Hook to fetch protocol-level data from all production chain subgraphs.
 * All data comes from subgraph queries — no on-chain reads needed.
 */
export function useProtocolData() {
  const chains = useMemo(() => getAllSubgraphUrls(), []);

  // Query each chain's subgraph
  const chainQueries = chains.map(chain => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { data, loading } = useQuery(FETCH_PROTOCOL_DATA, {
      variables: { chainId: String(chain.chainId) }, // Breaks Apollo query deduplication
      fetchPolicy: 'no-cache',
      context: { subgraphUrl: chain.url },
    });
    return { chainId: chain.chainId, name: chain.name, data, loading };
  });

  const isLoading = chainQueries.some(q => q.loading);

  // Structure the data per chain
  const chainData = useMemo(() => {
    const result = {};
    for (const query of chainQueries) {
      const d = query.data;
      if (!d) continue;

      const network = getNetworkByChainId(query.chainId);
      const pm = d.paymasterHubContracts?.[0];
      const onboarding = d.onboardingConfigs?.[0];
      const orgDeploy = d.orgDeployConfigs?.[0];

      result[query.chainId] = {
        name: query.name,
        chainId: query.chainId,
        blockExplorer: network?.blockExplorer || '',
        nativeCurrency: network?.nativeCurrency?.symbol || 'ETH',
        infrastructure: d.poaManagerContracts?.[0] || null,
        orgStats: d.orgRegistryContracts?.[0] || null,
        accountStats: d.universalAccountRegistries?.[0] || null,
        paymaster: pm || null,
        beaconUpgrades: d.beaconUpgradeEvents || [],
        solidarityEvents: d.solidarityEvents || [],
        // Solidarity fund data from subgraph
        solidarity: pm ? {
          balance: pm.solidarityBalance ? (parseInt(pm.solidarityBalance) / 1e18).toFixed(4) : '0',
          distributionPaused: pm.solidarityDistributionPaused,
          feePercentageBps: 100, // Default 1% — set at initialize, not indexed as a separate field
        } : null,
        // Grace period from subgraph
        grace: pm ? {
          initialGraceDays: parseInt(pm.gracePeriodDays || '90'),
          maxSpendDuringGrace: pm.maxSpendDuringGrace ? (parseInt(pm.maxSpendDuringGrace) / 1e18).toFixed(4) : '0.05',
          minDepositRequired: pm.minDepositRequired ? (parseInt(pm.minDepositRequired) / 1e18).toFixed(4) : '0.0001',
        } : null,
        // Onboarding config from subgraph (null if never updated after deploy)
        onboarding: onboarding ? {
          maxGasPerCreation: (parseInt(onboarding.maxGasPerCreation) / 1e18).toFixed(4),
          dailyCreationLimit: parseInt(onboarding.dailyCreationLimit),
          enabled: onboarding.enabled,
          accountRegistry: onboarding.accountRegistry,
        } : null,
        // Org deploy config from subgraph (null if never updated after deploy)
        orgDeploy: orgDeploy ? {
          maxGasPerDeploy: (parseInt(orgDeploy.maxGasPerDeploy) / 1e18).toFixed(4),
          dailyDeployLimit: parseInt(orgDeploy.dailyDeployLimit),
          maxDeploysPerAccount: orgDeploy.maxDeploysPerAccount,
          enabled: orgDeploy.enabled,
          orgDeployer: orgDeploy.orgDeployer,
        } : null,
      };
    }
    return result;
  }, [chainQueries]);

  // Aggregate stats
  const aggregated = useMemo(() => {
    let totalOrgs = 0;
    let totalAccounts = 0;
    let totalContracts = 0;
    let totalBeacons = 0;

    Object.values(chainData).forEach(chain => {
      totalOrgs += parseInt(chain.orgStats?.totalOrgs || '0');
      totalAccounts += parseInt(chain.accountStats?.totalAccounts || '0');
      totalContracts += parseInt(chain.orgStats?.totalContracts || '0');
      totalBeacons = Math.max(totalBeacons, parseInt(chain.infrastructure?.beaconCount || '0'));
    });

    return {
      totalOrgs,
      totalAccounts,
      totalContracts,
      totalBeacons,
      chainsActive: Object.keys(chainData).length,
    };
  }, [chainData]);

  return {
    isLoading,
    chains: chainData,
    aggregated,
  };
}
