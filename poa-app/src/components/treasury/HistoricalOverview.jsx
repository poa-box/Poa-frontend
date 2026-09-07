import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Box,
  Button,
  VStack,
  HStack,
  Text,
  SimpleGrid,
  VisuallyHidden,
} from '@chakra-ui/react';
import { formatTokenAmount } from '@/util/formatToken';
import { getTokenByAddress } from '@/util/tokens';
import { ACCENT, INK, SeriesDot, twoDp, UnitSpan } from '@/components/treasury/treasuryStyles';

// Series hues validated against the card surface (see treasuryStyles.js).
const COLORS = {
  inflow: ACCENT.in,
  outflow: ACCENT.out,
};

// ─── Stat tiles ───
// Values wear ink, never the series color; the dot beside the label carries
// identity and ties the tile to its series in the chart below.

const StatTile = ({ label, value, unit, subtext, dot }) => (
  <Box py={1}>
    <HStack spacing={1.5} mb={1.5}>
      {dot && <SeriesDot color={dot} size="7px" />}
      <Text fontSize="xs" color={INK.muted}>{label}</Text>
    </HStack>
    <Text fontSize="2xl" fontWeight="semibold" color={INK.primary} lineHeight="1.1">
      {value}
      {unit && <UnitSpan>{unit}</UnitSpan>}
    </Text>
    {subtext && <Text fontSize="xs" color={INK.muted} mt={1}>{subtext}</Text>}
  </Box>
);

function ChartLoading({ error, retry }) {
  if (!error) {
    return <VisuallyHidden role="status">Loading activity chart…</VisuallyHidden>;
  }
  return (
    <VStack h="100%" justify="center" role="alert" spacing={2}>
      <Text color={INK.secondary} fontSize="sm">The activity chart couldn’t load.</Text>
      <Button size="sm" variant="ghost" color={INK.primary} onClick={retry}>Try again</Button>
    </VStack>
  );
}

const HistoricalActivityChart = dynamic(
  () => import('@/components/treasury/HistoricalActivityChart'),
  { ssr: false, loading: ChartLoading },
);

function ActivityChartSlot({ data }) {
  const slotRef = useRef(null);
  const [hasApproached, setHasApproached] = useState(false);

  useEffect(() => {
    if (hasApproached) return;
    if (typeof IntersectionObserver === 'undefined') {
      setHasApproached(true);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setHasApproached(true);
        observer.disconnect();
      }
    }, { rootMargin: '240px 0px' });
    if (slotRef.current) observer.observe(slotRef.current);
    return () => observer.disconnect();
  }, [hasApproached]);

  // Reserve the chart's original dimensions while keeping its runtime out of
  // the page's startup. Once approached, keep it mounted when scrolling away.
  return (
    <Box ref={slotRef} h={{ base: '170px', md: '200px' }}>
      {hasApproached && <HistoricalActivityChart data={data} />}
    </Box>
  );
}

// ─── Main Component ───

const HistoricalOverview = ({ distributions = [], payments = [] }) => {
  // ─── Aggregate stats ───
  const stats = useMemo(() => {
    let totalReceived = 0;
    let totalDistributed = 0;
    let totalClaimed = 0;
    let tokenSymbol = '';

    payments.forEach(p => {
      const token = getTokenByAddress(p.token);
      if (!tokenSymbol && token.symbol !== 'ERC20') tokenSymbol = token.symbol;
      totalReceived += parseFloat(formatTokenAmount(p.amount, token.decimals, 6));
    });

    distributions.forEach(d => {
      const token = getTokenByAddress(d.payoutToken);
      if (!tokenSymbol && token.symbol !== 'ERC20') tokenSymbol = token.symbol;
      totalDistributed += parseFloat(formatTokenAmount(d.totalAmount, token.decimals, 6));
      totalClaimed += parseFloat(formatTokenAmount(d.totalClaimed || '0', token.decimals, 6));
    });

    return {
      totalReceived: totalReceived.toFixed(4),
      totalDistributed: totalDistributed.toFixed(4),
      totalClaimed: totalClaimed.toFixed(4),
      claimRate: totalDistributed > 0 ? ((totalClaimed / totalDistributed) * 100).toFixed(0) : '0',
      tokenSymbol: tokenSymbol || 'tokens',
      distributionCount: distributions.length,
      paymentCount: payments.length,
    };
  }, [distributions, payments]);

  // ─── Timeline data (daily events) ───
  const timelineData = useMemo(() => {
    const days = {};

    payments.forEach(p => {
      const date = new Date(parseInt(p.receivedAt) * 1000);
      const key = date.toISOString().split('T')[0];
      const token = getTokenByAddress(p.token);
      const amount = parseFloat(formatTokenAmount(p.amount, token.decimals, 6));

      if (!days[key]) days[key] = { date: key, received: 0, distributed: 0 };
      days[key].received += amount;
    });

    distributions.forEach(d => {
      const timestamp = d.createdAt;
      const date = new Date(parseInt(timestamp) * 1000);
      const key = date.toISOString().split('T')[0];
      const token = getTokenByAddress(d.payoutToken);
      const amount = parseFloat(formatTokenAmount(d.totalClaimed || '0', token.decimals, 6));

      if (!days[key]) days[key] = { date: key, received: 0, distributed: 0 };
      days[key].distributed += amount;
    });

    return Object.values(days)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        ...d,
        label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        received: parseFloat(d.received.toFixed(4)),
        distributed: parseFloat(d.distributed.toFixed(4)),
      }));
  }, [distributions, payments]);

  if (distributions.length === 0 && payments.length === 0) {
    return (
      <VStack py={8}>
        <Text color={INK.secondary} fontSize="sm">No financial activity yet</Text>
        <Text fontSize="xs" color={INK.muted}>
          Activity will appear here after deposits or payouts
        </Text>
      </VStack>
    );
  }

  return (
    <VStack spacing={5} align="stretch">
      {/* ─── Insight strip ─── */}
      <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={4}>
        <StatTile
          label="Total received"
          value={twoDp(stats.totalReceived)}
          unit={stats.tokenSymbol}
          subtext={`${stats.paymentCount} deposit${stats.paymentCount !== 1 ? 's' : ''}`}
          dot={COLORS.inflow}
        />
        <StatTile
          label="Shared with members"
          value={twoDp(stats.totalDistributed)}
          unit={stats.tokenSymbol}
          subtext={`${stats.distributionCount} payout${stats.distributionCount !== 1 ? 's' : ''}`}
          dot={COLORS.outflow}
        />
        <StatTile
          label="Claimed by members"
          value={twoDp(stats.totalClaimed)}
          unit={stats.tokenSymbol}
          subtext={`${stats.claimRate}% of what was shared`}
        />
      </SimpleGrid>

      {/* ─── Activity Chart ─── */}
      {timelineData.length > 0 && (
        <Box>
          <ActivityChartSlot data={timelineData} />
          <Text fontSize="xs" color={INK.muted} mt={2}>
            Amounts shown in the org&apos;s main payout token.
          </Text>
        </Box>
      )}
    </VStack>
  );
};

export default HistoricalOverview;
