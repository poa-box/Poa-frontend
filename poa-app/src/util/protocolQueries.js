import { gql } from '@apollo/client';

/**
 * Protocol-level data query for the /protocol dashboard.
 * Run once per chain subgraph to get infrastructure, stats, and solidarity info.
 *
 * NOTE: The $chainId variable is unused by the subgraph but breaks Apollo's
 * query deduplication. Without it, two useQuery calls with the same document
 * but different context.subgraphUrl get deduplicated and return the same result.
 */
export const FETCH_PROTOCOL_DATA = gql`
  query FetchProtocolData($chainId: String!) {
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
  }
`;
