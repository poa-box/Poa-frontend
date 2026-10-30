import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { describe, it, expect, vi } from 'vitest';
import { resolveTokenLabel } from '@/util/tokenLabel';
const state = vi.hoisted(() => ({ tokenLabel: 'Shares' }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => state }));
vi.mock('@/context/UserContext', () => ({ useUserContext: () => ({ isAccountReady: true, userDataLoading: false }) }));
vi.mock('@/hooks/useOrgName', () => ({ useOrgName: () => 'Test6' }));
vi.mock('@/hooks/useTreasuryShare', () => ({ useTreasuryShare: () => ({ treasuryShare: 5, stableTotal: 10, userSharePct: 0.5,
  userPtBalance: 1, totalPtSupply: 2, isLoading: false }) }));
import TokenBalancesGrid from '@/components/treasury/TokenBalancesGrid';
import TreasuryHeader from '@/components/treasury/TreasuryHeader';
const render = element => renderToStaticMarkup(React.createElement(ChakraProvider, null, element));

describe('treasury label and unknown display preservation', () => {
  it('keeps Shares and configured symbol case in both holdings and personal summary', () => {
    for (const [useTokenSymbol, symbol, expected] of [[undefined, 'ALT', 'Shares'], [false, 'ALT', 'Shares'], [true, 'MiXeD', 'MiXeD'], [true, '', 'Shares']]) {
      state.tokenLabel = resolveTokenLabel({ useTokenSymbol, symbol });
      const holdings = render(React.createElement(TokenBalancesGrid, { totalSupply: '2000000000000000000' }));
      const personal = render(React.createElement(TreasuryHeader, { memberCount: 2 }));
      expect(holdings).toContain(expected);
      expect(personal).toContain(`of 2 ${expected}`);
      if (expected === 'MiXeD') expect(personal).not.toContain('mixed');
    }
  });
  it('shows missing pool balances and promises as unavailable rather than a zero or hidden row', () => {
    state.tokenLabel = 'Shares';
    const html = render(React.createElement(TokenBalancesGrid, { bountyPool: [{ address: `0x${'1'.repeat(40)}`,
      symbol: 'USDC', name: 'USD Coin', decimals: 6, isStable: true, balance: null, committed: null, shortfall: null }] }));
    expect(html).toContain('Unavailable');
    expect(html).toContain('promises unavailable');
  });
});
