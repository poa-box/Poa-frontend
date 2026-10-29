import AccountLoadingState from '@/components/common/AccountLoadingState';
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
import { useAuth } from '@/context/authState';
import { useGlobalAccount } from '@/hooks/useGlobalAccount';
import { useProfileMemberships, usePreservedProfileMetadata, knownNativeBalance } from '@/features/application/pages/publicProfileReads';
import { filterUserOrgsForViewedProfile } from '@/util/profileOrgFilter';
import UserOrgCard from '@/components/profile/UserOrgCard';
import GlobalAccountSettingsModal from '@/components/account/GlobalAccountSettingsModal';
import ProfileEditor from '@/components/account/ProfileEditor';
import TokenBalances from '@/components/account/TokenBalances';
import TransferModal from '@/components/account/TransferModal';
import CashOutModal from '@/components/account/CashOutModal';
import PendingCashouts from '@/components/account/PendingCashouts';
import { useTokenBalances } from '@/hooks/useTokenBalances';
import SignInModal from '@/components/passkey/SignInModal';
import AccountControl from '@/components/common/AccountControl';
import Link from 'next/link';

const AccountPage = () => {
  const router = useRouter();
  const toast = useToast();
  const { isAuthenticated, isPasskeyUser, accountAddress, isAuthHydrated } = useAuth();
  const { globalUsername, hasAccount, isUnavailable: accountUnavailable, isLoading: isAccountLoading, profileMetadata, refetchAccount } = useGlobalAccount();
  const displayedProfileMetadata = usePreservedProfileMetadata(accountAddress, profileMetadata, accountUnavailable);
  const { isOpen: isSignInOpen, onOpen: onSignInOpen, onClose: onSignInClose } = useDisclosure();

  const [isSSR, setIsSSR] = useState(true);
  const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [selectedTransferToken, setSelectedTransferToken] = useState(null);
  const { isOpen: isTransferOpen, onOpen: onTransferOpen, onClose: onTransferClose } = useDisclosure();
  const [selectedCashOutToken, setSelectedCashOutToken] = useState(null);
  const { isOpen: isCashOutOpen, onOpen: onCashOutOpen, onClose: onCashOutClose } = useDisclosure();
  const resolvedAccount = isAuthenticated && isAuthHydrated !== false && hasAccount === true ? accountAddress : null;
  const { balances, nativeBalances, errors: balanceErrors = [], coverage: balanceCoverage, isLoading: balancesLoading, refetch: refetchBalances } = useTokenBalances(resolvedAccount);
  const { organizations, isLoading: orgsLoading, isComplete: orgsComplete, isUnavailable: orgsUnavailable, refetch: refetchOrgs } = useProfileMemberships(resolvedAccount);
  // Modal selections are scoped to the account and refreshed balance list.
  const currentSelection = selected => selected && selected._account === resolvedAccount
    ? balances.find(token => token.address === selected.address && token.chainId === selected.chainId) : null;
  const transferToken = currentSelection(selectedTransferToken);
  const cashOutToken = currentSelection(selectedCashOutToken);
  const canOpenAssetAction = token => {
    if (!resolvedAccount || balancesLoading || knownNativeBalance(nativeBalances, token.chainId) === null) {
      toast({ title: 'Network balance unavailable', description: 'Refresh balances before continuing.', status: 'info' });
      return false;
    }
    return true;
  };

  const visibleOrganizations = filterUserOrgsForViewedProfile(organizations, globalUsername);

  // Colors
  const bgGradient = useColorModeValue(
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)'
  );
  const cardBg = useColorModeValue('rgba(255, 255, 255, 0.95)', 'rgba(0, 0, 0, 0.73)');
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
    if (!isSSR && isAuthHydrated !== false && !isAccountLoading && isAuthenticated && hasAccount === false && !accountUnavailable) {
      router.push('/');
    }
  }, [isSSR, isAuthHydrated, isAccountLoading, isAuthenticated, hasAccount, accountUnavailable, router]);


  if (isSSR) {
    return null;
  }

  // Loading state
  if (isAuthHydrated === false || (isAuthenticated && isAccountLoading && hasAccount !== true)) {
    return (
      <><Box minH="100vh" bgGradient={bgGradient} p={4}>
        <Container maxW="container.lg" pt={8}>
          <VStack spacing={6}>
            {isAuthHydrated === false ? <AccountLoadingState /> : (
              <>
                <Skeleton height="200px" width="100%" borderRadius="2xl" />
                <Skeleton height="300px" width="100%" borderRadius="2xl" />
              </>
            )}
          </VStack>
        </Container>
      </Box></>
    );
  }


  // Not authenticated state
  if (!isAuthenticated) {
    return (
      <><Box
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
      </Box></>
    );
  }

  if (hasAccount !== true) {
    return <Box minH="100vh" bgGradient={bgGradient} p={8}><Card><CardBody>
      <Text role="status">{hasAccount === false && !accountUnavailable ? 'Opening account setup…' : 'Your account details are unavailable right now.'}</Text>
      <Button onClick={refetchAccount}>Try again</Button>
    </CardBody></Card></Box>;
  }

  return (
    <>
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
          <AccountControl />
        </HStack>

        <VStack spacing={6} align="stretch">
          {accountUnavailable && <HStack><Text role="status" color="white">Some account details are unavailable.</Text><Button onClick={refetchAccount}>Try again</Button></HStack>}
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
                    isDisabled={accountUnavailable}
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
                      {orgsComplete ? visibleOrganizations.length : 'Unavailable'}
                    </Badge>
                  </VStack>
                </HStack>
              </VStack>
            </CardBody>
          </Card>

          {/* Profile Section */}
          <Card borderRadius="2xl" boxShadow="2xl" style={glassStyle}>
            <CardBody p={[4, 6, 8]}>
              <VStack spacing={4} align="stretch">
                <Heading size="md" color={textColor}>
                  Profile
                </Heading>
                <Text color={subtextColor} fontSize="sm">
                  Your profile is visible across all organizations.
                </Text>
                <Box as="fieldset" disabled={accountUnavailable} border="0" p={0} minW={0}>
                  <ProfileEditor
                    currentMetadata={displayedProfileMetadata}
                    onSuccess={() => refetchAccount()}
                  />
                </Box>
              </VStack>
            </CardBody>
          </Card>

          {/* Token Balances Section */}
          <TokenBalances
            balances={balances}
            nativeBalances={nativeBalances}
            errors={balanceErrors}
            coverage={balanceCoverage}
            onRetry={() => refetchBalances()}
            isLoading={balancesLoading}
            onSend={(token) => {
              if (!canOpenAssetAction(token)) return;
              setSelectedTransferToken({ ...token, _account: resolvedAccount });
              onTransferOpen();
            }}
            onCashOut={(token) => {
              if (!canOpenAssetAction(token)) return;
              setSelectedCashOutToken({ ...token, _account: resolvedAccount });
              onCashOutOpen();
            }}
            cardStyle={glassStyle}
            textColor={textColor}
            subtextColor={subtextColor}
          />

          {/* Pending Cashouts Section — only renders when the user has unfilled cashout deposits on EscrowV2/Base */}
          <PendingCashouts
            accountAddress={accountAddress}
            cardStyle={glassStyle}
            textColor={textColor}
            subtextColor={subtextColor}
            onWithdrawSuccess={refetchBalances}
          />

          {/* Organizations Section */}
          <Card borderRadius="2xl" boxShadow="2xl" style={glassStyle}>
            <CardBody p={[4, 6, 8]}>
              <VStack spacing={6} align="stretch">
                <Heading size="md" color={textColor}>
                  My Organizations
                </Heading>

                {orgsUnavailable && <HStack><Text role="status" color={subtextColor}>Some organizations are unavailable.</Text><Button onClick={refetchOrgs}>Try again</Button></HStack>}
                {orgsLoading && visibleOrganizations.length === 0 ? (
                  <VStack spacing={4}>
                    <SkeletonText noOfLines={3} spacing={4} width="100%" />
                    <SkeletonText noOfLines={3} spacing={4} width="100%" />
                  </VStack>
                ) : visibleOrganizations.length === 0 && orgsComplete ? (
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
                    {visibleOrganizations.map((userOrg) => (
                      <Link
                        key={userOrg.id}
                        href={`/home?org=${encodeURIComponent(userOrg.organization?.name || '')}`}
                        style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
                      >
                        <UserOrgCard userOrg={userOrg} />
                      </Link>
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
        isOpen={isSettingsModalOpen && !accountUnavailable}
        onClose={() => setSettingsModalOpen(false)}
      />

      {/* Transfer Modal */}
      <TransferModal
        isOpen={isTransferOpen && !!transferToken && knownNativeBalance(nativeBalances, transferToken.chainId) !== null}
        onClose={onTransferClose}
        token={transferToken}
        accountAddress={accountAddress}
        nativeBalance={transferToken ? knownNativeBalance(nativeBalances, transferToken.chainId) : null}
        onSuccess={refetchBalances}
      />

      {/* Cash Out Modal */}
      <CashOutModal
        isOpen={isCashOutOpen && !!cashOutToken && knownNativeBalance(nativeBalances, cashOutToken.chainId) !== null}
        onClose={onCashOutClose}
        token={cashOutToken}
        nativeBalance={cashOutToken ? knownNativeBalance(nativeBalances, cashOutToken.chainId) : null}
        errors={balanceErrors}
        coverage={balanceCoverage}
        accountAddress={accountAddress}
        onSuccess={refetchBalances}
      />
    </Box>
    </>
  );
};

export default AccountPage;
