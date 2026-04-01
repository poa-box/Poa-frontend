/**
 * Create chain-specific viem + Pimlico clients.
 * Used by hooks that need to interact with a chain different from the home chain.
 */

import { createPublicClient, http, defineChain } from 'viem';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { getNetworkByChainId } from '../../../config/networks';
import { getBundlerUrl, ENTRY_POINT_ADDRESS } from '../../../config/passkey';

/**
 * Create viem public client + Pimlico bundler client for a specific chain.
 * @param {number} chainId
 * @returns {{ publicClient: Object, bundlerClient: Object } | null}
 */
export function createChainClients(chainId) {
  const network = getNetworkByChainId(chainId);
  if (!network) return null;

  const chain = defineChain({
    id: network.chainId,
    name: network.name,
    nativeCurrency: network.nativeCurrency,
    rpcUrls: { default: { http: [network.rpcUrl] } },
    blockExplorers: { default: { name: 'Explorer', url: network.blockExplorer } },
  });

  return {
    publicClient: createPublicClient({ chain, transport: http(network.rpcUrl) }),
    bundlerClient: createPimlicoClient({
      chain,
      transport: http(getBundlerUrl(network.chainId)),
      entryPoint: { address: ENTRY_POINT_ADDRESS, version: '0.7' },
    }),
  };
}
