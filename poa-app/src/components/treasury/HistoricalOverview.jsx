import React, { useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  SimpleGrid,
  Progress,
  Badge,
} from '@chakra-ui/react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { formatTokenAmount } from '@/util/formatToken';
import { getTokenByAddress } from '@/util/tokens';

const COLORS = {
  inflow: '#2ECC71',
  outflow: '#9B59B6',
  claimed: '#3498DB',
};

// ─── Summary Cards ───

const SummaryCard = ({ label, value, subtext, color = 'white' }) => (
  <Box bg="rgba(0,0,0,0.3)" borderRadius="lg" p={3}>
    <Text fontSize="xs" color="gray.500" mb={1}>{label}</Text>
    <Text fontSize="lg" fontWeight="bold" color={color}>{value}</Text>
    {subtext && <Text fontSize="xs" color="gray.500" mt={1}>{subtext}</Text>}
  </Box>
);

// ─── Custom Tooltip ───

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <Box bg="rgba(20,20,30,0.95)" border="1px solid rgba(148,115,220,0.5)" borderRadius="lg" p={3} maxW="200px">
      <Text fontWeight="bold" color="white" fontSize="sm" mb={1}>{label}</Text>
      {payload.map((entry, i) => (
        <HStack key={i} justify="space-between" spacing={3}>
          <HStack spacing={1}>
            <Box w="8px" h="8px" borderRadius="sm" bg={entry.color} />
            <Text fontSize="xs" color="gray.300">{entry.name}</Text>
          </HStack>
          <Text fontSize="xs" color="white" fontWeight="medium">
            {typeof entry.value === 'number' ? entry.value.toFixed(4) : entry.value}
          </Text>
        </HStack>
      ))}
    </Box>
  );
};

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

  // ─── Per-distribution breakdown ───
  const distBreakdown = useMemo(() => {
    return distributions
      .filter(d => d.totalAmount && d.totalAmount !== '0')
      .map(d => {
        const token = getTokenByAddress(d.payoutToken);
        const total = parseFloat(formatTokenAmount(d.totalAmount, token.decimals, 6));
        const claimed = parseFloat(formatTokenAmount(d.totalClaimed || '0', token.decimals, 6));
        const pct = total > 0 ? (claimed / total) * 100 : 0;

        return {
          id: d.distributionId,
          token: token.symbol,
          total,
          claimed,
          unclaimed: total - claimed,
          pct,
          claimCount: d.claims?.length || 0,
          status: d.status,
          date: new Date(parseInt(d.createdAt) * 1000).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric',
          }),
        };
      });
  }, [distributions]);

  if (distributions.length === 0 && payments.length === 0) {
    return (
      <VStack py={8}>
        <Text color="gray.400">No financial activity yet</Text>
        <Text fontSize="sm" color="gray.500">
          Activity will appear here after deposits or distributions
        </Text>
      </VStack>
    );
  }

  return (
    <VStack spacing={5} align="stretch">
      {/* ─── Summary Cards ─── */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
        <SummaryCard
          label="Total Received"
          value={stats.totalReceived}
          subtext={`${stats.paymentCount} deposit${stats.paymentCount !== 1 ? 's' : ''} · ${stats.tokenSymbol}`}
          color={COLORS.inflow}
        />
        <SummaryCard
          label="Total Distributed"
          value={stats.totalDistributed}
          subtext={`${stats.distributionCount} distribution${stats.distributionCount !== 1 ? 's' : ''} · ${stats.tokenSymbol}`}
          color={COLORS.outflow}
        />
        <SummaryCard
          label="Total Claimed"
          value={stats.totalClaimed}
          subtext={`${stats.claimRate}% claim rate · ${stats.tokenSymbol}`}
          color={COLORS.claimed}
        />
        <SummaryCard
          label="Net Balance"
          value={(parseFloat(stats.totalReceived) - parseFloat(stats.totalClaimed)).toFixed(4)}
          subtext={`Received minus claimed · ${stats.tokenSymbol}`}
        />
      </SimpleGrid>

      {/* ─── Activity Chart ─── */}
      {timelineData.length > 0 && (
        <Box>
          <Text fontSize="sm" fontWeight="medium" color="gray.400" mb={3}>
            Treasury Activity
          </Text>
          <Box h={{ base: '180px', md: '220px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timelineData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={45}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}
                  iconType="square"
                  iconSize={8}
                />
                <Bar dataKey="received" name="Received" fill={COLORS.inflow} radius={[3, 3, 0, 0]} maxBarSize={40} />
                <Bar dataKey="distributed" name="Distributed" fill={COLORS.outflow} radius={[3, 3, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Box>
      )}

      {/* ─── Distribution Breakdown ─── */}
      {distBreakdown.length > 0 && (
        <Box>
          <Text fontSize="sm" fontWeight="medium" color="gray.400" mb={3}>
            Distribution Breakdown
          </Text>
          <VStack spacing={3} align="stretch">
            {distBreakdown.map(d => (
              <Box key={d.id} bg="rgba(0,0,0,0.25)" borderRadius="lg" p={3}>
                <HStack justify="space-between" mb={2}>
                  <HStack spacing={2}>
                    <Text fontSize="sm" fontWeight="bold">#{d.id}</Text>
                    <Badge
                      colorScheme={d.status === 'Active' ? 'green' : 'gray'}
                      fontSize="2xs"
                    >
                      {d.status}
                    </Badge>
                    <Text fontSize="xs" color="gray.500">{d.date}</Text>
                  </HStack>
                  <Text fontSize="sm" color="gray.300">
                    {d.claimed.toFixed(4)} / {d.total.toFixed(4)} {d.token}
                  </Text>
                </HStack>
                <Progress
                  value={d.pct}
                  colorScheme="purple"
                  borderRadius="full"
                  size="sm"
                  bg="rgba(255,255,255,0.08)"
                />
                <HStack justify="space-between" mt={1}>
                  <Text fontSize="xs" color="gray.500">
                    {d.claimCount} claimed · {d.pct.toFixed(0)}%
                  </Text>
                  <Text fontSize="xs" color={d.unclaimed > 0 ? 'orange.300' : 'green.300'}>
                    {d.unclaimed > 0 ? `${d.unclaimed.toFixed(4)} unclaimed` : 'Fully claimed'}
                  </Text>
                </HStack>
              </Box>
            ))}
          </VStack>
        </Box>
      )}
    </VStack>
  );
};

export default HistoricalOverview;
