/** Public display documents; current signing eligibility stays in the runtime. */
import { gql } from '@apollo/client';
import * as accounts from '@poa-box/core/graph/documents/accounts';
import * as protocol from '@poa-box/core/graph/documents/protocol';
import * as paymaster from '@poa-box/core/graph/documents/paymaster';
import { coreFields } from '@/lib/graphql/coreDocuments';

export const FETCH_PASSKEY_FACTORY_ADDRESS = gql`
  query FetchPasskeyFactoryAddress {
    passkeyAccountFactories(first: 1) { ${coreFields(accounts.FETCH_FACTORY_FACTS, 'passkeyAccountFactories', { only: ['id', 'accountBeacon'] })} }
  }
`;

export const FETCH_PASSKEY_ACCOUNT = gql`
  query FetchPasskeyAccount($address: Bytes!) {
    passkeyAccounts(where: { id: $address }) {
      ${coreFields(accounts.FETCH_ACCOUNT_FACTS, 'passkeyAccounts', { only: ['id', 'createdAt'] })}
      factory { id }
      credentials { ${coreFields(accounts.FETCH_CREDENTIAL_PAGE, 'passkeyCredentials', { only: ['id', 'credentialId', 'active'] })} }
    }
  }
`;

export const FETCH_SOLIDARITY_FUND_STATUS = gql`
  query FetchSolidarityFundStatus {
    paymasterHubContracts(first: 1) { ${coreFields(accounts.FETCH_SOLIDARITY_STATE, 'paymasterHubContracts', { only: ['id', 'solidarityBalance'] })} }
  }
`;

const configFields = coreFields(protocol.FETCH_PROTOCOL_ORGS_PAGE, 'paymasterOrgConfigs', {
  only: ['id', 'orgId', 'depositBalance', 'totalSpent', 'totalSolidarityReceived'],
}) + coreFields(paymaster.FETCH_PAYMASTER_STATE, 'paymasterOrgConfigs', { only: ['isPaused'] });
export const FETCH_PAYMASTER_ORG_CONFIG = gql`
  query FetchPaymasterOrgConfig($orgId: Bytes!) {
    paymasterOrgConfigs(where: { orgId: $orgId }) { ${configFields} }
  }
`;

// These are the existing UI's recent 50-event windows, not complete histories.
// Three extra indexed stats fields have no canonical core selector (recorded in evidence).
export const FETCH_GAS_POOL_DATA = gql`
  query FetchGasPoolData($orgId: Bytes!) {
    paymasterOrgConfigs(where: { orgId: $orgId }) {
      ${configFields}
      ${coreFields(protocol.FETCH_PROTOCOL_ORGS_PAGE, 'paymasterOrgConfigs', { only: ['totalDeposited'] })}
      stats {
        ${coreFields(protocol.FETCH_PROTOCOL_ORGS_PAGE, 'paymasterOrgConfigs.stats')}
        totalDeposited totalSolidarityFeesCollected lastOperationAt
      }
      depositEvents(first: 50, orderBy: eventAt, orderDirection: desc) {
        ${coreFields(paymaster.FETCH_PAYMASTER_DEPOSITS_PAGE, 'paymasterDepositEvents', { only: ['id', 'eventType', 'from', 'amount', 'eventAt', 'transactionHash'] })}
      }
      usageEvents(first: 50, orderBy: eventAt, orderDirection: desc) {
        ${coreFields(paymaster.FETCH_PAYMASTER_USAGE_PAGE, 'usageEvents', { only: ['id', 'delta', 'subjectKey', 'eventAt', 'transactionHash'] })}
      }
    }
  }
`;
