/**
 * useTokenBalances
 * Fetches ERC20 + native token balances across all mainnet chains in parallel.
 * Used on the account page (outside org context).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { NETWORKS } from '@/config/networks';
import { getBountyTokenOptions } from '@/util/tokens';
import { createPublicClientForChain } from '@/services/web3/utils/publicChainClient';
import { ERC20Abi as ERC20ABI } from '@poa-box/core/abis/ERC20';
import { requireRawUint } from '@poa-box/core/amounts';

const mainnetChains = Object.entries(NETWORKS).filter(([_, n]) => !n.isTestnet);

export function useTokenBalances(address) {
  const [balances, setBalances] = useState([]);
  const [nativeBalances, setNativeBalances] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const clientsRef = useRef(null);
  const generation = useRef(0);
  const accountRef = useRef(address);
  accountRef.current = address;
  const [errors, setErrors] = useState([]);
  const [resolvedAccount, setResolvedAccount] = useState(null);

  // Create chain clients once
  if (!clientsRef.current) {
    const clients = {};
    for (const [name, network] of mainnetChains) {
      const publicClient = createPublicClientForChain(network.chainId);
      if (publicClient) clients[network.chainId] = { publicClient, name: network.name, nativeCurrency: network.nativeCurrency };
    }
    clientsRef.current = clients;
  }

  const fetchBalances = useCallback(async (signal) => {
    const request = ++generation.current;
    const failures = [];
    const current = () => !signal?.aborted && generation.current === request && accountRef.current === address;
    if (!address) {
      setBalances([]);
      setNativeBalances({});
      setIsLoading(false);
      setResolvedAccount(address);
      setErrors([]);
      return;
    }

    setIsLoading(true);
    const clients = clientsRef.current;
    const allBalances = [];
    const natives = {};
    setBalances([]);
    setNativeBalances({});
    setErrors([]);

    const promises = [];

    for (const [chainIdStr, client] of Object.entries(clients)) {
      const chainId = Number(chainIdStr);
      const tokens = getBountyTokenOptions(chainId);

      // Fetch native balance for gas check
      promises.push(
        client.publicClient.getBalance({ address })
          .then(b => { natives[chainId] = requireRawUint(b.toString()); })
          .catch(() => { natives[chainId] = null; failures.push({ chainId, token: null, code: 'NATIVE_BALANCE_UNAVAILABLE' }); })
      );

      // Fetch each ERC20 balance
      for (const token of tokens) {
        promises.push(
          client.publicClient.readContract({
            address: token.address.toLowerCase(),
            abi: ERC20ABI,
            functionName: 'balanceOf',
            args: [address],
          })
            .then(balance => {
              if (balance > 0n) {
                allBalances.push({
                  ...token,
                  balance: requireRawUint(balance.toString()),
                  chainId,
                  chainName: client.name,
                  nativeCurrency: client.nativeCurrency,
                });
              }
            })
            .catch(() => { failures.push({ chainId, token: token.address, code: 'TOKEN_BALANCE_UNAVAILABLE' }); })
        );
      }
    }

    await Promise.allSettled(promises);
    if (!current()) return;
    setResolvedAccount(address);
    setErrors(failures);
    setBalances(allBalances);
    setNativeBalances(natives);
    setIsLoading(false);
  }, [address]);

  useEffect(() => {
    const sequence = generation;
    const controller = new AbortController();
    fetchBalances(controller.signal);
    return () => { controller.abort(); sequence.current++; };
  }, [fetchBalances]);

  const currentAccount = resolvedAccount === address;
  return { balances: currentAccount ? balances : [], nativeBalances: currentAccount ? nativeBalances : {},
    isLoading: isLoading || !currentAccount, errors: currentAccount ? errors : [],
    coverage: !currentAccount || isLoading ? 'loading' : errors.length ? 'incomplete' : 'complete', refetch: fetchBalances };
}

export default useTokenBalances;
