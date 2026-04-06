import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { FETCH_PROTOCOL_DATA } from '@/util/protocolQueries';
import { getAllSubgraphUrls, getNetworkByChainId } from '@/config/networks';
import { createChainClients } from '@/services/web3/utils/chainClients';
import { formatEther } from 'viem';

const PAYMASTER_ABI = [
  { type: 'function', name: 'getSolidarityFund', inputs: [], outputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'getOnboardingConfig', inputs: [], outputs: [{ type: 'uint128' }, { type: 'uint128' }, { type: 'uint128' }, { type: 'uint32' }, { type: 'bool' }, { type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'getOrgDeployConfig', inputs: [], outputs: [{ type: 'uint128' }, { type: 'uint128' }, { type: 'uint128' }, { type: 'uint32' }, { type: 'uint8' }, { type: 'bool' }, { type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'getGracePeriodConfig', inputs: [], outputs: [{ type: 'uint32' }, { type: 'uint128' }, { type: 'uint128' }], stateMutability: 'view' },
];

/**
 * Hook to fetch protocol-level data from all production chain subgraphs
 * and on-chain PaymasterHub configs.
 */
export function useProtocolData() {
  const chains = useMemo(() => getAllSubgraphUrls(), []);
  const [onChainData, setOnChainData] = useState({});
  const [onChainLoading, setOnChainLoading] = useState(true);

  // Query each chain's subgraph
  const chainQueries = chains.map(chain => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { data, loading } = useQuery(FETCH_PROTOCOL_DATA, {
      fetchPolicy: 'no-cache',
      context: { subgraphUrl: chain.url },
    });
    return { chainId: chain.chainId, name: chain.name, data, loading };
  });

  const subgraphLoading = chainQueries.some(q => q.loading);

  // On-chain reads for PaymasterHub configs
  useEffect(() => {
    if (subgraphLoading) return;

    const fetchOnChain = async () => {
      setOnChainLoading(true);
      const results = {};

      for (const query of chainQueries) {
        const paymasterAddr = query.data?.paymasterHubContracts?.[0]?.id;
        if (!paymasterAddr) continue;

        const clients = createChainClients(query.chainId);
        const client = clients?.publicClient;
        if (!client) continue;

        try {
          const [solidarity, onboarding, orgDeploy, grace] = await Promise.all([
            client.readContract({ address: paymasterAddr, abi: PAYMASTER_ABI, functionName: 'getSolidarityFund' }).catch(() => null),
            client.readContract({ address: paymasterAddr, abi: PAYMASTER_ABI, functionName: 'getOnboardingConfig' }).catch(() => null),
            client.readContract({ address: paymasterAddr, abi: PAYMASTER_ABI, functionName: 'getOrgDeployConfig' }).catch(() => null),
            client.readContract({ address: paymasterAddr, abi: PAYMASTER_ABI, functionName: 'getGracePeriodConfig' }).catch(() => null),
          ]);

          results[query.chainId] = {
            solidarity: solidarity ? {
              balance: formatEther(solidarity[0]),
              numActiveOrgs: Number(solidarity[1]),
              feePercentageBps: Number(solidarity[2]),
              distributionPaused: solidarity[3],
            } : null,
            onboarding: onboarding ? {
              maxGasPerCreation: formatEther(onboarding[0]),
              dailyCreationLimit: Number(onboarding[1]),
              attemptsToday: Number(onboarding[2]),
              enabled: onboarding[4],
              accountRegistry: onboarding[5],
            } : null,
            orgDeploy: orgDeploy ? {
              maxGasPerDeploy: formatEther(orgDeploy[0]),
              dailyDeployLimit: Number(orgDeploy[1]),
              attemptsToday: Number(orgDeploy[2]),
              maxDeploysPerAccount: Number(orgDeploy[4]),
              enabled: orgDeploy[5],
              orgDeployer: orgDeploy[6],
            } : null,
            grace: grace ? {
              initialGraceDays: Number(grace[0]),
              maxSpendDuringGrace: formatEther(grace[1]),
              minDepositRequired: formatEther(grace[2]),
            } : null,
          };
        } catch (e) {
          console.warn(`[Protocol] Failed on-chain reads for chain ${query.chainId}:`, e.message);
        }
      }

      setOnChainData(results);
      setOnChainLoading(false);
    };

    fetchOnChain();
  }, [subgraphLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Structure the data per chain
  const chainData = useMemo(() => {
    const result = {};
    for (const query of chainQueries) {
      const d = query.data;
      const network = getNetworkByChainId(query.chainId);
      result[query.chainId] = {
        name: query.name,
        chainId: query.chainId,
        blockExplorer: network?.blockExplorer || '',
        nativeCurrency: network?.nativeCurrency?.symbol || 'ETH',
        infrastructure: d?.poaManagerContracts?.[0] || null,
        orgStats: d?.orgRegistryContracts?.[0] || null,
        accountStats: d?.universalAccountRegistries?.[0] || null,
        paymaster: d?.paymasterHubContracts?.[0] || null,
        beaconUpgrades: d?.beaconUpgrades || [],
        solidarityEvents: d?.solidarityEvents || [],
        onChain: onChainData[query.chainId] || null,
      };
    }
    return result;
  }, [chainQueries, onChainData]);

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
    isLoading: subgraphLoading || onChainLoading,
    chains: chainData,
    aggregated,
  };
}
