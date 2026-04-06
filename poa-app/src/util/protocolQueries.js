import { gql } from '@apollo/client';

/**
 * Protocol-level data query for the /protocol dashboard.
 * Run once per chain subgraph to get infrastructure, stats, and solidarity info.
 */
export const FETCH_PROTOCOL_DATA = gql`
  query FetchProtocolData {
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
    beaconUpgrades(first: 50, orderBy: blockTimestamp, orderDirection: desc) {
      id
      implementation
      blockNumber
      blockTimestamp
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
