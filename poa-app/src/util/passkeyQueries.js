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
    passKeyAccountFactories(first: 1) {
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
 * Fetch org-level passkey configuration (whether passkey onboarding is enabled).
 */
export const FETCH_PASSKEY_ORG_CONFIG = gql`
  query FetchPasskeyOrgConfig($orgId: Bytes!) {
    passkeyOrgConfigs(where: { organization: $orgId }) {
      id
      factory {
        id
      }
      organization {
        id
        name
      }
      enabled
    }
  }
`;

/**
 * Fetch paymaster configuration for an organization.
 */
export const FETCH_PAYMASTER_ORG_CONFIG = gql`
  query FetchPaymasterOrgConfig($orgId: Bytes!) {
    paymasterOrgConfigs(where: { orgId: $orgId }) {
      id
      orgId
      isRegistered
      isPaused
      deposit
      totalGasSpent
      transactionCount
    }
  }
`;
