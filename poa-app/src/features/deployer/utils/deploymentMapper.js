/**
 * Deployment Mapper - Converts UI state to contract DeploymentParams
 *
 * This module transforms the deployer context state into the format
 * expected by the OrgDeployer.deployFullOrg() contract function.
 */

import { ethers } from 'ethers';
import { indicesToBitmap } from './bitmapUtils';
import { VOTING_STRATEGY } from '../context/deployerReducer';

/**
 * Generate organization ID from name
 * @param {string} orgName - Organization name
 * @returns {string} bytes32 orgId hash
 */
export function generateOrgId(orgName) {
  const normalized = orgName.toLowerCase().replace(/\s+/g, '-');
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(normalized));
}

/**
 * Map a single role from UI state to contract format
 * @param {Object} role - Role object from UI state
 * @param {number} index - Role index
 * @param {number} totalRoles - Total number of roles
 * @returns {Object} RoleConfig for contract
 */
export function mapRole(role, index, totalRoles) {
  // Determine adminRoleIndex
  // null in UI = top-level = MaxUint256 for contract
  // Use plain numbers for non-null cases (matching buildRoles() in newDeployment.js)
  const adminRoleIndex = role.hierarchy.adminRoleIndex === null
    ? ethers.constants.MaxUint256
    : Number(role.hierarchy.adminRoleIndex);

  // Ensure all numeric values are numbers, not strings (React forms can return strings)
  return {
    name: String(role.name || ''),
    image: String(role.image || ''),
    metadataCID: role.metadataCID || ethers.constants.HashZero, // Use existing CID or HashZero
    canVote: Boolean(role.canVote),
    vouching: {
      enabled: Boolean(role.vouching.enabled),
      quorum: Number(role.vouching.quorum) || 0,
      voucherRoleIndex: Number(role.vouching.voucherRoleIndex) || 0,
      combineWithHierarchy: Boolean(role.vouching.combineWithHierarchy),
    },
    defaults: {
      eligible: Boolean(role.defaults.eligible),
      standing: Boolean(role.defaults.standing),
    },
    hierarchy: {
      adminRoleIndex: adminRoleIndex,
    },
    distribution: {
      mintToDeployer: Boolean(role.distribution.mintToDeployer),
      // mintToExecutor removed in contract PR #80
      additionalWearers: Array.isArray(role.distribution.additionalWearers)
        ? role.distribution.additionalWearers
        : [],
    },
    hatConfig: {
      maxSupply: Number(role.hatConfig.maxSupply) || 1000,
      mutableHat: Boolean(role.hatConfig.mutableHat),
    },
  };
}

/**
 * Map voting classes from UI state to contract format
 * @param {Array} classes - Array of voting class objects
 * @returns {Array} ClassConfig array for contract
 */
export function mapVotingClasses(classes) {
  return classes.map(cls => ({
    strategy: cls.strategy, // 0 = DIRECT, 1 = ERC20_BAL
    slicePct: cls.slicePct,
    quadratic: cls.quadratic,
    minBalance: cls.minBalance > 0
      ? ethers.utils.parseEther(cls.minBalance.toString())
      : ethers.BigNumber.from(0),
    asset: cls.asset || ethers.constants.AddressZero,
    hatIds: cls.hatIds || [],
  }));
}

/**
 * Build role assignment bitmaps from permissions object
 * @param {Object} permissions - Permissions object with role index arrays
 * @returns {Object} RoleAssignments for contract
 */
export function buildRoleAssignments(permissions) {
  return {
    quickJoinRolesBitmap: indicesToBitmap(permissions.quickJoinRoles || []),
    tokenMemberRolesBitmap: indicesToBitmap(permissions.tokenMemberRoles || []),
    tokenApproverRolesBitmap: indicesToBitmap(permissions.tokenApproverRoles || []),
    taskCreatorRolesBitmap: indicesToBitmap(permissions.taskCreatorRoles || []),
    educationCreatorRolesBitmap: indicesToBitmap(permissions.educationCreatorRoles || []),
    educationMemberRolesBitmap: indicesToBitmap(permissions.educationMemberRoles || []),
    hybridProposalCreatorRolesBitmap: indicesToBitmap(permissions.hybridProposalCreatorRoles || []),
    ddVotingRolesBitmap: indicesToBitmap(permissions.ddVotingRoles || []),
    ddCreatorRolesBitmap: indicesToBitmap(permissions.ddCreatorRoles || []),
  };
}

