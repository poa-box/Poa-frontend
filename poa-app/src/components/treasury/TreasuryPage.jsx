import React, { useMemo, useEffect, useState, useCallback } from 'react';
import {
  Box,
  VStack,
  Grid,
  GridItem,
  Text,
  Spinner,
  Center,
  useBreakpointValue,
  useDisclosure,
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useQuery } from '@apollo/client';
import { usePOContext } from '@/context/POContext';
import { useUserContext } from '@/context/UserContext';
import { useRefreshSubscription, RefreshEvent } from '@/context/RefreshContext';
import Navbar from '@/templateComponents/studentOrgDAO/NavBar';
import { FETCH_TREASURY_DATA } from '@/util/queries';
import { getBountyTokenOptions } from '@/util/tokens';
import { createChainClients } from '@/services/web3/utils/chainClients';
import TreasuryHeader from './TreasuryHeader';
import TokenBalancesGrid from './TokenBalancesGrid';
import CurrentDistributions from './CurrentDistributions';
import DistributionHistory from './DistributionHistory';
import HistoricalOverview from './HistoricalOverview';
import ParticipationTokenModal from './ParticipationTokenModal';
import DepositModal from './DepositModal';

const glassLayerStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backgroundColor: 'rgba(0, 0, 0, .79)',
};

const BALANCE_OF_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
];

