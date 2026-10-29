import { legacyDraftIssues, LEGACY_DRAFT_MESSAGE } from '@/lib/deployment/nativeDraft';

import { mapCoreDeploymentParams, toCoreDeployConfig } from '@/lib/deployment/coreDeployment';
import { validateOrgDeployConfig } from '@poa-box/core/tx/org';
import { validateParticipationTokenText } from '@poa-box/core/deployment/policy';
import { OrgDeployerBoundaryError } from './orgDeployerBoundary';
import { validatePaymasterConfig } from '@/features/deployer/validation/schemas';

/**
 * Report legacy wizard concepts that the authority-native deployer cannot preserve.
 * Nothing here invents groups or manager powers from a Hats parent relationship.
 */
export function validateAccessV2Representability(state, deployerAddress) {
  const errors = [];
  const roles = state?.roles || [];
  const retired = legacyDraftIssues(state || {});
  if (retired.length) errors.push(`${LEGACY_DRAFT_MESSAGE} ${retired.join('; ')}`);

  if (errors.length === 0) {
    try {
      const config = toCoreDeployConfig(state, deployerAddress);
      validateOrgDeployConfig(config);
      validateParticipationTokenText({
        ...config.token, name: config.token.name || `${config.orgName} Token`, policy: 'setter-compatible',
      });
    } catch (error) {
      // Presentation adapters keep useful wizard wording while core decides validity.
      const message = error.message.replace('roles must contain 1–16 authority roles', 'Access v2 supports at most 16 roles and requires at least one role.')
        .replace(/QuickJoin role (\d+) must be open/, 'Quick Join role $1 is not open')
        .replace('duplicate group member role', 'A group lists the same role more than once.');
      errors.push(message);
    }
  }

  // Product requirements remain in the wizard: readable identity, distinct role
  // names, at least one opted-in voting role, and the existing budget-duration UI.
  if (!state?.organization?.description) errors.push('Organization description is required');
  if (new Set(roles.map(role => role.name?.toLowerCase())).size !== roles.length) errors.push('Role names must be unique');
  if (roles.length && !roles.some(role => role.canVote)) errors.push('At least one role must be able to participate in voting.');
  if (state?.paymaster?.enabled) {
    const budgetPolicy = validatePaymasterConfig(state.paymaster, roles.length);
    if (!budgetPolicy.isValid) errors.push(...Object.values(budgetPolicy.errors).flat());
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Adapt the current wizard state to Kyoto's exact authority-native DeploymentParams.
 * The host projects its form choices; core validates and assembles every field.
 * No legacy deployment serializer participates in the active authority path.
 */
export function mapStateToAccessV2DeploymentParams(state, deployerAddress, options = {}) {
  const compatibility = validateAccessV2Representability(state, deployerAddress);
  if (!compatibility.isValid) {
    throw new OrgDeployerBoundaryError(
      `This configuration cannot be deployed with Access v2 without changing its meaning:\n• ${compatibility.errors.join('\n• ')}`
    );
  }

  try {
    return mapCoreDeploymentParams(state, deployerAddress, options);
  } catch (error) {
    throw new OrgDeployerBoundaryError(error.message);
  }
}

export default {
  validateAccessV2Representability,
  mapStateToAccessV2DeploymentParams,
};
