/**
 * Network Configuration
 * Centralizes all network-related constants for multi-chain support
 */

export const NETWORKS = {
  sepolia: {
    chainId: 11155111,
    name: 'Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrl: 'https://rpc.sepolia.org',
    blockExplorer: 'https://sepolia.etherscan.io',
    isTestnet: true,
    graphClientSource: 'poa-sepolia',
  },
  baseSepolia: {
    chainId: 84532,
    name: 'Base Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrl: 'https://sepolia.base.org',
    blockExplorer: 'https://sepolia.basescan.org',
    isTestnet: true,
    graphClientSource: 'poa-base-sepolia',
  },
};

export const DEFAULT_NETWORK = 'sepolia';
export const DEFAULT_CHAIN_ID = NETWORKS[DEFAULT_NETWORK].chainId;

/**
 * Get network configuration by chain ID
 * @param {number} chainId - The chain ID to look up
 * @returns {Object|null} Network configuration or null if not found
 */
export function getNetworkByChainId(chainId) {
  return Object.values(NETWORKS).find(n => n.chainId === chainId) || null;
}

/**
 * Get network name by chain ID
 * @param {number} chainId - The chain ID to look up
 * @returns {string|null} Network name or null if not found
 */
export function getNetworkNameByChainId(chainId) {
  const entry = Object.entries(NETWORKS).find(([_, config]) => config.chainId === chainId);
  return entry ? entry[0] : null;
}

/**
 * Check if a chain ID is supported
 * @param {number} chainId - The chain ID to check
 * @returns {boolean} True if the network is supported
 */
export function isNetworkSupported(chainId) {
  return !!getNetworkByChainId(chainId);
}

/**
 * Map graph-client _sourceName to network config.
 * Used by POContext and profileHubContext to determine an org's chain.
 */
export const SOURCE_TO_NETWORK = Object.fromEntries(
  Object.values(NETWORKS).map(config => [config.graphClientSource, config])
);
