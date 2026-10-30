import { deriveOrgId } from '@poa-box/core/tx/org';
import { buildHostBootstrap, getCoreFundingValue } from '@/lib/deployment/coreDeployment';
import { mapStateToAccessV2DeploymentParams, validateAccessV2Representability } from '@/features/deployer/utils/deploymentMapperV2';

export const utf8Length = value => new TextEncoder().encode(String(value ?? '')).length;
export const generateOrgId = name => deriveOrgId(name).orgId;
export const getPaymasterFundingValue = getCoreFundingValue;
export const buildBootstrapConfig = buildHostBootstrap;

export function createDeploymentConfig(state, deployerAddress, options = {}) {
  const params = mapStateToAccessV2DeploymentParams(state, deployerAddress, options);

  return {
    params,
    metadata: {
      description: state.organization.description,
      links: state.organization.links,
      logoURL: state.organization.logoURL,
      infoIPFSHash: state.organization.infoIPFSHash,
    },
    features: {
      educationHubEnabled: state.features.educationHubEnabled,
      hideTreasury: state.features.hideTreasury,
    },
    summary: {
      orgName: state.organization.name,
      roleCount: state.roles.length,
      roleNames: state.roles.map(r => r.name),
      votingMode: state.voting.mode,
      votingClassCount: state.voting.classes.length,
      hasVouching: state.roles.some(r => r.vouching.enabled),
      paymasterEnabled: state.paymaster?.enabled || false,
      paymasterFundingEth: state.paymaster?.fundingAmountEth || '0',
      hybridVoterQuorum: state.voting.hybridVoterQuorum || 0,
      ddVoterQuorum: state.voting.ddVoterQuorum || 0,
    },
  };
}

export const validateDeploymentConfig = (state, deployerAddress) => validateAccessV2Representability(state, deployerAddress);
