import React from 'react';
import { Box, HStack, Text } from '@chakra-ui/react';
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
import { ACCENT, INK, TABULAR, SeriesDot } from '@/components/treasury/treasuryStyles';

const COLORS = {
  inflow: ACCENT.in,
  outflow: ACCENT.out,
};

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <Box bg="rgba(13,20,17,0.97)" border="1px solid rgba(255,255,255,0.14)" borderRadius="lg" p={3} maxW="220px">
      <Text fontWeight="semibold" color={INK.primary} fontSize="sm" mb={1.5}>{label}</Text>
      {payload.map((entry, i) => (
        <HStack key={i} justify="space-between" spacing={4}>
          <HStack spacing={1.5}>
            <SeriesDot color={entry.color} size="7px" />
            <Text fontSize="xs" color={INK.secondary}>{entry.name}</Text>
          </HStack>
          <Text fontSize="xs" color={INK.primary} fontWeight="medium" sx={TABULAR}>
            {typeof entry.value === 'number' ? entry.value.toFixed(4) : entry.value}
          </Text>
        </HStack>
      ))}
    </Box>
  );
};

/** The chart runtime loads independently of the treasury's readable totals. */
export default function HistoricalActivityChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} barGap={2}>
        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: INK.muted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: INK.muted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={45}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Legend
          wrapperStyle={{ fontSize: '11px' }}
          iconType="square"
          iconSize={8}
          formatter={(value) => (
            <span style={{ color: 'rgba(255,255,255,0.66)' }}>{value}</span>
          )}
        />
        <Bar dataKey="received" name="Money in" fill={COLORS.inflow} radius={[4, 4, 0, 0]} maxBarSize={24} />
        <Bar dataKey="distributed" name="Shared out" fill={COLORS.outflow} radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}