/**
 * Map paymaster state to contract PaymasterConfig format.
 * When paymaster is disabled, returns all-zeros config (contract skips everything).
 * @param {Object} paymasterState - Paymaster state from deployer context
 * @returns {Object} PaymasterConfig for contract
 */
export function mapPaymasterConfig(paymasterState) {
  if (!paymasterState || !paymasterState.enabled) {
    return {
      operatorRoleIndex: ethers.constants.MaxUint256,
      autoWhitelistContracts: false,
      maxFeePerGas: 0,
      maxPriorityFeePerGas: 0,
      maxCallGas: 0,
      maxVerificationGas: 0,
      maxPreVerificationGas: 0,
      defaultBudgetCapPerEpoch: 0,
      defaultBudgetEpochLen: 0,
    };
  }

  const operatorRoleIndex = paymasterState.operatorRoleIndex === null
    ? ethers.constants.MaxUint256
    : Number(paymasterState.operatorRoleIndex);

  // Parse gwei strings to wei
  const parseGwei = (val) => {
    const n = parseFloat(val);
    if (!val || isNaN(n) || n <= 0) return ethers.BigNumber.from(0);
    return ethers.utils.parseUnits(n.toString(), 'gwei');
  };

  // Parse gas unit strings to numbers
  const parseGasUnits = (val) => {
    const n = parseInt(val, 10);
    return (!val || isNaN(n) || n <= 0) ? 0 : n;
  };

  // Parse budget cap from ETH string to wei
  const budgetCapWei = paymasterState.budgetCapEth && parseFloat(paymasterState.budgetCapEth) > 0
    ? ethers.utils.parseEther(paymasterState.budgetCapEth)
    : ethers.BigNumber.from(0);

  // Convert epoch value + unit to seconds
  const unitToSeconds = { hours: 3600, days: 86400, weeks: 604800 };
  const epochValue = parseFloat(paymasterState.budgetEpochValue) || 0;
  const epochSeconds = Math.round(epochValue * (unitToSeconds[paymasterState.budgetEpochUnit] || 86400));

  return {
    operatorRoleIndex,
    autoWhitelistContracts: Boolean(paymasterState.autoWhitelistContracts),
    maxFeePerGas: parseGwei(paymasterState.maxFeePerGas),
    maxPriorityFeePerGas: parseGwei(paymasterState.maxPriorityFeePerGas),
    maxCallGas: parseGasUnits(paymasterState.maxCallGas),
    maxVerificationGas: parseGasUnits(paymasterState.maxVerificationGas),
    maxPreVerificationGas: parseGasUnits(paymasterState.maxPreVerificationGas),
    defaultBudgetCapPerEpoch: budgetCapWei,
    defaultBudgetEpochLen: epochSeconds,
  };
}

/**
 * Get the ETH value to send with deployFullOrg (msg.value for paymaster funding)
 * @param {Object} paymasterState - Paymaster state from deployer context
 * @returns {ethers.BigNumber} Value in wei, or 0 if no funding
 */
export function getPaymasterFundingValue(paymasterState) {
  if (!paymasterState?.enabled || !paymasterState.fundingAmountEth) {
    return ethers.BigNumber.from(0);
  }
  const amount = parseFloat(paymasterState.fundingAmountEth);
  if (isNaN(amount) || amount <= 0) {
    return ethers.BigNumber.from(0);
  }
  return ethers.utils.parseEther(paymasterState.fundingAmountEth);
}

/**
 * Main mapper function - converts full deployer state to DeploymentParams
 * @param {Object} state - Deployer state from context
 * @param {string} deployerAddress - Address of the deployer wallet
 * @param {Object} [options={}] - Additional options
 * @param {string} [options.registryAddress] - Universal Account Registry address (fetched from subgraph, required)
 * @returns {Object} DeploymentParams for contract
 */
