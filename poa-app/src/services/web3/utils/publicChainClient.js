/** Public RPC clients, independent of wallet and bundler initialization. */
import { createClient, http, defineChain } from 'viem';
import { getBalance, getBlockNumber, readContract } from 'viem/actions';
import { getNetworkByChainId } from '@/config/networks';

export function defineNetworkChain(network) {
  return defineChain({
    id: network.chainId,
    name: network.name,
    nativeCurrency: network.nativeCurrency,
    rpcUrls: { default: { http: [network.rpcUrl] } },
    blockExplorers: { default: { name: 'Explorer', url: network.blockExplorer } },
  });
}

/**
 * A read-only viem public client for a chain — for balance/state reads that have no business
 * constructing a bundler client (which needs a Pimlico key and warns when it is missing).
 * @param {number} chainId
 * @returns {Object | null}
 */
export function createPublicClientForChain(chainId) {
  const network = getNetworkByChainId(chainId);
  if (!network) return null;
  // Match viem's public client identity/defaults without attaching every public
  // action. Standalone readContract retains viem's call/ABI/error behavior.
  return createClient({
    chain: defineNetworkChain(network),
    transport: http(network.rpcUrl),
    key: 'public',
    name: 'Public Client',
    type: 'publicClient',
  }).extend((client) => ({
    getBlockNumber: (args) => getBlockNumber(client, args),
    getBalance: (args) => getBalance(client, args),
    readContract: (args) => readContract(client, args),
  }));
}
