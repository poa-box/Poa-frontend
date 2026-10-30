import { gql } from '@apollo/client';
import { FETCH_INFRASTRUCTURE_ADDRESSES } from '@poa-box/core/graph/documents/infrastructure';
import { FETCH_FACTORY_FACTS, FETCH_SOLIDARITY_STATE } from '@poa-box/core/graph/documents/accounts';
import { coreFields } from '@/lib/graphql/coreDocuments';

/** One existing public indexed request, with canonical core field descriptors. */
export const ENROLLMENT_INFRASTRUCTURE = gql`query EnrollmentInfrastructure {
  poaManagerContracts(first: 1) { ${coreFields(FETCH_INFRASTRUCTURE_ADDRESSES, 'poaManagerContracts', { only: ['paymasterHubProxy'] })} }
  universalAccountRegistries(first: 1) { ${coreFields(FETCH_INFRASTRUCTURE_ADDRESSES, 'universalAccountRegistries', { only: ['id'] })} }
  passkeyAccountFactories(first: 1) { ${coreFields(FETCH_FACTORY_FACTS, 'passkeyAccountFactories', { only: ['id'] })} }
  paymasterHubContracts(first: 1) { ${coreFields(FETCH_SOLIDARITY_STATE, 'paymasterHubContracts', { only: ['solidarityBalance'] })} }
}`;