const TreasuryPage = () => {
  const router = useRouter();
  const { userDAO } = router.query;
  const {
    orgId,
    poContextLoading,
    poMembers,
    participationTokenAddress,
    subgraphUrl,
    hideTreasury,
    orgChainId,
  } = usePOContext();
  const { hasExecRole } = useUserContext();

  // Redirect to dashboard if treasury is hidden
  useEffect(() => {
    if (hideTreasury && !poContextLoading) {
      router.replace(`/dashboard/?userDAO=${userDAO}`);
    }
  }, [hideTreasury, poContextLoading, router, userDAO]);

  // Modal state
  const { isOpen: isPTModalOpen, onOpen: onPTModalOpen, onClose: onPTModalClose } = useDisclosure();
  const { isOpen: isDepositOpen, onOpen: onDepositOpen, onClose: onDepositClose } = useDisclosure();

  // Responsive design
  const sectionHeadingSize = useBreakpointValue({ base: 'lg', md: 'xl' });

  // Fetch treasury data from subgraph
  const { data: treasuryData, loading: treasuryLoading, refetch } = useQuery(FETCH_TREASURY_DATA, {
    variables: { orgId },
    skip: !orgId,
    fetchPolicy: 'cache-first',
    context: { subgraphUrl },
  });

  const isLoading = poContextLoading || treasuryLoading;

  // Extract data from query
  const paymentManager = treasuryData?.organization?.paymentManager;
  const distributions = paymentManager?.distributions || [];
  const payments = paymentManager?.payments || [];
  const totalSupply = treasuryData?.organization?.participationToken?.totalSupply;

  // Extract completed tasks from all projects (flattened)
  const completedTasks = useMemo(() => {
    const projects = treasuryData?.organization?.taskManager?.projects || [];
    return projects.flatMap(p => p.tasks || []);
  }, [treasuryData]);

  // Memoize filtered distributions to avoid recalculation on every render
  const { activeDistributions, completedDistributions, totalDistributed } = useMemo(() => {
    const active = distributions.filter(d => d.status === 'Active');
    const completed = distributions.filter(d => d.status === 'Finalized');
    const total = distributions.reduce((sum, d) =>
      sum + BigInt(d.totalAmount || 0), BigInt(0));
    return { activeDistributions: active, completedDistributions: completed, totalDistributed: total };
  }, [distributions]);

  // ERC20 treasury balance fetching
  const [erc20Balances, setErc20Balances] = useState([]);
  const [balancesLoading, setBalancesLoading] = useState(false);

  const fetchErc20Balances = useCallback(async () => {
    if (!paymentManager?.id || !orgChainId) return;

    const tokens = getBountyTokenOptions(orgChainId);
    if (tokens.length === 0) return;

    const clients = createChainClients(orgChainId);
    const client = clients?.publicClient;
    if (!client) return;

    setBalancesLoading(true);
    try {
      const balances = await Promise.all(
        tokens.map(async (token) => {
          try {
            const balance = await client.readContract({
              address: token.address,
              abi: BALANCE_OF_ABI,
              functionName: 'balanceOf',
              args: [paymentManager.id],
            });
            return { ...token, balance: balance.toString() };
          } catch (e) {
            console.warn(`Failed to fetch balance for ${token.symbol}:`, e.message);
            return { ...token, balance: '0' };
          }
        })
      );
      setErc20Balances(balances);
    } catch (e) {
      console.error('Failed to fetch treasury balances:', e);
    } finally {
      setBalancesLoading(false);
    }
  }, [paymentManager?.id, orgChainId]);

  // Fetch balances on initial load
  useEffect(() => {
    fetchErc20Balances();
  }, [fetchErc20Balances]);

  // Refetch balances after treasury deposit
  // Pass fetchErc20Balances as dep so the subscription captures the latest callback
  // (on mount, paymentManager.id is null and fetchErc20Balances early-returns)
  useRefreshSubscription(RefreshEvent.TREASURY_DEPOSITED, () => {
    refetch();
    // Delay balance refetch slightly to allow chain state to update
    setTimeout(fetchErc20Balances, 2000);
  }, [fetchErc20Balances]);

  return (
    <>
      <Navbar />
      {isLoading ? (
        <Center height="100vh">
          <VStack spacing={4}>
            <Spinner size="xl" color="purple.400" />
            <Text color="gray.400">Loading treasury data...</Text>
          </VStack>
        </Center>
      ) : (
        <Box p={{ base: 2, md: 4 }} mt={{ base: 16, md: 0 }}>
          <Grid
            color="whitesmoke"
            templateAreas={{
              base: `
                'header'
                'balances'
                'distributions'
                'history'
                'charts'
              `,
              md: `
                'header header'
                'balances distributions'
                'history history'
                'charts charts'
              `,
            }}
            templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }}
            gap={{ base: 3, md: 4 }}
          >
            {/* Treasury Header */}
            <GridItem area="header">
              <Box
                w="100%"
                borderRadius="2xl"
                bg="transparent"
                boxShadow="lg"
                position="relative"
                zIndex={2}
              >
                <div style={glassLayerStyle} />
                <TreasuryHeader
                  memberCount={poMembers}
                  totalDistributed={totalDistributed.toString()}
                  distributionCount={distributions.length}
                  isAdmin={hasExecRole}
                  onCreateDistribution={() => {/* TODO: Open modal */}}
                  onDeposit={onDepositOpen}
                  refetch={refetch}
                />
              </Box>
            </GridItem>

            {/* Token Balances */}
            <GridItem area="balances">
              <Box
                h="100%"
                borderRadius="2xl"
                bg="transparent"
                boxShadow="lg"
                position="relative"
                zIndex={2}
              >
                <div style={glassLayerStyle} />
                <VStack pb={1} align="flex-start" position="relative" borderTopRadius="2xl">
                  <div style={glassLayerStyle} />
                  <Text pl={{ base: 3, md: 6 }} fontWeight="bold" fontSize={sectionHeadingSize}>
                    Treasury Balances
                  </Text>
                </VStack>
                <Box p={{ base: 2, md: 4 }}>
                  <TokenBalancesGrid
                    totalSupply={totalSupply}
                    onPTClick={onPTModalOpen}
                    isLoading={treasuryLoading || balancesLoading}
                    erc20Balances={erc20Balances}
                  />
                </Box>
              </Box>
            </GridItem>

            {/* Current Distributions */}
            <GridItem area="distributions">
              <Box
                h="100%"
                borderRadius="2xl"
                bg="transparent"
                boxShadow="lg"
                position="relative"
                zIndex={2}
              >
                <div style={glassLayerStyle} />
                <VStack pb={1} align="flex-start" position="relative" borderTopRadius="2xl">
                  <div style={glassLayerStyle} />
                  <Text pl={{ base: 3, md: 6 }} fontWeight="bold" fontSize={sectionHeadingSize}>
                    Active Profit Shares
                  </Text>
                </VStack>
                <Box p={{ base: 2, md: 4 }}>
                  <CurrentDistributions
                    distributions={activeDistributions}
                    paymentManagerAddress={paymentManager?.id}
                    refetch={refetch}
                  />
                </Box>
              </Box>
            </GridItem>

            {/* Distribution History */}
            <GridItem area="history">
              <Box
                borderRadius="2xl"
                bg="transparent"
                boxShadow="lg"
                position="relative"
                zIndex={2}
              >
                <div style={glassLayerStyle} />
                <VStack pb={1} align="flex-start" position="relative" borderTopRadius="2xl">
                  <div style={glassLayerStyle} />
                  <Text pl={{ base: 3, md: 6 }} fontWeight="bold" fontSize={sectionHeadingSize}>
                    Distribution History
                  </Text>
                </VStack>
                <Box p={{ base: 2, md: 4 }}>
                  <DistributionHistory
                    distributions={completedDistributions}
                    payments={payments}
                  />
                </Box>
              </Box>
            </GridItem>

            {/* Historical Charts */}
            <GridItem area="charts">
              <Box
                borderRadius="2xl"
                bg="transparent"
                boxShadow="lg"
                position="relative"
                zIndex={2}
              >
                <div style={glassLayerStyle} />
                <VStack pb={1} align="flex-start" position="relative" borderTopRadius="2xl">
                  <div style={glassLayerStyle} />
                  <Text pl={{ base: 3, md: 6 }} fontWeight="bold" fontSize={sectionHeadingSize}>
                    Financial Overview
                  </Text>
                </VStack>
                <Box p={{ base: 2, md: 4 }}>
                  <HistoricalOverview
                    distributions={distributions}
                    payments={payments}
                  />
                </Box>
              </Box>
            </GridItem>
          </Grid>
        </Box>
      )}

      {/* PT Stats Modal */}
      <ParticipationTokenModal
        isOpen={isPTModalOpen}
        onClose={onPTModalClose}
        totalSupply={totalSupply}
        completedTasks={completedTasks}
        tokenAddress={participationTokenAddress}
      />

      {/* Deposit Modal */}
      <DepositModal
        isOpen={isDepositOpen}
        onClose={onDepositClose}
        paymentManagerAddress={paymentManager?.id}
        orgChainId={orgChainId}
      />
    </>
  );
};

export default TreasuryPage;
