/**
 * Subgraph queries for passkey and paymaster features.
 */

import { gql } from '@apollo/client';

/**
 * Fetch the PasskeyAccountFactory address from the subgraph.
 * There's typically one factory deployed per protocol instance.
 */
export const FETCH_PASSKEY_FACTORY_ADDRESS = gql`
  query FetchPasskeyFactoryAddress {
    passkeyAccountFactories(first: 1) {
      id
      accountBeacon
    }
  }
`;

/**
 * Check if an address has a deployed passkey smart account.
 */
export const FETCH_PASSKEY_ACCOUNT = gql`
  query FetchPasskeyAccount($address: Bytes!) {
    passkeyAccounts(where: { id: $address }) {
      id
      factory {
        id
      }
      credentials {
        id
        credentialId
        active
      }
      createdAt
    }
  }
`;

/**
 * Fetch the PaymasterHub solidarity fund status.
 * Used on the homepage to determine if solidarity-funded account creation is available.
 */
export const FETCH_SOLIDARITY_FUND_STATUS = gql`
  query FetchSolidarityFundStatus {
    paymasterHubContracts(first: 1) {
      id
      solidarityBalance
    }
  }
`;

/**
 * Fetch paymaster configuration for an organization.
 * Entity existence = org is registered. isPaused controls whether sponsorship is active.
 */
export const FETCH_PAYMASTER_ORG_CONFIG = gql`
  query FetchPaymasterOrgConfig($orgId: Bytes!) {
    paymasterOrgConfigs(where: { orgId: $orgId }) {
      id
      orgId
      isPaused
      depositBalance
      totalSpent
      totalSolidarityReceived
    }
  }
`;

/**
 * Fetch gas pool data for an organization's paymaster.
 * Includes balance, stats, deposit history, and usage history.
 */
export const FETCH_GAS_POOL_DATA = gql`
  query FetchGasPoolData($orgId: Bytes!) {
    paymasterOrgConfigs(where: { orgId: $orgId }) {
      id
      orgId
      isPaused
      depositBalance
      totalDeposited
      totalSpent
      totalSolidarityReceived
      stats {
        totalUserOps
        totalGasSponsored
        totalDeposited
        totalSolidarityFeesCollected
        lastOperationAt
      }
      depositEvents(first: 50, orderBy: eventAt, orderDirection: desc) {
        id
        eventType
        from
        amount
        eventAt
        transactionHash
      }
      usageEvents(first: 50, orderBy: eventAt, orderDirection: desc) {
        id
        delta
        subjectKey
        eventAt
        transactionHash
      }
    }
  }
`;
