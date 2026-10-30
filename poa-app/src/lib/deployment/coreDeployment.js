import { legacyDraftIssues, LEGACY_DRAFT_MESSAGE } from '@/lib/deployment/nativeDraft';
import { ethers } from 'ethers';
import { OrgDeployerNewAbi } from '@poa-box/core/abis/OrgDeployerNew';
import { buildDeploymentParams, deriveOrgId } from '@poa-box/core/tx/org';
import { buildBootstrapConfig } from '@poa-box/core/deployment/bootstrap';
import { validateParticipationTokenText } from '@poa-box/core/deployment/policy';
import { parseDecimalAmountToRaw } from '@poa-box/core/amounts';
import { getTokenByAddress } from '@/util/tokens';
import { sliderToVotingConfig } from '@/features/deployer/utils/philosophyMapper';

const deploymentType = new ethers.utils.Interface(OrgDeployerNewAbi)
  .getFunction('deployFullOrg').inputs[0];

// Retain the host's named-object/BigNumber API; tuple names and order come from
// the installed core ABI, rather than a second DeploymentParams schema.
export function nameDeploymentTuple(value, type = deploymentType) {
  if (type.baseType === 'array') return value.map(item => nameDeploymentTuple(item, type.arrayChildren));
  if (type.baseType === 'tuple') {
    return Object.fromEntries(type.components.map((component, index) => [
      component.name, nameDeploymentTuple(value[index], component),
    ]));
  }
  return type.type === 'uint256' ? ethers.BigNumber.from(value) : value;
}

const decimal = value => {
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) {
    throw new Error('Amounts above the safe numeric range must be exact decimal text.');
  }
  return value === undefined || value === null || value === '' ? '0' : String(value);
};
const decimalsFor = token => getTokenByAddress(token)?.decimals ?? 18;
const amount = (value, decimals = 18) => ({ decimal: decimal(value), decimals });

/** Form names retain their historical spelling; these are genesis role indices. */
export function toCoreBootstrap(bootstrap = {}) {
  return {
    projects: (bootstrap.projects || []).map(project => {
      // A completely blank optional composer row has no protocol meaning.
      const bounties = (project.bounties || []).filter(bounty => bounty?.token || bounty?.cap);
      return {
        title: project.title,
        metadataHash: project.metadataHash,
        cap: amount(project.cap),
        managers: (project.managers || []).filter(address => address !== ''),
        createRoleIndices: (project.createHats || []).map(Number),
        claimRoleIndices: (project.claimHats || []).map(Number),
        reviewRoleIndices: (project.reviewHats || []).map(Number),
        assignRoleIndices: (project.assignHats || []).map(Number),
        bountyTokens: bounties.map(bounty => bounty.token),
        bountyCaps: bounties.map(bounty => amount(bounty.cap, decimalsFor(bounty.token))),
      };
    }),
    tasks: (bootstrap.tasks || []).map(task => ({
      projectIndex: Number(task.projectIndex),
      payout: amount(task.payout),
      title: task.title,
      metadataHash: task.metadataHash,
      bountyToken: task.bountyToken || ethers.constants.AddressZero,
      bountyPayout: amount(task.bountyPayout, decimalsFor(task.bountyToken)),
      requiresApplication: task.requiresApplication ?? false,
    })),
  };
}

export function buildHostBootstrap(bootstrap, roleCount = 16) {
  const type = deploymentType.components.find(component => component.name === 'bootstrap');
  return nameDeploymentTuple(buildBootstrapConfig(toCoreBootstrap(bootstrap), roleCount), type);
}

export function toCorePaymaster(paymaster) {
  if (!paymaster?.enabled) return undefined;
  const unitToSeconds = { hours: 3600, days: 86400, weeks: 604800 };
  return {
    operatorRoleIndex: paymaster.operatorRoleIndex == null
      ? ethers.constants.MaxUint256.toString() : paymaster.operatorRoleIndex,
    autoWhitelistContracts: paymaster.autoWhitelistContracts === true,
    maxFeePerGas: decimal(paymaster.maxFeePerGas),
    maxPriorityFeePerGas: decimal(paymaster.maxPriorityFeePerGas),
    maxCallGas: Number(paymaster.maxCallGas || 0),
    maxVerificationGas: Number(paymaster.maxVerificationGas || 0),
    maxPreVerificationGas: Number(paymaster.maxPreVerificationGas || 0),
    defaultBudgetCapPerEpoch: decimal(paymaster.budgetCapEth),
    defaultBudgetEpochLen: Math.round(Number(paymaster.budgetEpochValue || 0)
      * (unitToSeconds[paymaster.budgetEpochUnit] || 86400)),
    funding: decimal(paymaster.fundingAmountEth),
  };
}

export function getCoreFundingValue(paymaster) {
  return ethers.BigNumber.from(parseDecimalAmountToRaw(
    paymaster?.enabled ? decimal(paymaster.fundingAmountEth) : '0', 18,
  ));
}