export function mapStateToDeploymentParams(state, deployerAddress, options = {}) {
  const { organization, roles, permissions, voting, features, paymaster } = state;
  const registryAddress = options.registryAddress;

  if (!registryAddress) {
    throw new Error('Registry address not found. Please ensure the subgraph is synced and returning infrastructure addresses.');
  }

  // Generate orgId
  const orgId = generateOrgId(organization.name);

  // Map roles
  const contractRoles = roles.map((role, idx) => mapRole(role, idx, roles.length));

  // Map voting classes
  const hybridClasses = mapVotingClasses(voting.classes);

  // Build role assignments
  const roleAssignments = buildRoleAssignments(permissions);

  return {
    orgId,
    orgName: organization.name,
    metadataHash: ethers.constants.HashZero, // Will be set by deployment script after IPFS upload
    registryAddr: registryAddress,
    deployerAddress,
    deployerUsername: organization.username || '',
    // EIP-712 registration signature (safe defaults skip registration in contract)
    regDeadline: options.regSignatureData?.regDeadline ?? 0,
    regNonce: options.regSignatureData?.regNonce ?? 0,
    regSignature: options.regSignatureData?.regSignature ?? '0x',
    autoUpgrade: organization.autoUpgrade,
    hybridQuorumPct: voting.hybridQuorum,
    ddQuorumPct: voting.ddQuorum,
    hybridClasses,
    ddInitialTargets: [], // Empty for now
    roles: contractRoles,
    roleAssignments,
    // Metadata admin: which role's hat gets metadata-admin privilege.
    // ethers.constants.MaxUint256 = skip (topHat fallback in contract).
    metadataAdminRoleIndex: options.metadataAdminRoleIndex ?? ethers.constants.MaxUint256,
    // Passkey support (boolean - matches deployed contract v1.0.1)
    passkeyEnabled: false,
    // Education hub configuration
    educationHubConfig: {
      enabled: features.educationHubEnabled || false,
    },
    // Bootstrap configuration (initial projects and tasks)
    bootstrap: {
      projects: [],
      tasks: [],
    },
    // Paymaster configuration (all-zeros = skip)
    paymasterConfig: mapPaymasterConfig(paymaster),
  };
}

/**
 * Create the full deployment configuration including metadata
 * @param {Object} state - Deployer state from context
 * @param {string} deployerAddress - Address of the deployer wallet
 * @param {Object} [options={}] - Additional options
 * @param {string} [options.registryAddress] - Universal Account Registry address (fetched from subgraph, required)
 * @returns {Object} Full deployment config with metadata
 */
export function createDeploymentConfig(state, deployerAddress, options = {}) {
  const params = mapStateToDeploymentParams(state, deployerAddress, options);

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
      electionHubEnabled: state.features.electionHubEnabled,
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
    },
  };
}

/**
 * Validate the deployment configuration
 * @param {Object} state - Deployer state
 * @returns {Object} { isValid: boolean, errors: string[] }
 */
