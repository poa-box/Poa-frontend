/**
 * Network Configuration
 * Centralizes all network-related constants for multi-chain support
 */

import { NETWORKS as CORE_NETWORKS, HOME_NETWORK, DEFAULT_DEPLOY_NETWORK as CORE_DEPLOY_NETWORK } from '@poa-box/core/chains';

// Product support, public endpoint overrides, funding defaults and peg copy remain host-owned.
export const NETWORKS = {
  arbitrum: {
    ...CORE_NETWORKS.arbitrum,
    rpcUrl: process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    subgraphUrl: process.env.NEXT_PUBLIC_ARBITRUM_SUBGRAPH_URL || 'https://gateway.thegraph.com/api/204b1629ba85581bdc48cc6701e821ff/subgraphs/id/2egvcs94ZStD38inRtK9bp3Maw3UZw4BDinH8jLyAF4G',
    bountyTokens: { ...CORE_NETWORKS.arbitrum.bountyTokens },
    defaultFunding: '0.003',
    defaultBudgetCap: '0.003',
  },
  gnosis: {
    ...CORE_NETWORKS.gnosis,
    // usdPegged: xDAI is a USD stablecoin, so UIs may honestly gloss native
    // amounts as ≈ dollars. Leave unset for volatile natives (ETH).
    nativeCurrency: { ...CORE_NETWORKS.gnosis.nativeCurrency, usdPegged: true },
    rpcUrl: process.env.NEXT_PUBLIC_GNOSIS_RPC_URL || 'https://rpc.gnosischain.com',
    subgraphUrl: process.env.NEXT_PUBLIC_GNOSIS_SUBGRAPH_URL || 'https://gateway.thegraph.com/api/204b1629ba85581bdc48cc6701e821ff/subgraphs/id/576YA6oF16nA2uG5Q9KFfBSvJm4ZNKzWZkwh8eWXaxJs',
    bountyTokens: {
      BREAD: CORE_NETWORKS.gnosis.bountyTokens.BREAD,
      USDC: CORE_NETWORKS.gnosis.bountyTokens.USDC,
      WXDAI: CORE_NETWORKS.gnosis.bountyTokens.WXDAI,
    },
    defaultFunding: '0.0002',
    defaultBudgetCap: '0.0002',
  },
};

// Home chain (accounts, passkeys, core infrastructure)
export const DEFAULT_NETWORK = HOME_NETWORK;
export const DEFAULT_CHAIN_ID = NETWORKS[DEFAULT_NETWORK].chainId;

// Default chain for org deployment (satellite chain)
export const DEFAULT_DEPLOY_NETWORK = CORE_DEPLOY_NETWORK;
export const DEFAULT_DEPLOY_CHAIN_ID = NETWORKS[DEFAULT_DEPLOY_NETWORK].chainId;

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
  return Object.values(NETWORKS)
    .filter(n => !n.isTestnet)
    .map(n => ({ chainId: n.chainId, url: n.subgraphUrl, name: n.name }));
}