/** UI choices and picked addresses belong to the host; core assembles the wire config. */
export function toCoreDeployConfig(state, deployerAddress, options = {}) {
  const retired = legacyDraftIssues(state);
  if (retired.length) throw new Error(`${LEGACY_DRAFT_MESSAGE} ${retired.join('; ')}`);
  const organization = state.organization || {};
  let classes = state.voting?.classes || [];
  const direct = classes.find(row => row.strategy === 0 || row.strategy === 'DIRECT');
  if (classes.length === 2 && state.voting.democracyWeight !== undefined
    && direct && direct.slicePct !== state.voting.democracyWeight) {
    classes = sliderToVotingConfig(state.voting.democracyWeight).classes;
  }
  const roles = (state.roles || []).map(role => {
    const mintToDeployer = Boolean(role.distribution?.mintToDeployer);
    const seen = new Set(mintToDeployer ? [String(deployerAddress).toLowerCase()] : []);
    const additionalWearers = (role.distribution?.additionalWearers || []).filter(address => {
      const key = String(address).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return {
      name: role.name,
      image: role.image || '',
      metadataCID: role.metadataCID || ethers.constants.HashZero,
      canVote: Boolean(role.canVote),
      open: role.open,
      maxMembers: Number(role.maxMembers),
      vouching: {
        enabled: Boolean(role.vouching?.enabled),
        quorum: Number(role.vouching?.quorum ?? 0),
        voucherRoleIndex: Number(role.vouching?.voucherRoleIndex ?? 0),
      },
      distribution: { mintToDeployer, additionalWearers },
    };
  });
  const creators = new Set((state.permissions?.taskCreatorRoles || []).map(Number));
  // Strip a hidden CREATE checkbox for a role the wizard explicitly excludes.
  // Core adds CREATE for every selected creator, including CREATE-only seeds.
  const taskRows = new Map(Object.entries(state.taskManagerPerms || {}).map(([index, mask]) => {
    const numericMask = Number(mask);
    return [Number(index), !creators.has(Number(index)) && Number.isInteger(numericMask)
      && numericMask >= 0 && numericMask <= 255 ? numericMask & ~1 : numericMask];
  }));
  for (const creator of creators) if (!taskRows.has(creator)) taskRows.set(creator, 0);
  const rows = [...taskRows].filter(([index, mask]) => mask !== 0 || creators.has(index)).sort(([a], [b]) => a - b);
  const adminIndex = options.metadataAdminRoleIndex ?? state.metadataAdminRoleIndex;
  return {
    orgName: organization.name,
    autoUpgrade: organization.autoUpgrade ?? true,
    roles,
    groups: Array.isArray(state.groups || []) ? (state.groups || []).map(group => ({
      name: String(group.name || '').trim(), memberRoleIndices: Array.isArray(group.memberRoleIndices)
        ? group.memberRoleIndices.map(Number) : group.memberRoleIndices,
    })) : state.groups,
    hybridVoting: {
      thresholdPct: Number(state.voting?.hybridQuorum),
      quorum: Number(state.voting?.hybridVoterQuorum || 0),
      classes: classes.map(row => ({
        strategy: row.strategy === 0 ? 'DIRECT' : row.strategy === 1 ? 'ERC20_BAL' : row.strategy,
        slicePct: Number(row.slicePct), quadratic: Boolean(row.quadratic),
        minBalance: decimal(row.minBalance), asset: row.asset || ethers.constants.AddressZero,
        // Wizard hatIds are undeployed ROLE INDICES, never authority subject IDs.
        subjectIds: [],
      })),
    },
    directDemocracy: {
      thresholdPct: Number(state.voting?.ddQuorum), quorum: Number(state.voting?.ddVoterQuorum || 0),
      initialTargets: [...new Set(state.ddInitialTargets || [])],
    },
    roleAssignments: Object.fromEntries([
      'quickJoinRoles', 'tokenMemberRoles', 'tokenApproverRoles', 'taskCreatorRoles',
      'educationCreatorRoles', 'educationMemberRoles', 'hybridProposalCreatorRoles', 'ddVotingRoles', 'ddCreatorRoles',
    ].map(key => [key, (state.permissions?.[key] || []).map(Number)])),
    ...(adminIndex == null || String(adminIndex) === ethers.constants.MaxUint256.toString()
      ? {} : { metadataAdminRoleIndex: Number(adminIndex) }),
    educationHub: { enabled: state.features?.educationHubEnabled === true },
    bootstrap: toCoreBootstrap(state.bootstrap),
    paymaster: toCorePaymaster(state.paymaster),
    taskManagerPerms: { roleIndices: rows.map(([index]) => index), masks: rows.map(([, mask]) => mask) },
    token: { name: (organization.tokenName || '').trim(), symbol: (organization.tokenSymbol || '').trim() },
  };
}

export function mapCoreDeploymentParams(state, deployerAddress, options = {}) {
  if (!ethers.utils.isAddress(options.registryAddress || '') || options.registryAddress === ethers.constants.AddressZero) {
    throw new Error('A valid registry address is required for deployment.');
  }
  if (!ethers.utils.isAddress(deployerAddress || '') || deployerAddress === ethers.constants.AddressZero) {
    throw new Error('A valid deployer address is required for deployment.');
  }
  const config = toCoreDeployConfig(state, deployerAddress, options);
  validateParticipationTokenText({
    ...config.token, name: config.token.name || `${config.orgName} Token`, policy: 'setter-compatible',
  });
  return nameDeploymentTuple(buildDeploymentParams(config, {
    orgId: deriveOrgId(config.orgName).orgId,
    metadataHash: options.metadataHash || ethers.constants.HashZero,
    registryAddr: options.registryAddress,
    deployerAddress,
    deployerUsername: options.deployerUsername ?? state.organization.username ?? '',
    regDeadline: options.regSignatureData?.regDeadline ?? 0,
    regNonce: options.regSignatureData?.regNonce ?? 0,
    regSignature: options.regSignatureData?.regSignature ?? '0x',
  }));
}
