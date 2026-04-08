/**
 * useTokenBalances
 * Fetches ERC20 + native token balances across all mainnet chains in parallel.
 * Used on the account page (outside org context).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { NETWORKS } from '@/config/networks';
import { getBountyTokenOptions } from '@/util/tokens';
import { createChainClients } from '@/services/web3/utils/chainClients';
import ERC20ABI from '../../abi/ERC20.json';

const mainnetChains = Object.entries(NETWORKS).filter(([_, n]) => !n.isTestnet);

export function useTokenBalances(address) {
  const [balances, setBalances] = useState([]);
  const [nativeBalances, setNativeBalances] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const clientsRef = useRef(null);

  // Create chain clients once
  if (!clientsRef.current) {
    const clients = {};
    for (const [name, network] of mainnetChains) {
      const c = createChainClients(network.chainId);
      if (c) clients[network.chainId] = { ...c, name: network.name, nativeCurrency: network.nativeCurrency };
    }
    clientsRef.current = clients;
  }

  const fetchBalances = useCallback(async () => {
    if (!address) {
      setBalances([]);
      setNativeBalances({});
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const clients = clientsRef.current;
    const allBalances = [];
    const natives = {};

    const promises = [];

    for (const [chainIdStr, client] of Object.entries(clients)) {
      const chainId = Number(chainIdStr);
      const tokens = getBountyTokenOptions(chainId);

      // Fetch native balance for gas check
      promises.push(
        client.publicClient.getBalance({ address })
          .then(b => { natives[chainId] = b.toString(); })
          .catch(() => { natives[chainId] = '0'; })
      );

      // Fetch each ERC20 balance
      for (const token of tokens) {
        promises.push(
          client.publicClient.readContract({
            address: token.address,
            abi: ERC20ABI,
            functionName: 'balanceOf',
            args: [address],
          })
            .then(balance => {
              if (balance > 0n) {
                allBalances.push({
                  ...token,
                  balance: balance.toString(),
                  chainId,
                  chainName: client.name,
                  nativeCurrency: client.nativeCurrency,
                });
              }
            })
            .catch(() => { /* skip failed token reads */ })
        );
      }
    }

    await Promise.allSettled(promises);
    setBalances(allBalances);
    setNativeBalances(natives);
    setIsLoading(false);
  }, [address]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  return { balances, nativeBalances, isLoading, refetch: fetchBalances };
}

export default useTokenBalances;
