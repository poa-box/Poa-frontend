/**
 * Contract Address Registry
 * Centralizes all contract addresses per network
 */

import { NETWORKS, DEFAULT_CHAIN_ID, getNetworkNameByChainId } from './networks';

/**
 * Infrastructure contracts deployed across networks
 * These are singleton contracts used by the entire protocol
 *
 * Note: universalAccountRegistry is primarily fetched from the subgraph at runtime
 * (see useWeb3Services.js). The hardcoded address here is a fallback for UserService.
 * hatsProtocol is the same address on all chains.
 */
export const INFRASTRUCTURE_CONTRACTS = {
  arbitrum: {
    hatsProtocol: '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137',
  },
  gnosis: {
    hatsProtocol: '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137',
  },
  sepolia: {
    universalAccountRegistry: '0xDdB1DA30020861d92c27aE981ac0f4Fe8BA536F2',
    hatsProtocol: '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137',
  },
  baseSepolia: {
    universalAccountRegistry: '0xDdB1DA30020861d92c27aE981ac0f4Fe8BA536F2',
    hatsProtocol: '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137',
  },
};

/**
 * Get infrastructure contract address
 * @param {string} contractName - Name of the contract (e.g., 'universalAccountRegistry')
 * @param {number} [chainId] - Network chain ID (defaults to Sepolia)
 * @returns {string|null} Contract address or null if not found
 */
export function getInfrastructureAddress(contractName, chainId = DEFAULT_CHAIN_ID) {
  // Use nullish coalescing to handle explicit null values (e.g., from services that don't specify chainId)
  const effectiveChainId = chainId ?? DEFAULT_CHAIN_ID;
  const networkName = getNetworkNameByChainId(effectiveChainId);
  if (!networkName) {
    console.warn(`No network found for chain ID: ${effectiveChainId}`);
    return null;
  }

  const contracts = INFRASTRUCTURE_CONTRACTS[networkName];
  if (!contracts) {
    console.warn(`No contracts deployed on network: ${networkName}`);
    return null;
  }

  const address = contracts[contractName];
  if (!address) {
    console.warn(`Contract ${contractName} not found on network: ${networkName}`);
    return null;
  }

  return address;
}

/**
 * Contract name constants to avoid typos
 */
export const CONTRACT_NAMES = {
  UNIVERSAL_ACCOUNT_REGISTRY: 'universalAccountRegistry',
  HATS_PROTOCOL: 'hatsProtocol',
};

/**
 * Get the Universal Account Registry address for a chain
 * @param {number} [chainId] - Network chain ID (defaults to Sepolia)
 * @returns {string|null} Contract address
 */
export function getUniversalAccountRegistryAddress(chainId) {
  return getInfrastructureAddress(CONTRACT_NAMES.UNIVERSAL_ACCOUNT_REGISTRY, chainId);
}
