import React, { useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Link,
  Button,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  SimpleGrid,
  Spinner,
  useBreakpointValue,
} from '@chakra-ui/react';
import { ExternalLinkIcon } from '@chakra-ui/icons';
import { FiZap, FiPlus } from 'react-icons/fi';
import { formatTokenAmount } from '@/util/formatToken';
import { getNetworkByChainId } from '@/config/networks';
import { usePOContext } from '@/context/POContext';

const formatDate = (timestamp) => {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatTime = (timestamp) => {
  return new Date(timestamp * 1000).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const truncateAddress = (addr) => {
  if (!addr) return '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

const GasPoolSection = ({ gasPoolData, isLoading, onDeposit }) => {
  const { orgChainId } = usePOContext();
  const isMobile = useBreakpointValue({ base: true, md: false });

  const network = getNetworkByChainId(orgChainId);
  const nativeSymbol = network?.nativeCurrency?.symbol || 'ETH';

  const config = gasPoolData?.paymasterOrgConfigs?.[0];
  // stats is a singular @derivedFrom field (not an array)
  const stats = config?.stats;
  const depositEvents = config?.depositEvents || [];
  const usageEvents = config?.usageEvents || [];

  // Combine deposit and usage events into a unified history
  const history = useMemo(() => {
    const deposits = depositEvents.map(e => ({
      type: 'deposit',
      id: e.id,
      amount: e.amount,
      from: e.from,
      timestamp: parseInt(e.eventAt),
      txHash: e.transactionHash,
    }));

    const usage = usageEvents.map(e => ({
      type: 'usage',
      id: e.id,
      amount: e.delta,
      timestamp: parseInt(e.eventAt),
      txHash: e.transactionHash,
    }));

    return [...deposits, ...usage].sort((a, b) => b.timestamp - a.timestamp);
  }, [depositEvents, usageEvents]);

  if (isLoading) {
    return (
      <VStack py={8}>
        <Spinner size="lg" color="purple.400" />
        <Text color="gray.400" fontSize="sm">Loading gas pool data...</Text>
      </VStack>
    );
  }

  if (!config) {
    return (
      <VStack py={6} spacing={3}>
        <FiZap size={28} color="gray" />
        <Text color="gray.400">No gas sponsorship configured</Text>
        <Text fontSize="sm" color="gray.500" textAlign="center">
          This organization does not have a paymaster registered yet.
        </Text>
      </VStack>
    );
  }

  const depositBalance = config.depositBalance || '0';
  const totalDeposited = config.totalDeposited || '0';
  const totalSpent = config.totalSpent || '0';
  const totalUserOps = stats?.totalUserOps || '0';
  const totalGasSponsored = stats?.totalGasSponsored || '0';

  const getExplorerUrl = (txHash) => {
    const explorer = network?.blockExplorer || 'https://etherscan.io';
    return `${explorer}/tx/${txHash}`;
  };

  return (
    <VStack spacing={5} align="stretch">
      {/* Stats Row */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
        <Stat>
          <StatLabel color="gray.400" fontSize="xs">Current Balance</StatLabel>
          <StatNumber fontSize={{ base: 'lg', md: 'xl' }} color="green.300">
            {formatTokenAmount(depositBalance, 18, 6)} {nativeSymbol}
          </StatNumber>
          <StatHelpText color="gray.500" fontSize="xs">Available for gas</StatHelpText>
        </Stat>

        <Stat>
          <StatLabel color="gray.400" fontSize="xs">Total Deposited</StatLabel>
          <StatNumber fontSize={{ base: 'lg', md: 'xl' }}>
            {formatTokenAmount(totalDeposited, 18, 6)} {nativeSymbol}
          </StatNumber>
          <StatHelpText color="gray.500" fontSize="xs">Lifetime</StatHelpText>
        </Stat>

        <Stat>
          <StatLabel color="gray.400" fontSize="xs">Gas Sponsored</StatLabel>
          <StatNumber fontSize={{ base: 'lg', md: 'xl' }}>
            {formatTokenAmount(totalGasSponsored, 18, 6)} {nativeSymbol}
          </StatNumber>
          <StatHelpText color="gray.500" fontSize="xs">{totalUserOps} operations</StatHelpText>
        </Stat>

        <Stat>
          <StatLabel color="gray.400" fontSize="xs">Total Spent</StatLabel>
          <StatNumber fontSize={{ base: 'lg', md: 'xl' }} color="orange.300">
            {formatTokenAmount(totalSpent, 18, 6)} {nativeSymbol}
          </StatNumber>
          <StatHelpText color="gray.500" fontSize="xs">Includes fees</StatHelpText>
        </Stat>
      </SimpleGrid>

      {/* Fund Button */}
      <Box>
        <Button
          leftIcon={<FiPlus />}
          colorScheme="purple"
          size="sm"
          onClick={onDeposit}
        >
          Fund Gas Pool
        </Button>
      </Box>

      {/* History */}
      {history.length === 0 ? (
        <VStack py={4}>
          <Text color="gray.400" fontSize="sm">No gas pool activity yet</Text>
        </VStack>
      ) : isMobile ? (
        <VStack spacing={3} align="stretch">
          {history.slice(0, 15).map((item) => (
            <Box
              key={item.id}
              p={3}
              bg="rgba(0, 0, 0, 0.3)"
              borderRadius="lg"
            >
              <HStack justify="space-between" mb={2}>
                <Badge colorScheme={item.type === 'deposit' ? 'green' : 'orange'} fontSize="xs">
                  {item.type === 'deposit' ? 'Funded' : 'Gas Used'}
                </Badge>
                <Text fontSize="xs" color="gray.400">
                  {formatDate(item.timestamp)}
                </Text>
              </HStack>
              <HStack justify="space-between">
                <Text fontWeight="bold" fontSize="sm">
                  {item.type === 'deposit' ? '+' : '-'}
                  {formatTokenAmount(item.amount, 18, 6)} {nativeSymbol}
                </Text>
                {item.txHash && (
                  <Link
                    href={getExplorerUrl(item.txHash)}
                    isExternal
                    fontSize="xs"
                    color="purple.300"
                  >
                    View <ExternalLinkIcon mx="2px" />
                  </Link>
                )}
              </HStack>
              {item.type === 'deposit' && item.from && (
                <Text fontSize="xs" color="gray.500">
                  From: {truncateAddress(item.from)}
                </Text>
              )}
            </Box>
          ))}
        </VStack>
      ) : (
        <Box overflowX="auto">
          <Text fontSize="sm" fontWeight="medium" color="gray.300" mb={2}>
            Activity History
          </Text>
          <Table variant="simple" size="sm">
            <Thead>
              <Tr>
                <Th color="gray.400">Date</Th>
                <Th color="gray.400">Type</Th>
                <Th color="gray.400" isNumeric>Amount</Th>
                <Th color="gray.400">Details</Th>
                <Th color="gray.400">Link</Th>
              </Tr>
            </Thead>
            <Tbody>
              {history.slice(0, 20).map((item) => (
                <Tr key={item.id}>
                  <Td color="gray.300" fontSize="sm">
                    {formatDate(item.timestamp)}{' '}
                    <Text as="span" color="gray.500" fontSize="xs">{formatTime(item.timestamp)}</Text>
                  </Td>
                  <Td>
                    <Badge
                      colorScheme={item.type === 'deposit' ? 'green' : 'orange'}
                      fontSize="xs"
                    >
                      {item.type === 'deposit' ? 'Funded' : 'Gas Used'}
                    </Badge>
                  </Td>
                  <Td
                    isNumeric
                    fontWeight="bold"
                    color={item.type === 'deposit' ? 'green.300' : 'orange.300'}
                  >
                    {item.type === 'deposit' ? '+' : '-'}
                    {formatTokenAmount(item.amount, 18, 6)} {nativeSymbol}
                  </Td>
                  <Td fontSize="sm" color="gray.400">
                    {item.type === 'deposit' && item.from
                      ? `From: ${truncateAddress(item.from)}`
                      : item.type === 'usage'
                        ? 'Sponsored operation'
                        : ''}
                  </Td>
                  <Td>
                    {item.txHash && (
                      <Link
                        href={getExplorerUrl(item.txHash)}
                        isExternal
                        fontSize="xs"
                        color="purple.300"
                      >
                        <ExternalLinkIcon />
                      </Link>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      )}
    </VStack>
  );
};

export default GasPoolSection;
