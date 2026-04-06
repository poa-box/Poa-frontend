import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { FETCH_PROTOCOL_DATA } from '@/util/protocolQueries';
import { getAllSubgraphUrls, getNetworkByChainId } from '@/config/networks';
import { createChainClients } from '@/services/web3/utils/chainClients';
import { formatEther } from 'viem';
import PaymasterHubABI from '../../abi/PaymasterHub.json';

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
          // Use the real PaymasterHub ABI (returns tuples, not flat arrays)
          const [solidarity, onboarding, orgDeploy, grace] = await Promise.all([
            client.readContract({ address: paymasterAddr, abi: PaymasterHubABI, functionName: 'getSolidarityFund' }).catch(() => null),
            client.readContract({ address: paymasterAddr, abi: PaymasterHubABI, functionName: 'getOnboardingConfig' }).catch(() => null),
            client.readContract({ address: paymasterAddr, abi: PaymasterHubABI, functionName: 'getOrgDeployConfig' }).catch(() => null),
            client.readContract({ address: paymasterAddr, abi: PaymasterHubABI, functionName: 'getGracePeriodConfig' }).catch((e) => { console.warn('getGracePeriodConfig failed:', e.message); return null; }),
          ]);

          // The ABI returns structs — viem decodes them as objects with named fields
          // or as arrays depending on whether the ABI has component names.
          // PaymasterHub.json has named components, so viem returns objects.
          const parseSolidarity = (s) => {
            if (!s) return null;
            // Could be object {balance, numActiveOrgs, ...} or array [balance, numActiveOrgs, ...]
            const bal = s.balance ?? s[0];
            const orgs = s.numActiveOrgs ?? s[1];
            const fee = s.feePercentageBps ?? s[2];
            const paused = s.distributionPaused ?? s[3];
            return {
              balance: formatEther(bal),
              numActiveOrgs: Number(orgs),
              feePercentageBps: Number(fee),
              distributionPaused: paused,
            };
          };

          const parseOnboarding = (o) => {
            if (!o) return null;
            const maxGas = o.maxGasPerCreation ?? o[0];
            const limit = o.dailyCreationLimit ?? o[1];
            const attempts = o.attemptsToday ?? o[2];
            const enabled = o.enabled ?? o[4];
            const registry = o.accountRegistry ?? o[5];
            return {
              maxGasPerCreation: formatEther(maxGas),
              dailyCreationLimit: Number(limit),
              attemptsToday: Number(attempts),
              enabled,
              accountRegistry: registry,
            };
          };

          const parseOrgDeploy = (d) => {
            if (!d) return null;
            const maxGas = d.maxGasPerDeploy ?? d[0];
            const limit = d.dailyDeployLimit ?? d[1];
            const attempts = d.attemptsToday ?? d[2];
            const maxPer = d.maxDeploysPerAccount ?? d[4];
            const enabled = d.enabled ?? d[5];
            const deployer = d.orgDeployer ?? d[6];
            return {
              maxGasPerDeploy: formatEther(maxGas),
              dailyDeployLimit: Number(limit),
              attemptsToday: Number(attempts),
              maxDeploysPerAccount: Number(maxPer),
              enabled,
              orgDeployer: deployer,
            };
          };

          const parseGrace = (g) => {
            if (!g) return null;
            const days = g.initialGraceDays ?? g[0];
            const maxSpend = g.maxSpendDuringGrace ?? g[1];
            const minDep = g.minDepositRequired ?? g[2];
            return {
              initialGraceDays: Number(days),
              maxSpendDuringGrace: formatEther(maxSpend),
              minDepositRequired: formatEther(minDep),
            };
          };

          results[query.chainId] = {
            solidarity: parseSolidarity(solidarity),
            onboarding: parseOnboarding(onboarding),
            orgDeploy: parseOrgDeploy(orgDeploy),
            grace: parseGrace(grace),
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
    isLoading: subgraphLoading, // Don't block on on-chain reads — subgraph data is sufficient
    chains: chainData,
    aggregated,
  };
}
