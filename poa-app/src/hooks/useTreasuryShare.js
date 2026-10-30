/** Fiat estimates are host display policy; raw units stay exact until final display conversion. */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@apollo/client';
import { requireRawUint, sumRawAssetAmounts } from '@poa-box/core/amounts';
import { ERC20Abi } from '@poa-box/core/abis/ERC20';
import { usePOContext } from '@/context/POContext';
import { useUserContext } from '@/context/UserContext';
import { useAuth } from '@/context/authState';
import { useRefreshSubscription, RefreshEvent } from '@/context/RefreshContext';
import { getBountyTokenOptions } from '@/util/tokens';
import { formatTokenAmount } from '@/util/formatToken';
import { useSubgraphClient } from '@/util/apolloClient';
import { FETCH_TREASURY_DATA, FETCH_USER_DATA_NEW } from '@/util/queries';
import { createPublicClientForChain } from '@/services/web3/utils/publicChainClient';

export function calculateTreasuryShare({ balances, userBalanceRaw, totalSupplyRaw }) {
  const totals = sumRawAssetAmounts(balances);
  const stableRaw = totals.reduce((sum, total) => sum + BigInt(total.rawAmount) * 10n ** BigInt(18 - total.asset.decimals), 0n);
  const user = BigInt(requireRawUint(userBalanceRaw)), supply = BigInt(requireRawUint(totalSupplyRaw));
  if (user > supply) throw new Error('Participation snapshot inconsistent');
  const ratioRaw = supply > 0n ? user * 10n ** 18n / supply : 0n;
  const shareRaw = supply > 0n ? stableRaw * user / supply : 0n;
  return { stableTotalRaw: stableRaw.toString(), treasuryShareRaw: shareRaw.toString(),
    stableTotal: Number(stableRaw) / 1e18, treasuryShare: Number(shareRaw) / 1e18,
    userSharePct: Number(ratioRaw) / 1e18, userPtBalance: formatTokenAmount(user.toString(), 18), totalPtSupply: formatTokenAmount(supply.toString(), 18) };
}

export function useTreasuryShare() {
  const { orgId, subgraphUrl, paymentManagerAddress, orgChainId, hideTreasury } = usePOContext();
  const { orgUserID, isAccountReady } = useUserContext();
  const { accountAddress, isAuthHydrated } = useAuth();
  const client = useSubgraphClient(subgraphUrl);
  // Reuse existing endpoint-specific cache entries, including unrounded raw amounts.
  const supply = useQuery(FETCH_TREASURY_DATA, { client, variables: { orgId }, skip: hideTreasury || !orgId || !subgraphUrl, fetchPolicy: 'cache-first' });
  const member = useQuery(FETCH_USER_DATA_NEW, { client, variables: { orgUserID, userAddress: accountAddress?.toLowerCase() },
    skip: hideTreasury || !orgUserID || !accountAddress || isAuthHydrated === false, fetchPolicy: 'cache-first' });
  const [state, setState] = useState({ scope: null, balances: null, loading: false, error: null });
  const generation = useRef(0);
  const scopeKey = [orgId, subgraphUrl, orgChainId, paymentManagerAddress, hideTreasury].join(':');
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  const fetchBalances = useCallback(async () => {
    const request = ++generation.current;
    if (hideTreasury || !paymentManagerAddress || !orgChainId) return;
    const current = () => generation.current === request && scopeRef.current === scopeKey;
    setState({ scope: scopeKey, balances: null, loading: true, error: null });
    try {
      const tokens = getBountyTokenOptions(orgChainId).filter(t => t.isStable);
      const rpc = createPublicClientForChain(orgChainId);
      if (!rpc) throw new Error('Treasury balances unavailable');
      const blockNumber = await rpc.getBlockNumber();
      const balances = await Promise.all(tokens.map(async token => ({
        asset: { chainId: orgChainId, address: token.address.toLowerCase(), decimals: token.decimals },
        rawAmount: String(await rpc.readContract({ address: token.address.toLowerCase(), abi: ERC20Abi,
          functionName: 'balanceOf', args: [paymentManagerAddress.toLowerCase()], blockNumber })),
      })));
      if (current()) setState({ scope: scopeKey, balances, loading: false, error: null });
    } catch (error) { if (current()) setState({ scope: scopeKey, balances: null, loading: false, error }); }
  }, [hideTreasury, orgChainId, paymentManagerAddress, scopeKey]);
  useEffect(() => { const sequence = generation; fetchBalances(); return () => { sequence.current++; }; }, [fetchBalances]);
  useRefreshSubscription(RefreshEvent.TREASURY_DEPOSITED, fetchBalances, [fetchBalances]);
  const empty = { treasuryShare: null, stableTotal: null, userSharePct: 0, userPtBalance: 0, totalPtSupply: 0, isHidden: !!hideTreasury };
  if (hideTreasury) return { ...empty, isLoading: false };
  if (state.scope !== scopeKey || !state.balances || isAuthHydrated === false || isAccountReady === false || supply.loading || member.loading) {
    return { ...empty, isLoading: !state.error && !supply.error && !member.error, error: state.error || supply.error || member.error };
  }
  const org = supply.data?.organization, user = member.data?.user;
  if (org?.id?.toLowerCase() !== orgId.toLowerCase() || (accountAddress &&
      (user?.id?.toLowerCase() !== orgUserID?.toLowerCase() || user?.address?.toLowerCase() !== accountAddress.toLowerCase()))) {
    return { ...empty, isLoading: false, error: new Error('Participation balances unavailable') };
  }
  try {
    return { ...calculateTreasuryShare({ balances: state.balances, userBalanceRaw: accountAddress ? user.participationTokenBalance : '0',
      totalSupplyRaw: org.participationToken?.totalSupply }), isLoading: false, isHidden: false };
  } catch (error) { return { ...empty, isLoading: false, error }; }
}
export default useTreasuryShare;
