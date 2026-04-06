import React from 'react';
import { Box, Container, Heading, Text, SimpleGrid, VStack, HStack, Badge, Table, Thead, Tbody, Tr, Th, Td, Link } from '@chakra-ui/react';
import { ExternalLinkIcon } from '@chakra-ui/icons';
import { motion } from 'framer-motion';

const MotionBox = motion(Box);

const StatCard = ({ label, value, subtext, color = 'warmGray.800' }) => (
  <Box bg="white" border="1px solid" borderColor="warmGray.100" borderRadius="lg" p={4}>
    <Text fontSize="xs" color="warmGray.500" mb={1}>{label}</Text>
    <Text fontSize="xl" fontWeight="bold" color={color}>{value}</Text>
    {subtext && <Text fontSize="xs" color="warmGray.400" mt={1}>{subtext}</Text>}
  </Box>
);

const ChainSolidarityCard = ({ chain }) => {
  // Use on-chain data if available, fall back to subgraph data
  const onChain = chain.onChain?.solidarity;
  const grace = chain.onChain?.grace;
  const pm = chain.paymaster; // subgraph PaymasterHubContract data
  const events = chain.solidarityEvents || [];

  // Prefer on-chain (real-time) → subgraph (indexed) → fallback
  const balance = onChain?.balance
    ?? (pm?.solidarityBalance ? (parseInt(pm.solidarityBalance) / 1e18).toFixed(4) : null);
  const activeOrgs = onChain?.numActiveOrgs ?? null;
  const feeBps = onChain?.feePercentageBps ?? null;
  const paused = onChain?.distributionPaused ?? pm?.solidarityDistributionPaused;
  const graceDays = grace?.initialGraceDays ?? pm?.gracePeriodDays;
  const graceMaxSpend = grace?.maxSpendDuringGrace
    ?? (pm?.maxSpendDuringGrace ? (parseInt(pm.maxSpendDuringGrace) / 1e18).toFixed(4) : null);

  return (
    <Box bg="white" border="1px solid" borderColor="warmGray.100" borderRadius="xl" p={5}>
      <HStack mb={4}>
        <Heading fontSize="md" fontWeight="700" color="warmGray.800">{chain.name}</Heading>
        <Badge
          bg={paused ? 'warmGray.100' : 'green.50'}
          color={paused ? 'warmGray.500' : 'green.600'}
          fontSize="2xs"
        >
          {paused === true ? 'Paused' : paused === false ? 'Active' : '...'}
        </Badge>
      </HStack>

      <SimpleGrid columns={2} spacing={3} mb={4}>
        <StatCard
          label="Fund Balance"
          value={balance != null ? `${parseFloat(balance).toFixed(4)} ${chain.nativeCurrency}` : '...'}
          color="green.600"
        />
        <StatCard
          label="Active Orgs"
          value={activeOrgs ?? (pm ? parseInt(chain.orgStats?.totalOrgs || '0') : '...')}
          subtext="Orgs with deposits"
        />
        <StatCard
          label="Fee Rate"
          value={feeBps != null ? `${(feeBps / 100).toFixed(1)}%` : '1.0%'}
          subtext="Collected on gas"
        />
        <StatCard
          label="Grace Period"
          value={graceDays != null ? `${graceDays} days` : '...'}
          subtext={graceMaxSpend != null ? `Max ${graceMaxSpend} ${chain.nativeCurrency}` : ''}
        />
      </SimpleGrid>

      {events.length > 0 && (
        <Box>
          <Text fontSize="xs" fontWeight="600" color="warmGray.500" mb={2} textTransform="uppercase">
            Recent Activity
          </Text>
          <Box overflowX="auto" maxH="200px" overflowY="auto">
            <Table size="sm" variant="simple">
              <Thead>
                <Tr>
                  <Th color="warmGray.400" fontSize="2xs">Type</Th>
                  <Th color="warmGray.400" fontSize="2xs" isNumeric>Amount</Th>
                  <Th color="warmGray.400" fontSize="2xs">Date</Th>
                </Tr>
              </Thead>
              <Tbody>
                {events.slice(0, 10).map(e => (
                  <Tr key={e.id}>
                    <Td>
                      <Badge
                        fontSize="2xs"
                        bg={e.eventType === 'Donation' ? 'green.50' : e.eventType === 'FeeCollected' ? 'amethyst.50' : 'warmGray.50'}
                        color={e.eventType === 'Donation' ? 'green.600' : e.eventType === 'FeeCollected' ? 'amethyst.600' : 'warmGray.600'}
                      >
                        {e.eventType}
                      </Badge>
                    </Td>
                    <Td isNumeric fontSize="xs" fontFamily="mono">
                      {(parseInt(e.amount) / 1e18).toFixed(6)}
                    </Td>
                    <Td fontSize="xs" color="warmGray.500">
                      <HStack spacing={1}>
                        <Text>{new Date(parseInt(e.eventAt) * 1000).toLocaleDateString()}</Text>
                        {e.transactionHash && (
                          <Link href={`${chain.blockExplorer}/tx/${e.transactionHash}`} isExternal>
                            <ExternalLinkIcon boxSize={3} color="warmGray.400" />
                          </Link>
                        )}
                      </HStack>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        </Box>
      )}
    </Box>
  );
};

const SolidaritySection = ({ chains }) => (
  <Box as="section" py={{ base: 12, md: 16 }} bg="warmGray.50">
    <Container maxW="6xl">
      <MotionBox initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
        <Text fontSize="sm" fontWeight="600" color="warmGray.400" letterSpacing="0.08em" textTransform="uppercase" mb={2}>
          Solidarity Fund
        </Text>
        <Heading fontSize={{ base: 'xl', md: '2xl' }} fontWeight="700" color="warmGray.800" mb={2}>
          Shared Gas Sponsorship
        </Heading>
        <Text fontSize="sm" color="warmGray.500" mb={6}>
          The solidarity fund subsidizes gas costs for new organizations during their grace period. Funded by a small fee on all sponsored transactions.
        </Text>

        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
          {Object.values(chains).map(chain => (
            <ChainSolidarityCard key={chain.chainId} chain={chain} />
          ))}
        </SimpleGrid>
      </MotionBox>
    </Container>
  </Box>
);

export default SolidaritySection;
