/**
 * Account Page
 * Displays user's global account information and organization memberships.
 * Supports both wallet (EOA) and passkey authentication.
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  VStack,
  HStack,
  Text,
  Heading,
  Button,
  IconButton,
  Badge,
  Card,
  CardBody,
  Grid,
  GridItem,
  Divider,
  useToast,
  useColorModeValue,
  Skeleton,
  SkeletonText,
  Icon,
  Tooltip,
  useDisclosure,
} from '@chakra-ui/react';
import { SettingsIcon, CopyIcon, CheckIcon, ExternalLinkIcon } from '@chakra-ui/icons';
import { useRouter } from 'next/router';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAuth } from '@/context/AuthContext';
import { useGlobalAccount } from '@/hooks/useGlobalAccount';
import { getAllSubgraphUrls } from '@/config/networks';
import { formatTokenAmount } from '@/util/formatToken';
import GlobalAccountSettingsModal from '@/components/account/GlobalAccountSettingsModal';
import PasskeyAccountInfo from '@/components/passkey/PasskeyAccountInfo';
import SignInModal from '@/components/passkey/SignInModal';
import Link from 'next/link';

const AccountPage = () => {
  const router = useRouter();
  const toast = useToast();
  const { isConnected } = useAccount();
  const { isAuthenticated, isPasskeyUser, accountAddress } = useAuth();
  const { globalUsername, hasAccount, isLoading: isAccountLoading } = useGlobalAccount();
  const { isOpen: isSignInOpen, onOpen: onSignInOpen, onClose: onSignInClose } = useDisclosure();

  const [isSSR, setIsSSR] = useState(true);
  const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [organizations, setOrganizations] = useState([]);
  const [orgsLoading, setOrgsLoading] = useState(true);

  // Fetch user's organizations across all chains via parallel fetch
  useEffect(() => {
    if (!accountAddress || !hasAccount) {
      setOrgsLoading(false);
      return;
    }
    let cancelled = false;
    setOrgsLoading(true);

    async function fetchOrgs() {
      const sources = getAllSubgraphUrls();
      const query = `
        query FetchUserOrgs($userAddress: Bytes!) {
          users(where: { address: $userAddress, membershipStatus: Active }) {
            id
            membershipStatus
            participationTokenBalance
            totalTasksCompleted
            totalVotes
            organization {
              id
              name
              metadataHash
              participationToken { symbol }
            }
          }
        }
      `;
      const results = await Promise.all(sources.map(async (source) => {
        try {
          const res = await fetch(source.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables: { userAddress: accountAddress.toLowerCase() } }),
          });
          const json = await res.json();
          return json?.data?.users || [];
        } catch {
          return [];
        }
      }));
      if (!cancelled) {
        setOrganizations(results.flat());
        setOrgsLoading(false);
      }
    }

    fetchOrgs();
    return () => { cancelled = true; };
  }, [accountAddress, hasAccount]);

  // Colors
  const bgGradient = useColorModeValue(
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)'
  );
  const cardBg = useColorModeValue('rgba(255, 255, 255, 0.95)', 'rgba(0, 0, 0, 0.73)');
  const cardBgOrg = useColorModeValue('white', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'white');
  const subtextColor = useColorModeValue('gray.600', 'gray.400');

  // Glass effect style
  const glassStyle = {
    backgroundColor: cardBg,
  };

  // Handle SSR
  useEffect(() => {
    setIsSSR(false);
  }, []);

  // Copy address to clipboard
  const handleCopyAddress = () => {
    if (accountAddress) {
      navigator.clipboard.writeText(accountAddress);
      setCopiedAddress(true);
      toast({
        title: 'Address copied!',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  // Format address for display
  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // Redirect if authenticated but no account registered
  useEffect(() => {
    if (!isSSR && !isAccountLoading && isAuthenticated && !hasAccount) {
      router.push('/');
    }
  }, [isSSR, isAccountLoading, isAuthenticated, hasAccount, router]);

  if (isSSR) {
    return null;
  }

  // Not authenticated state
  if (!isAuthenticated) {
    return (
      <Box
        minH="100vh"
        bgGradient={bgGradient}
        display="flex"
        alignItems="center"
        justifyContent="center"
        p={4}
      >
        <Card
          maxW="400px"
          w="100%"
          borderRadius="2xl"
          boxShadow="2xl"
          style={glassStyle}
        >
          <CardBody p={8}>
            <VStack spacing={6} align="center">
              <Heading size="lg" color={textColor}>
                Sign In
              </Heading>
              <Text color={subtextColor} textAlign="center">
                Sign in to view your account and organizations.
              </Text>
              <Button
                onClick={onSignInOpen}
                bg="amethyst.500"
                color="white"
                borderRadius="xl"
                size="lg"
                fontWeight="600"
                _hover={{ bg: 'amethyst.600', transform: 'translateY(-1px)', boxShadow: 'md' }}
                _active={{ bg: 'amethyst.700', transform: 'translateY(0)' }}
              >
                Sign In
              </Button>
            </VStack>
          </CardBody>
        </Card>

        <SignInModal
          isOpen={isSignInOpen}
          onClose={onSignInClose}
          onSuccess={() => {}}
        />
      </Box>
    );
  }

  // Loading state
  if (isAccountLoading) {
    return (
      <Box minH="100vh" bgGradient={bgGradient} p={4}>
        <Container maxW="container.lg" pt={8}>
          <VStack spacing={6}>
            <Skeleton height="200px" width="100%" borderRadius="2xl" />
            <Skeleton height="300px" width="100%" borderRadius="2xl" />
          </VStack>
        </Container>
      </Box>
    );
  }

  return (
    <Box minH="100vh" bgGradient={bgGradient} pb={8}>
      <Container maxW="container.lg" pt={8}>
        {/* Header with back button */}
        <HStack justify="space-between" mb={6}>
          <Button
            variant="ghost"
            color="white"
            onClick={() => router.push('/')}
            _hover={{ bg: 'whiteAlpha.200' }}
          >
            Back to Home
          </Button>
          {isPasskeyUser ? (
            <PasskeyAccountInfo />
          ) : (
            <ConnectButton showBalance={false} chainStatus="icon" />
          )}
        </HStack>

        <VStack spacing={6} align="stretch">
          {/* Account Info Card */}
          <Card borderRadius="2xl" boxShadow="2xl" style={glassStyle}>
            <CardBody p={[4, 6, 8]}>
              <VStack spacing={4} align="stretch">
                <HStack justify="space-between" align="start">
                  <VStack align="start" spacing={1}>
                    <Text color={subtextColor} fontSize="sm" fontWeight="medium">
                      Username
                    </Text>
                    <Heading size="xl" color={textColor}>
                      {globalUsername || 'Loading...'}
                    </Heading>
                  </VStack>
                  <IconButton
                    icon={<SettingsIcon />}
                    aria-label="Account Settings"
                    onClick={() => setSettingsModalOpen(true)}
                    variant="ghost"
                    colorScheme="gray"
                    size="lg"
                  />
                </HStack>

                <Divider />

                <HStack justify="space-between" flexWrap="wrap" gap={4}>
                  <VStack align="start" spacing={1}>
                    <Text color={subtextColor} fontSize="sm">
                      {isPasskeyUser ? 'Account Address' : 'Wallet Address'}
                    </Text>
                    <HStack>
                      <Text color={textColor} fontFamily="mono" fontSize="md">
                        {formatAddress(accountAddress)}
                      </Text>
                      <Tooltip label={copiedAddress ? 'Copied!' : 'Copy address'}>
                        <IconButton
                          icon={copiedAddress ? <CheckIcon /> : <CopyIcon />}
                          aria-label="Copy address"
                          size="sm"
                          variant="ghost"
                          onClick={handleCopyAddress}
                          colorScheme={copiedAddress ? 'green' : 'gray'}
                        />
                      </Tooltip>
                    </HStack>
                  </VStack>

                  <VStack align={["start", "end"]} spacing={1}>
                    <Text color={subtextColor} fontSize="sm">
                      Organizations
                    </Text>
                    <Badge colorScheme="purple" fontSize="lg" px={3} py={1} borderRadius="full">
                      {organizations.length}
                    </Badge>
                  </VStack>
                </HStack>
              </VStack>
            </CardBody>
          </Card>

          {/* Organizations Section */}
          <Card borderRadius="2xl" boxShadow="2xl" style={glassStyle}>
            <CardBody p={[4, 6, 8]}>
              <VStack spacing={6} align="stretch">
                <Heading size="md" color={textColor}>
                  My Organizations
                </Heading>

                {orgsLoading ? (
                  <VStack spacing={4}>
                    <SkeletonText noOfLines={3} spacing={4} width="100%" />
                    <SkeletonText noOfLines={3} spacing={4} width="100%" />
                  </VStack>
                ) : organizations.length === 0 ? (
                  <VStack spacing={4} py={8}>
                    <Text color={subtextColor} textAlign="center">
                      You haven't joined any organizations yet.
                    </Text>
                    <Button
                      colorScheme="purple"
                      onClick={() => router.push('/explore')}
                      rightIcon={<ExternalLinkIcon />}
                    >
                      Browse Organizations
                    </Button>
                  </VStack>
                ) : (
                  <Grid
                    templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }}
                    gap={4}
                  >
                    {organizations.map((userOrg) => (
                      <GridItem key={userOrg.id}>
                        <Link href={`/home?org=${userOrg.organization?.name}`} passHref>
                          <Card
                            variant="outline"
                            borderRadius="xl"
                            cursor="pointer"
                            transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
                            _hover={{
                              transform: 'translateY(-2px)',
                              boxShadow: 'lg',
                              borderColor: 'purple.400',
                            }}
                            bg={cardBgOrg}
                          >
                            <CardBody p={4}>
                              <VStack align="stretch" spacing={3}>
                                <HStack justify="space-between">
                                  <Text
                                    fontWeight="bold"
                                    fontSize="lg"
                                    color={textColor}
                                    noOfLines={1}
                                  >
                                    {userOrg.organization?.name || 'Unknown'}
                                  </Text>
                                  <Badge colorScheme="green">
                                    {userOrg.membershipStatus}
                                  </Badge>
                                </HStack>

                                <Grid templateColumns="repeat(2, 1fr)" gap={2}>
                                  <VStack align="start" spacing={0}>
                                    <Text color={subtextColor} fontSize="xs">
                                      Shares Earned
                                    </Text>
                                    <Text color={textColor} fontWeight="medium">
                                      {formatTokenAmount(userOrg.participationTokenBalance)}{' '}
                                      {userOrg.organization?.participationToken?.symbol || 'shares'}
                                    </Text>
                                  </VStack>

                                  <VStack align="start" spacing={0}>
                                    <Text color={subtextColor} fontSize="xs">
                                      Tasks Completed
                                    </Text>
                                    <Text color={textColor} fontWeight="medium">
                                      {userOrg.totalTasksCompleted || 0}
                                    </Text>
                                  </VStack>

                                  <VStack align="start" spacing={0}>
                                    <Text color={subtextColor} fontSize="xs">
                                      Votes Cast
                                    </Text>
                                    <Text color={textColor} fontWeight="medium">
                                      {userOrg.totalVotes || 0}
                                    </Text>
                                  </VStack>
                                </Grid>
                              </VStack>
                            </CardBody>
                          </Card>
                        </Link>
                      </GridItem>
                    ))}
                  </Grid>
                )}
              </VStack>
            </CardBody>
          </Card>
        </VStack>
      </Container>

      {/* Account Settings Modal */}
      <GlobalAccountSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
      />
    </Box>
  );
};

export default AccountPage;
