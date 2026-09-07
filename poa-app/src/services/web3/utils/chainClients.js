/**
 * Create chain-specific viem + Pimlico clients.
 * Used by hooks that need to interact with a chain different from the home chain.
 */

import { createPublicClient, http } from 'viem';
import { getNetworkByChainId } from '@/config/networks';
import { defineNetworkChain } from '@/services/web3/utils/publicChainClient';
import { createLazyPimlicoClient } from '@/services/web3/utils/lazyPimlicoClient';

export { createPublicClientForChain } from '@/services/web3/utils/publicChainClient';

/**
 * Create viem public client + Pimlico bundler client for a specific chain.
 * @param {number} chainId
 * @returns {{ publicClient: Object, bundlerClient: Object } | null}
 */
export function createChainClients(chainId) {
  const network = getNetworkByChainId(chainId);
  if (!network) return null;

  const chain = defineNetworkChain(network);

  return {
    publicClient: createPublicClient({ chain, transport: http(network.rpcUrl) }),
    bundlerClient: createLazyPimlicoClient(chain),
  };
}