export function validateDeploymentConfig(state) {
  const errors = [];

  // Organization validation
  if (!state.organization.name) {
    errors.push('Organization name is required');
  }
  if (!state.organization.description) {
    errors.push('Organization description is required');
  }

  // Roles validation
  if (state.roles.length === 0) {
    errors.push('At least one role is required');
  }
  if (state.roles.length > 32) {
    errors.push('Maximum 32 roles allowed');
  }

  // Check for unique role names
  const roleNames = state.roles.map(r => r.name.toLowerCase());
  const uniqueNames = new Set(roleNames);
  if (uniqueNames.size !== roleNames.length) {
    errors.push('Role names must be unique');
  }

  // Check for empty role names
  if (state.roles.some(r => !r.name || r.name.trim() === '')) {
    errors.push('All roles must have a name');
  }

  // Check at least one top-level role
  const hasTopLevel = state.roles.some(r => r.hierarchy.adminRoleIndex === null);
  if (!hasTopLevel && state.roles.length > 0) {
    errors.push('At least one role must be a top-level admin');
  }

  // Voting class validation
  const totalSlice = state.voting.classes.reduce((sum, c) => sum + c.slicePct, 0);
  if (totalSlice !== 100) {
    errors.push(`Voting class percentages must sum to 100% (currently ${totalSlice}%)`);
  }

  if (state.voting.classes.length === 0) {
    errors.push('At least one voting class is required');
  }

  if (state.voting.classes.length > 8) {
    errors.push('Maximum 8 voting classes allowed');
  }

  // Vouching validation
  state.roles.forEach((role, idx) => {
    if (role.vouching.enabled) {
      if (role.vouching.quorum <= 0) {
        errors.push(`Role "${role.name}" has vouching enabled but quorum must be positive`);
      }
      if (role.vouching.voucherRoleIndex >= state.roles.length) {
        errors.push(`Role "${role.name}" has invalid voucher role reference`);
      }
    }
  });

  // Hierarchy validation (check for self-reference)
  state.roles.forEach((role, idx) => {
    if (role.hierarchy.adminRoleIndex === idx) {
      errors.push(`Role "${role.name}" cannot be its own admin`);
    }
  });

  // Paymaster validation
  if (state.paymaster?.enabled) {
    const pm = state.paymaster;
    if (pm.operatorRoleIndex !== null && pm.operatorRoleIndex >= state.roles.length) {
      errors.push('Paymaster operator role index is out of range');
    }
    const epochValue = parseFloat(pm.budgetEpochValue) || 0;
    const unitToSeconds = { hours: 3600, days: 86400, weeks: 604800 };
    const epochSeconds = Math.round(epochValue * (unitToSeconds[pm.budgetEpochUnit] || 86400));
    const capEth = parseFloat(pm.budgetCapEth);
    const hasCapSet = !isNaN(capEth) && capEth > 0;
    const hasEpochSet = epochSeconds > 0;
    if (hasCapSet !== hasEpochSet) {
      errors.push('Budget cap and epoch length must both be set or both be zero');
    }
    if (hasEpochSet) {
      if (epochSeconds < 3600) errors.push('Budget epoch must be at least 1 hour');
      if (epochSeconds > 31536000) errors.push('Budget epoch must be at most 365 days');
    }
    const fundingEth = parseFloat(pm.fundingAmountEth);
    if (!isNaN(fundingEth) && fundingEth < 0) {
      errors.push('Paymaster funding amount cannot be negative');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Log deployment parameters for debugging
 * @param {Object} params - DeploymentParams
 */
export function logDeploymentParams(params) {
  console.log('=== Deployment Parameters ===');
  console.log('OrgId:', params.orgId);
  console.log('OrgName:', params.orgName);
  console.log('Deployer:', params.deployerAddress);
  console.log('Username:', params.deployerUsername || '(none)');
  console.log('Reg Deadline:', params.regDeadline?.toString?.() ?? '0');
  console.log('Reg Nonce:', params.regNonce?.toString?.() ?? '0');
  console.log('Reg Signature:', params.regSignature === '0x' ? '(skip)' : params.regSignature?.slice(0, 20) + '...');
  console.log('Auto Upgrade:', params.autoUpgrade);
  console.log('Hybrid Quorum:', params.hybridQuorumPct);
  console.log('DD Quorum:', params.ddQuorumPct);
  console.log('Roles:', params.roles.length);
  params.roles.forEach((r, i) => {
    console.log(`  [${i}] ${r.name}`, {
      canVote: r.canVote,
      vouching: r.vouching.enabled,
      parent: r.hierarchy.adminRoleIndex.toString(),
    });
  });
  console.log('Voting Classes:', params.hybridClasses.length);
  params.hybridClasses.forEach((c, i) => {
    console.log(`  [${i}] Strategy: ${c.strategy}, Slice: ${c.slicePct}%, Quadratic: ${c.quadratic}`);
  });
  console.log('Role Assignments:', params.roleAssignments);
  console.log('Metadata Admin Role Index:', params.metadataAdminRoleIndex?.toString?.() ?? 'max (skip)');
  console.log('Paymaster Config:', params.paymasterConfig);
}

export default {
  generateOrgId,
  mapRole,
  mapVotingClasses,
  buildRoleAssignments,
  mapPaymasterConfig,
  getPaymasterFundingValue,
  mapStateToDeploymentParams,
  createDeploymentConfig,
  validateDeploymentConfig,
  logDeploymentParams,
};
