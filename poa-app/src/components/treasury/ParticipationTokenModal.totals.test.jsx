import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveTokenLabel } from '@/util/tokenLabel';
const f = vi.hoisted(() => ({ context: {} }));
vi.mock('@chakra-ui/react', async () => { const { mockChakra } = await import('@/test/mockChakra'); return mockChakra(); });
vi.mock('recharts', () => { const Item = ({ children }) => children; return Object.fromEntries(['AreaChart', 'Area', 'BarChart', 'Bar', 'XAxis', 'YAxis', 'Tooltip', 'ResponsiveContainer', 'CartesianGrid'].map(name => [name, Item])); });
vi.mock('@/context/POContext', () => ({ usePOContext: () => f.context }));
vi.mock('@/util/apolloClient', () => ({ useSubgraphClient: vi.fn() }));
vi.mock('@/components/shared/PulseLoader', () => ({ default: () => null }));
import ParticipationTokenModal from '@/components/treasury/ParticipationTokenModal';
function render() { return renderToStaticMarkup(<ParticipationTokenModal isOpen totalSupply="2000000000000000000" />); }
beforeEach(() => { f.context = { leaderboardData: Array.from({ length: 100 }, () => ({ token: '100' })), leaderboardCoverage: { status: 'preview' } }; });
describe('rendered current holder totals and reward vocabulary', () => {
  it('uses the complete positive holder count instead of the historical leaderboard window', () => {
    f.context = { ...f.context, currentHolderCount: 2, currentHolderBalanceRaw: '2000000000000000000' };
    const html = render();
    expect(html).toContain('>2</div><div>Holders'); expect(html).toContain('Avg Balance</div><div>1');
    expect(html).not.toContain('>100</div><div>Holders');
  });
  it('distinguishes complete zero from unknown count and unknown rewards history', () => {
    let html = render(); expect(html).toContain('Unavailable</div><div>Holders');
    f.context.currentHolderCount = 0; f.context.currentHolderBalanceRaw = '0'; html = render();
    expect(html).toContain('>0</div><div>Holders'); expect(html).toContain('Complete rewards history is unavailable');
  });
  it.each([[{}, 'mIx', 'Shares'], [{ useTokenSymbol: false }, 'mIx', 'Shares'],
    [{ useTokenSymbol: true }, 'mIx', 'mIx'], [{ useTokenSymbol: true }, '', 'Shares']])('honors configured reward label %j / %s', (configuration, symbol, expected) => {
    f.context.tokenLabel = resolveTokenLabel({ ...configuration, symbol });
    expect(render()).toContain(`${expected} earned`);
  });
});
