/**
 * Network Configuration
 * Centralizes all network-related constants for multi-chain support
 */

export const NETWORKS = {
  sepolia: {
    chainId: 11155111,
    name: 'Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrl: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
    blockExplorer: 'https://sepolia.etherscan.io',
    isTestnet: true,
    subgraphUrl: process.env.NEXT_PUBLIC_SEPOLIA_SUBGRAPH_URL || 'https://api.studio.thegraph.com/query/73367/poa-sepolia/version/latest',
  },
  baseSepolia: {
    chainId: 84532,
    name: 'Base Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrl: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-rpc.publicnode.com',
    blockExplorer: 'https://sepolia.basescan.org',
    isTestnet: true,
    subgraphUrl: process.env.NEXT_PUBLIC_BASE_SEPOLIA_SUBGRAPH_URL || 'https://api.studio.thegraph.com/query/73367/poa-base-sepolia/version/latest',
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

export const DEFAULT_SUBGRAPH_URL = NETWORKS[DEFAULT_NETWORK].subgraphUrl;

/**
 * Get subgraph URL for a given chain ID.
 * Falls back to the default network's subgraph.
 */
export function getSubgraphUrl(chainId) {
  return getNetworkByChainId(chainId)?.subgraphUrl || DEFAULT_SUBGRAPH_URL;
}

/**
 * Get all subgraph endpoints for cross-chain queries.
 * Used by browse page and org discovery to query all chains in parallel.
 */
export function getAllSubgraphUrls() {
  return Object.values(NETWORKS).map(n => ({ chainId: n.chainId, url: n.subgraphUrl, name: n.name }));
}
