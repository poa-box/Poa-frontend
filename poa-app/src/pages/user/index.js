import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useWeb3, useOrgStructure, useClaimRole, useVouches, useVouchFirstOnboarding } from "@/hooks";
import { usePOContext } from "@/context/POContext";
import { useUserContext } from "@/context/UserContext";
import { findUsernameAcrossChains } from "@/util/crossChainUsername";
import { useRouter } from 'next/router';
import {
  VStack,
  Text,
  Button,
  Input,
  Box,
  Flex,
  Heading,
  Container,
  Image,
  useColorModeValue,
  keyframes,
  Icon,
  Stack,
  useBreakpointValue,
  InputGroup,
  InputRightElement,
  Divider,
  Center,
  Badge,
  HStack,
  Grid,
  GridItem,
  Avatar,
  ScaleFade,
  Fade,
  SlideFade,
  Card,
  CardBody,
  useToast,
  Spinner,
  IconButton,
  Alert,
  AlertIcon,
  useDisclosure,
} from "@chakra-ui/react";
import Navbar from "@/templateComponents/studentOrgDAO/NavBar";
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { useAuth } from '@/context/AuthContext';

import { FaWallet, FaUserPlus, FaUser, FaCheck, FaChevronRight, FaLink, FaInfoCircle, FaShieldAlt, FaRegLightbulb, FaUsers, FaFingerprint, FaPaperPlane, FaCopy, FaHandshake, FaRedo } from 'react-icons/fa';
import PasskeyLoginButton from '@/components/passkey/PasskeyLoginButton';
import PasskeyOnboardingModal from '@/components/passkey/PasskeyOnboardingModal';
import SignInModal from '@/components/passkey/SignInModal';
import { BsFillLightningChargeFill } from 'react-icons/bs';
import { RoleApplicationForm, VouchLinkHandler, VouchProgressBar } from '@/components/orgStructure';
import { VouchFirstPhase } from '@/hooks/useVouchFirstOnboarding';
import { getAllCredentials } from '@/services/web3/passkey/passkeyStorage';

// Subtle pulse animation for CTA buttons when form is ready
const pulse = keyframes`
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
`;

const User = () => {
  const { hasMemberRole, graphUsername, optimisticJoin } = useUserContext();
  const { address } = useAccount();
  const { isAuthenticated, isPasskeyUser, accountAddress } = useAuth();
  const { quickJoinContractAddress, poDescription, logoHash } = usePOContext();
  const { organization, executeWithNotification, signer } = useWeb3();
  const router = useRouter();
  const { userDAO, vouch: vouchAddress, hatId: vouchHatId } = router.query;
  const usernameInputRef = useRef(null);
  const toast = useToast();

  // Org structure for vouch detection
  const { roles, eligibilityModuleAddress, loading: orgStructureLoading } = useOrgStructure();
  const { applyForRole, isApplying, vouchFor, isVouching } = useClaimRole(eligibilityModuleAddress);

  // Vouch data (for vouch link handler and vouch-first progress)
  const rolesWithVouching = useMemo(() => {
    return (roles || []).filter(r => r.vouchingEnabled);
  }, [roles]);
  const { hasUserVouched, getVouchProgress, refetch: refetchVouches } = useVouches(eligibilityModuleAddress, rolesWithVouching);

  const hasVouchGatedRoles = useMemo(() => {
    if (!roles || roles.length === 0) return false;
    return roles.some(r => r.vouchingEnabled);
  }, [roles]);

  // Cross-chain username: check if user already has a username on any chain
  const [crossChainUsername, setCrossChainUsername] = useState(null);
  useEffect(() => {
    const addr = accountAddress || address;
    if (!addr) return;
    findUsernameAcrossChains(addr).then(({ username }) => {
      if (username) setCrossChainUsername(username);
    }).catch(() => {});
  }, [accountAddress, address]);

  const [newUsername, setNewUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [dispaly, setDispaly] = useState(true);
  const [isSSR, setIsSSR] = useState(true);
  const [showBenefits, setShowBenefits] = useState(false);
  const [animateForm, setAnimateForm] = useState(false);

  // Modal state for create account / sign in
  const { isOpen: isCreateOpen, onOpen: onCreateOpen, onClose: onCreateClose } = useDisclosure();
  const { isOpen: isSignInOpen, onOpen: onSignInOpen, onClose: onSignInClose } = useDisclosure();

  // Role application state (for vouch-gated orgs)
  const [selectedHatId, setSelectedHatId] = useState(null);
  const [applicationNotes, setApplicationNotes] = useState('');

  // Tracks when authenticated user has submitted application and is waiting for vouches.
  // Persisted to sessionStorage so a page refresh doesn't lose the vouch link.
  const [pendingVouchApplication, setPendingVouchApplication] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = sessionStorage.getItem(`pendingVouchApp:${userDAO}`);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  // Vouch-first passkey onboarding hook
  const vouchFirstHook = useVouchFirstOnboarding({
    orgName: userDAO,
    refetchVouches,
    eligibilityModuleAddress,
    existingUsername: crossChainUsername,
  });

  // Compute vouch progress for the pending credential (if any)
  const vouchFirstPendingProgress = useMemo(() => {
    if (!vouchFirstHook.pendingCredential) return null;
    return getVouchProgress(
      vouchFirstHook.pendingCredential.accountAddress,
      vouchFirstHook.pendingCredential.selectedHatId,
    );
  }, [vouchFirstHook.pendingCredential, getVouchProgress]);

  // Vouch link progress (for existing members viewing a vouch link)
  const vouchLinkProgress = useMemo(() => {
    if (!vouchAddress || !vouchHatId) return null;
    return getVouchProgress(vouchAddress, vouchHatId);
  }, [vouchAddress, vouchHatId, getVouchProgress]);

  const hasAlreadyVouched = useMemo(() => {
    if (!vouchAddress || !vouchHatId) return false;
    return hasUserVouched(vouchAddress, vouchHatId);
  }, [vouchAddress, vouchHatId, hasUserVouched]);

  // Check if the authenticated user has completed vouches for any role
  const authenticatedUserVouchProgress = useMemo(() => {
    if (!isAuthenticated || !accountAddress || !hasVouchGatedRoles || hasMemberRole) return null;
    for (const role of rolesWithVouching) {
      const progress = getVouchProgress(accountAddress, role.hatId);
      if (progress && progress.isComplete && progress.quorum > 0) {
        return { ...progress, hatId: role.hatId, roleName: role.name };
      }
    }
    return null;
  }, [isAuthenticated, accountAddress, hasVouchGatedRoles, hasMemberRole, rolesWithVouching, getVouchProgress]);

  // Track vouch progress for a pending application (applied but not yet vouched enough)
  const pendingApplicationProgress = useMemo(() => {
    if (!pendingVouchApplication || !accountAddress) return null;
    return getVouchProgress(accountAddress, pendingVouchApplication.hatId);
  }, [pendingVouchApplication, accountAddress, getVouchProgress]);

  const isMobile = useBreakpointValue({ base: true, md: false });
  const textSize = useBreakpointValue({ base: "xl", md: "2xl" });
  const headingSize = useBreakpointValue({ base: "3xl", md: "4xl" });
  const benefitIconSize = useBreakpointValue({ base: 5, md: 6 });
  const buttonHeight = useBreakpointValue({ base: "54px", md: "60px" });
  const cardPadding = useBreakpointValue({ base: 4, md: 8 });
  const mainSpacing = useBreakpointValue({ base: 4, md: 6 });
  const formSpacing = useBreakpointValue({ base: 4, md: 6 });

  // Rich gradient background — deeper tones that complement the teal/green palette
  const bgGradient = useColorModeValue(
    'linear-gradient(135deg, #c7ddd5 0%, #c4d4e4 40%, #d5cde6 70%, #c7ddd5 100%)',
    'linear-gradient(135deg, #1a1625 0%, #1e2030 50%, #2a273f 100%)'
  );

  const cardBg = useColorModeValue('rgba(255, 255, 255, 0.8)', 'rgba(0, 0, 0, 0.6)');
  const textColor = useColorModeValue('gray.800', 'white');
  const accentColor = "teal.400";
  const inputBg = useColorModeValue('white', 'gray.800');
  const inputBorderColor = useColorModeValue('gray.300', 'gray.600');
  const subtextColor = useColorModeValue('gray.600', 'gray.300');
  const hintColor = useColorModeValue('gray.500', 'gray.400');
  const footerColor = useColorModeValue('gray.600', 'gray.400');
  const successBg = useColorModeValue('green.50', 'green.900');
  const successBorderColor = useColorModeValue('green.200', 'green.700');
  const infoBg = useColorModeValue('blue.50', 'blue.900');
  const infoBorderColor = useColorModeValue('blue.200', 'blue.700');
  const infoTextColor = useColorModeValue('blue.700', 'blue.300');

  useEffect(() => {
    setIsSSR(false);
    setTimeout(() => {
      setAnimateForm(true);
    }, 100);
  }, [userDAO]);

  useEffect(() => {
    // Don't redirect members when they're here to vouch for someone
    if (hasMemberRole && !vouchAddress) {
      router.push(`/profileHub/?userDAO=${userDAO}`);
    }
  }, [hasMemberRole, address, vouchAddress]);

  // Redirect on vouch-first success — optimistically update UserContext and redirect
  // immediately. The subgraph data will replace the optimistic data on the next refetch.
  useEffect(() => {
    if (vouchFirstHook.phase !== VouchFirstPhase.SUCCESS) return;

    const addr = accountAddress || address;
    const hatId = vouchFirstHook.vouchedHatId;
    const username = vouchFirstHook.existingUsername || vouchFirstHook.registeredUsername || graphUsername || '';

    // Optimistically mark the user as a member so profileHub renders correctly
    optimisticJoin({
      address: addr,
      hatIds: hatId ? [hatId] : [],
      username,
    });

    router.push(`/profileHub/?userDAO=${userDAO}`);
  }, [vouchFirstHook.phase]);

  // Sync pendingVouchApplication to sessionStorage
  useEffect(() => {
    if (!userDAO) return;
    try {
      if (pendingVouchApplication) {
        sessionStorage.setItem(`pendingVouchApp:${userDAO}`, JSON.stringify(pendingVouchApplication));
      } else {
        sessionStorage.removeItem(`pendingVouchApp:${userDAO}`);
      }
    } catch { /* SSR or storage full */ }
  }, [pendingVouchApplication, userDAO]);

  // Poll for vouches while authenticated user has a pending application (pause during join)
  useEffect(() => {
    if (pendingVouchApplication && refetchVouches && !loading) {
      const interval = setInterval(() => {
        refetchVouches();
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [pendingVouchApplication, refetchVouches, loading]);

  // Auto-select when there's only one role
  useEffect(() => {
    if (hasVouchGatedRoles && rolesWithVouching.length === 1) {
      setSelectedHatId(rolesWithVouching[0].hatId);
    }
  }, [hasVouchGatedRoles, rolesWithVouching]);

  // Auto-select the hat that has completed vouches (for sign-in + complete flow)
  useEffect(() => {
    if (authenticatedUserVouchProgress?.hatId && !selectedHatId) {
      setSelectedHatId(authenticatedUserVouchProgress.hatId);
    }
  }, [authenticatedUserVouchProgress, selectedHatId]);

  const handleJoinWithUser = useCallback(async () => {
    if (!organization) return;

    setLoading(true);

    // Determine the hat to claim from vouch progress
    const vouchedHatId = authenticatedUserVouchProgress?.hatId
      || (pendingApplicationProgress?.isComplete ? pendingVouchApplication?.hatId : null)
      || null;

    let joinFn;
    if (vouchedHatId) {
      // Vouched flow: claim specific hat(s) via claimHatsWithUser
      const claimHatIds = [BigInt(vouchedHatId)];
      console.log('[Join] Vouched flow: claiming hat', vouchedHatId);
      joinFn = () => organization.claimHatsWithUser(quickJoinContractAddress, claimHatIds);
    } else {
      // Standard flow: quickJoinWithUser (mints memberHatIds)
      joinFn = () => organization.quickJoinWithUser(quickJoinContractAddress);
    }

    const result = await executeWithNotification(
      joinFn,
      {
        pendingMessage: 'Joining organization...',
        successMessage: 'Successfully joined! Redirecting...',
        refreshEvent: 'member:joined',
      }
    );

    if (result.success) {
      setPendingVouchApplication(null);
      router.push(`/profileHub/?userDAO=${userDAO}`);
    }
    setLoading(false);
  }, [organization, executeWithNotification, quickJoinContractAddress, router, userDAO, authenticatedUserVouchProgress, pendingApplicationProgress, pendingVouchApplication]);

  const handleJoinNewUser = useCallback(async () => {
    if (!organization) return;

    if (!newUsername.trim()) {
      usernameInputRef.current.focus();
      toast({
        title: "Username required",
        description: "Please enter a username to continue",
        status: "warning",
        duration: 3000,
        isClosable: true,
        position: "top",
      });
      return;
    }

    setLoading(true);

    // Determine the hat to claim from vouch progress
    const vouchedHatId = authenticatedUserVouchProgress?.hatId
      || (pendingApplicationProgress?.isComplete ? pendingVouchApplication?.hatId : null)
      || null;

    let joinFn;
    if (isPasskeyUser) {
      // Passkey: get credential
      const credential = accountAddress ? getAllCredentials()[accountAddress.toLowerCase()] : null;
      if (!credential) {
        toast({
          title: "Credential not found",
          description: "Could not find your passkey credential. Please sign in again.",
          status: "error",
          duration: 5000,
          isClosable: true,
          position: "top",
        });
        setLoading(false);
        return;
      }

      if (vouchedHatId) {
        // Vouched passkey: registerAndClaimHatsWithPasskey (register + claim specific hat)
        const claimHatIds = [BigInt(vouchedHatId)];
        console.log('[Join] Vouched passkey: register + claim hat', vouchedHatId);
        joinFn = () => organization.registerAndClaimHatsNewUser(quickJoinContractAddress, newUsername, credential, claimHatIds);
      } else {
        // Standard passkey: registerAndQuickJoinWithPasskey (register + mint memberHatIds)
        joinFn = () => organization.registerAndJoinNewUser(quickJoinContractAddress, newUsername, credential);
      }
    } else {
      // EOA path
      if (!signer) {
        toast({
          title: "Wallet not connected",
          description: "Please connect your wallet to continue.",
          status: "error",
          duration: 5000,
          isClosable: true,
          position: "top",
        });
        setLoading(false);
        return;
      }

      if (vouchedHatId) {
        // Vouched EOA: registerAndClaimHats (register + claim specific hat)
        const claimHatIds = [BigInt(vouchedHatId)];
        console.log('[Join] Vouched EOA: register + claim hat', vouchedHatId);
        joinFn = () => organization.registerAndClaimHatsEOA(quickJoinContractAddress, newUsername, claimHatIds, signer);
      } else {
        // Standard EOA: registerAndQuickJoin (register + mint memberHatIds)
        joinFn = () => organization.registerAndJoinEOA(quickJoinContractAddress, newUsername, signer);
      }
    }

    const result = await executeWithNotification(
      joinFn,
      {
        pendingMessage: 'Registering username and joining organization...',
        successMessage: 'Account created! Redirecting...',
        refreshEvent: 'user:created',
      }
    );

    if (result.success) {
      setPendingVouchApplication(null);
      router.push(`/profileHub/?userDAO=${userDAO}`);
    }
    setLoading(false);
  }, [organization, executeWithNotification, quickJoinContractAddress, newUsername, router, userDAO, toast, accountAddress, isPasskeyUser, signer, authenticatedUserVouchProgress, pendingApplicationProgress, pendingVouchApplication]);

  const handleApplyAndJoin = useCallback(async () => {
    if (!selectedHatId) {
      toast({
        title: "Role required",
        description: "Please select a role to apply for",
        status: "warning",
        duration: 3000,
        isClosable: true,
        position: "top",
      });
      return;
    }

    if (!applicationNotes.trim()) {
      toast({
        title: "Application notes required",
        description: "Please explain why you want this role",
        status: "warning",
        duration: 3000,
        isClosable: true,
        position: "top",
      });
      return;
    }

    setLoading(true);
    try {
      // For vouch-gated orgs: apply first, join later (after quorum met).
      // applyForRole() does not require membership — it just records the application on-chain.
      const applyResult = await applyForRole(selectedHatId, {
        notes: applicationNotes.trim(),
        appliedAt: new Date().toISOString(),
      });

      if (!applyResult?.success) {
        toast({
          title: "Application failed",
          description: "Could not submit your application. Please try again.",
          status: "error",
          duration: 5000,
          isClosable: true,
          position: "top",
        });
        return;
      }

      // Generate vouch link for the user to share with existing members
      const userAddr = accountAddress || address;
      const vouchLink = `${window.location.origin}/user?userDAO=${userDAO}&vouch=${userAddr}&hatId=${selectedHatId}`;

      // Copy to clipboard
      try {
        await navigator.clipboard.writeText(vouchLink);
        toast({
          title: "Application submitted!",
          description: "Vouch link copied to clipboard. Share it with existing members.",
          status: "success",
          duration: 5000,
          isClosable: true,
          position: "top",
        });
      } catch {
        toast({
          title: "Application submitted!",
          description: "Share the vouch link below with existing members.",
          status: "success",
          duration: 5000,
          isClosable: true,
          position: "top",
        });
      }

      // Transition to "waiting for vouches" UI
      const roleName = rolesWithVouching.find(r => r.hatId === selectedHatId)?.name || 'role';
      setPendingVouchApplication({ hatId: selectedHatId, vouchLink, roleName });
    } finally {
      setLoading(false);
    }
  }, [
    selectedHatId, applicationNotes,
    applyForRole, toast, accountAddress, address, userDAO, rolesWithVouching,
  ]);

  const benefits = [
    { 
      icon: FaUsers, 
      title: "Community Access", 
      description: "Become part of an exclusive community with shared goals and values." 
    },
    { 
      icon: FaShieldAlt, 
      title: "Governance Rights", 
      description: "Vote on important proposals and help shape the future of the organization." 
    },
    { 
      icon: BsFillLightningChargeFill, 
      title: "Earn Rewards", 
      description: "Complete tasks and participate in activities to earn tokens and recognition." 
    },
  ];

  if (isSSR) {
    return null;
  }

  return (
    <>
      <Navbar />
      <Box
        position="fixed"
        top="0"
        left="0"
        right="0"
        bottom="0"
        zIndex="-1"
        bgGradient={bgGradient}
        overflow="hidden"
      >
        {/* Soft decorative elements */}
        <Box
          position="absolute"
          top="10%"
          left="5%"
          width="40vh"
          height="40vh"
          borderRadius="full"
          bgGradient="linear(to-r, teal.200, blue.100)"
          filter="blur(90px)"
          opacity="0.35"
        />
        <Box
          position="absolute"
          bottom="10%"
          right="5%"
          width="30vh"
          height="30vh"
          borderRadius="full"
          bgGradient="linear(to-r, purple.200, pink.100)"
          filter="blur(90px)"
          opacity="0.3"
        />
      </Box>

      <Container maxW="container.xl" pt={{ base: 16, md: 8 }} overflowX="hidden">
        {address && !isPasskeyUser ? (
          <Flex justify="flex-end" mb={4}>
            <ConnectButton showBalance={false} chainStatus="icon" />
          </Flex>
        ) : null}

        <Grid 
          templateColumns={{ base: "1fr", lg: "1fr 1fr" }}
          gap={{ base: 4, md: 6 }}
          align="center"
          justify="center"
        >
          {/* Why Join? benefits (secondary, right side) */}
          <GridItem order={{ base: 2, lg: 2 }}>
            <ScaleFade in={true} initialScale={0.95} transition={{ enter: { duration: 0.3 } }}>
              <Card 
                bg={cardBg}
                borderRadius="xl" 
                boxShadow="xl"
                height="100%"
                borderWidth="1px"
                borderColor="rgba(255,255,255,0.1)"
              >
                <CardBody p={cardPadding}>
                  {isAuthenticated && hasMemberRole && vouchAddress && vouchHatId ? (
                    <VStack spacing={mainSpacing} align="flex-start">
                      <Heading
                        as="h1"
                        fontSize={{ base: "2xl", md: headingSize }}
                        color={textColor}
                        bgGradient="linear(to-r, teal.400, blue.500)"
                        bgClip="text"
                      >
                        Vouch for {userDAO}
                      </Heading>

                      <Text color={subtextColor} fontSize={{ base: "sm", md: "md" }}>
                        A prospective member has requested your vouch to join the organization.
                        Your vouch confirms that you trust this person to be a contributing member.
                      </Text>

                      <Divider />

                      <VStack spacing={3} align="stretch" width="100%">
                        <Flex p={{ base: 3, md: 4 }} borderRadius="md" bg={inputBg} boxShadow="md">
                          <Center width={{ base: "40px", md: "50px" }}>
                            <Icon as={FaHandshake} color={accentColor} boxSize={benefitIconSize} />
                          </Center>
                          <Box ml={4} flex="1">
                            <Text fontWeight="bold" fontSize={{ base: "md", md: "lg" }} color={textColor}>
                              How Vouching Works
                            </Text>
                            <Text color={subtextColor} fontSize={{ base: "sm", md: "md" }}>
                              Each role requires a certain number of vouches before the applicant can claim it. Your vouch counts toward that quorum.
                            </Text>
                          </Box>
                        </Flex>
                      </VStack>

                      <Box>
                        <Text color={textColor} fontSize={{ base: "xs", md: "sm" }} fontStyle="italic">
                          Once the required number of vouches is reached, the applicant can complete their onboarding.
                        </Text>
                      </Box>
                    </VStack>
                  ) : (
                    <VStack spacing={mainSpacing} align="flex-start">
                      <HStack spacing={4}>
                        <Icon as={FaRegLightbulb} color="yellow.400" boxSize={benefitIconSize} />
                        <Heading as="h2" fontSize={{ base: "xl", md: "2xl" }} color={textColor}>Why Join?</Heading>
                      </HStack>

                      <VStack spacing={{ base: 3, md: 4 }} align="stretch" width="100%">
                        {benefits.map((benefit, index) => (
                          <SlideFade in={true} delay={0.1 * index} key={index}>
                            <Flex
                              p={{ base: 3, md: 4 }}
                              borderRadius="md"
                              bg={inputBg}
                              boxShadow="md"
                              _hover={{ transform: "translateY(-2px)", boxShadow: "lg" }}
                              transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
                            >
                              <Center width={{ base: "40px", md: "50px" }}>
                                <Icon as={benefit.icon} color={accentColor} boxSize={benefitIconSize} />
                              </Center>
                              <Box ml={4} flex="1">
                                <Text fontWeight="bold" fontSize={{ base: "md", md: "lg" }} color={textColor}>
                                  {benefit.title}
                                </Text>
                                <Text color={subtextColor} fontSize={{ base: "sm", md: "md" }}>
                                  {benefit.description}
                                </Text>
                              </Box>
                            </Flex>
                          </SlideFade>
                        ))}
                      </VStack>

                    </VStack>
                  )}
                </CardBody>
              </Card>
            </ScaleFade>
          </GridItem>

          {/* Join form (primary, left side) */}
          <GridItem order={{ base: 1, lg: 1 }} mb={{ base: 4, lg: 0 }} overflow="hidden">
            <ScaleFade in={animateForm} initialScale={0.95} delay={0.05} transition={{ enter: { duration: 0.3 } }}>
              <Card
                bg={cardBg}
                borderRadius="xl"
                boxShadow="xl"
                borderWidth="1px"
                borderColor="rgba(255,255,255,0.1)"
                overflow="hidden"
              >
                <CardBody p={cardPadding}>
                  {/* ── Branch 1: Member + vouch link → VouchLinkHandler ── */}
                  {isAuthenticated && hasMemberRole && vouchAddress && vouchHatId ? (
                    <VouchLinkHandler
                      vouchAddress={vouchAddress}
                      hatId={vouchHatId}
                      userDAO={userDAO}
                      roles={roles}
                      vouchFor={vouchFor}
                      isVouching={isVouching}
                      hasAlreadyVouched={hasAlreadyVouched}
                      vouchProgress={vouchLinkProgress}
                    />

                  /* ── Branch 2: Pending vouch-first credential → waiting UI ── */
                  ) : vouchFirstHook.pendingCredential && vouchFirstHook.phase !== VouchFirstPhase.SUCCESS ? (
                    <VStack spacing={formSpacing} align="stretch">
                      <Box textAlign="center">
                        <Box display="inline-block" mb={4}>
                          <Icon as={FaHandshake} color={accentColor} boxSize={{ base: 10, md: 12 }} />
                        </Box>
                        <Heading size={{ base: "md", md: "lg" }} mb={2} color={textColor}>
                          Waiting for Vouches
                        </Heading>
                        <Text color={subtextColor} fontSize={{ base: "sm", md: "md" }}>
                          Share the link below with existing members to vouch for you.
                        </Text>
                      </Box>

                      {/* Pending account address badge */}
                      <Box
                        p={3}
                        borderRadius="lg"
                        bg={infoBg}
                        borderWidth="1px"
                        borderColor={infoBorderColor}
                      >
                        <Flex align="center" justify="center" direction="column" gap={1}>
                          <Flex align="center">
                            <Icon as={FaFingerprint} color="blue.500" mr={2} />
                            <Text color={textColor} fontWeight="medium" fontSize="sm" fontFamily="mono">
                              {vouchFirstHook.pendingCredential.accountAddress?.substring(0, 10)}...{vouchFirstHook.pendingCredential.accountAddress?.substring(vouchFirstHook.pendingCredential.accountAddress.length - 6)}
                            </Text>
                          </Flex>
                          <Text color={hintColor} fontSize="xs">
                            Pending account — not yet deployed
                          </Text>
                        </Flex>
                      </Box>

                      {/* Copy vouch link button */}
                      <Button
                        width="100%"
                        size="lg"
                        colorScheme="blue"
                        leftIcon={<FaCopy />}
                        borderRadius="xl"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(vouchFirstHook.vouchLink);
                            toast({ title: "Vouch link copied!", description: "Share it with existing members to vouch for you.", status: "success", duration: 3000, position: "top" });
                          } catch {
                            toast({ title: "Couldn't copy — please copy manually", status: "warning", duration: 3000, position: "top" });
                          }
                        }}
                      >
                        Copy Vouch Link
                      </Button>

                      {/* Vouch progress */}
                      {vouchFirstPendingProgress && (
                        <Box px={2}>
                          <VouchProgressBar
                            current={vouchFirstPendingProgress.current}
                            quorum={vouchFirstPendingProgress.quorum}
                            size="lg"
                          />
                          {!vouchFirstPendingProgress.isComplete && (
                            <Text fontSize="xs" color={hintColor} textAlign="center" mt={2}>
                              Waiting for {vouchFirstPendingProgress.quorum - vouchFirstPendingProgress.current} more {vouchFirstPendingProgress.quorum - vouchFirstPendingProgress.current === 1 ? 'vouch' : 'vouches'}...
                            </Text>
                          )}
                        </Box>
                      )}

                      {/* Onboarding step progress (when completing) */}
                      {vouchFirstHook.phase === VouchFirstPhase.COMPLETING && vouchFirstHook.stepMessage && (
                        <HStack justify="center" spacing={2}>
                          <Spinner size="sm" color="teal.400" />
                          <Text fontSize="sm" color={textColor}>{vouchFirstHook.stepMessage}</Text>
                        </HStack>
                      )}

                      {/* Error display */}
                      {vouchFirstHook.error && (
                        <Alert status="error" borderRadius="md">
                          <AlertIcon />
                          <Text fontSize="sm">{vouchFirstHook.error.message}</Text>
                        </Alert>
                      )}

                      {/* Complete Join button — shown when quorum met AND quorum is actually known */}
                      {vouchFirstPendingProgress?.isComplete && vouchFirstPendingProgress.quorum > 0 ? (
                        <VStack spacing={3}>
                          {crossChainUsername ? (
                            /* User already has a username on another chain — show it, skip input */
                            <Text fontSize="sm" color={hintColor}>
                              Joining as <strong>{crossChainUsername}</strong>
                            </Text>
                          ) : (
                            /* New user — ask for username */
                            <InputGroup size={isMobile ? "md" : "lg"}>
                              <Input
                                placeholder="Choose a username"
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                                bg={inputBg}
                                borderColor={inputBorderColor}
                                _focus={{ borderColor: "teal.400", boxShadow: "0 0 0 1px teal.400" }}
                                ref={usernameInputRef}
                              />
                              <InputRightElement width="4.5rem">
                                <Icon as={FaUser} color={newUsername ? "green.500" : "gray.300"} />
                              </InputRightElement>
                            </InputGroup>
                          )}
                          <Button
                            colorScheme="teal"
                            size="lg"
                            width="100%"
                            height={buttonHeight}
                            isLoading={vouchFirstHook.phase === VouchFirstPhase.COMPLETING}
                            loadingText={vouchFirstHook.stepMessage || "Completing..."}
                            onClick={() => vouchFirstHook.completeOnboarding(crossChainUsername || newUsername.trim())}
                            isDisabled={!crossChainUsername && !newUsername.trim()}
                            leftIcon={<FaCheck />}
                            animation={(crossChainUsername || newUsername) ? `${pulse} 2s infinite` : undefined}
                          >
                            Complete Join
                          </Button>
                        </VStack>
                      ) : null}

                      {/* Reset / start over */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={vouchFirstHook.reset}
                        leftIcon={<FaRedo />}
                        color={hintColor}
                      >
                        Start Over
                      </Button>
                    </VStack>

                  ) : isAuthenticated ? (
                    orgStructureLoading ? (
                      <VStack spacing={6} align="center" py={12}>
                        <Spinner size="lg" color="teal.400" />
                        <Text color={subtextColor} fontSize="sm">
                          Loading organization details...
                        </Text>
                      </VStack>

                    /* ── Branch 3: Authenticated + vouch-gated ── */
                    ) : hasVouchGatedRoles ? (
                      pendingVouchApplication ? (
                        /* ── Branch 3a: Application submitted, waiting for vouches (persisted across refresh) ── */
                        <VStack spacing={formSpacing} align="stretch">
                          <Box
                            p={{ base: 3, md: 4 }}
                            borderRadius="lg"
                            bg={successBg}
                            borderWidth="1px"
                            borderColor={successBorderColor}
                          >
                            <Flex align="center" flexWrap="wrap">
                              <Icon as={isPasskeyUser ? FaFingerprint : FaCheck} color="green.500" mr={3} boxSize={isMobile ? 4 : 5} />
                              <Text color={textColor} fontWeight="medium" fontSize={{ base: "sm", md: "md" }}>
                                {isPasskeyUser
                                  ? `Passkey Account: ${accountAddress?.substring(0, 6)}...${accountAddress?.substring(accountAddress.length - 4)}`
                                  : `Wallet Connected: ${address?.substring(0, 6)}...${address?.substring(address?.length - 4)}`
                                }
                              </Text>
                            </Flex>
                          </Box>

                          <Box textAlign="center">
                            {pendingApplicationProgress?.isComplete ? (
                              <>
                                <Icon as={FaCheck} color="green.400" boxSize={{ base: 10, md: 12 }} mb={4} />
                                <Heading size={{ base: "md", md: "lg" }} mb={2} color={textColor}>
                                  Vouches Complete!
                                </Heading>
                                <Text color={subtextColor} fontSize={{ base: "sm", md: "md" }}>
                                  You've been vouched for the <b>{pendingVouchApplication.roleName}</b> role.
                                  {dispaly && graphUsername ? '' : ' Enter a username to complete your membership.'}
                                </Text>
                              </>
                            ) : (
                              <>
                                <Box display="inline-block" mb={4}>
                                  <Icon as={FaHandshake} color={accentColor} boxSize={{ base: 10, md: 12 }} />
                                </Box>
                                <Heading size={{ base: "md", md: "lg" }} mb={2} color={textColor}>
                                  Application Submitted!
                                </Heading>
                                <Text color={subtextColor} fontSize={{ base: "sm", md: "md" }}>
                                  Share this link with existing members of <b>{userDAO}</b> so they can vouch for you
                                  for the <b>{pendingVouchApplication.roleName}</b> role.
                                </Text>
                              </>
                            )}
                          </Box>

                          {/* Vouch link copy section */}
                          <Box
                            p={{ base: 3, md: 4 }}
                            borderRadius="lg"
                            bg={inputBg}
                            borderWidth="1px"
                            borderColor={inputBorderColor}
                          >
                            <Flex align="center" gap={2}>
                              <Text fontSize="xs" color={subtextColor} flex="1" isTruncated>
                                {pendingVouchApplication.vouchLink}
                              </Text>
                              <IconButton
                                icon={<FaCopy />}
                                size="sm"
                                colorScheme="teal"
                                variant="ghost"
                                onClick={() => {
                                  navigator.clipboard.writeText(pendingVouchApplication.vouchLink);
                                  toast({
                                    title: "Link copied!",
                                    status: "success",
                                    duration: 2000,
                                    position: "top",
                                  });
                                }}
                                aria-label="Copy vouch link"
                              />
                            </Flex>
                          </Box>

                          {/* Vouch progress */}
                          {pendingApplicationProgress && (
                            <Box px={2}>
                              <VouchProgressBar
                                current={pendingApplicationProgress.current}
                                quorum={pendingApplicationProgress.quorum}
                                size="md"
                              />
                            </Box>
                          )}

                          {/* When quorum met, show Complete Join */}
                          {pendingApplicationProgress?.isComplete ? (
                            <>
                              {dispaly && graphUsername ? (
                                <Text textAlign="center" fontSize={{ base: "sm", md: "md" }} color={hintColor}>
                                  Joining as: <b>{graphUsername}</b>
                                </Text>
                              ) : (
                                <InputGroup size={isMobile ? "md" : "lg"}>
                                  <Input
                                    placeholder="Choose a username"
                                    value={newUsername}
                                    onChange={(e) => setNewUsername(e.target.value)}
                                    bg={inputBg}
                                    borderColor={inputBorderColor}
                                    _focus={{ borderColor: "teal.400", boxShadow: "0 0 0 1px teal.400" }}
                                    ref={usernameInputRef}
                                  />
                                  <InputRightElement width="4.5rem">
                                    <Icon as={FaUser} color={newUsername ? "green.500" : "gray.300"} />
                                  </InputRightElement>
                                </InputGroup>
                              )}
                              <Button
                                colorScheme="teal"
                                size="lg"
                                width="100%"
                                height={buttonHeight}
                                fontSize={{ base: "md", md: "lg" }}
                                isLoading={loading}
                                loadingText="Completing..."
                                onClick={dispaly && graphUsername ? handleJoinWithUser : handleJoinNewUser}
                                isDisabled={!graphUsername && !newUsername.trim()}
                                leftIcon={<FaCheck />}
                                _hover={{ transform: "translateY(-2px)", boxShadow: "lg" }}
                                animation={(newUsername || graphUsername) ? `${pulse} 2s infinite` : undefined}
                              >
                                Complete Join
                              </Button>
                            </>
                          ) : (
                            <Text textAlign="center" fontSize="sm" color={hintColor}>
                              Waiting for members to vouch for you...
                            </Text>
                          )}

                          {/* Allow starting over */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPendingVouchApplication(null)}
                            leftIcon={<FaRedo />}
                            color={hintColor}
                          >
                            Start Over
                          </Button>
                        </VStack>
                      ) : authenticatedUserVouchProgress ? (
                        /* ── Branch 3b: Vouches already complete (user returns after being vouched) ── */
                        <VStack spacing={formSpacing} align="stretch">
                          <Box
                            p={{ base: 3, md: 4 }}
                            borderRadius="lg"
                            bg={successBg}
                            borderWidth="1px"
                            borderColor={successBorderColor}
                          >
                            <Flex align="center" flexWrap="wrap">
                              <Icon as={isPasskeyUser ? FaFingerprint : FaCheck} color="green.500" mr={3} boxSize={isMobile ? 4 : 5} />
                              <Text color={textColor} fontWeight="medium" fontSize={{ base: "sm", md: "md" }}>
                                {isPasskeyUser
                                  ? `Passkey Account: ${accountAddress?.substring(0, 6)}...${accountAddress?.substring(accountAddress.length - 4)}`
                                  : `Wallet Connected: ${address?.substring(0, 6)}...${address?.substring(address?.length - 4)}`
                                }
                              </Text>
                            </Flex>
                          </Box>

                          <Box textAlign="center">
                            <Icon as={FaCheck} color="green.400" boxSize={{ base: 10, md: 12 }} mb={4} />
                            <Heading size={{ base: "md", md: "lg" }} mb={2} color={textColor}>
                              Vouches Complete!
                            </Heading>
                            <Text color={subtextColor} fontSize={{ base: "sm", md: "md" }}>
                              You have been vouched for the <b>{authenticatedUserVouchProgress.roleName}</b> role.
                              Enter a username to complete your membership.
                            </Text>
                          </Box>

                          <Box px={2}>
                            <VouchProgressBar
                              current={authenticatedUserVouchProgress.current}
                              quorum={authenticatedUserVouchProgress.quorum}
                              size="md"
                            />
                          </Box>

                          {dispaly && graphUsername ? (
                            <Text textAlign="center" fontSize={{ base: "sm", md: "md" }} color={hintColor}>
                              Joining as: <b>{graphUsername}</b>
                            </Text>
                          ) : (
                            <InputGroup size={isMobile ? "md" : "lg"}>
                              <Input
                                placeholder="Choose a username"
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                                bg={inputBg}
                                borderColor={inputBorderColor}
                                _focus={{ borderColor: "teal.400", boxShadow: "0 0 0 1px teal.400" }}
                                ref={usernameInputRef}
                              />
                              <InputRightElement width="4.5rem">
                                <Icon as={FaUser} color={newUsername ? "green.500" : "gray.300"} />
                              </InputRightElement>
                            </InputGroup>
                          )}

                          <Button
                            colorScheme="teal"
                            size="lg"
                            width="100%"
                            height={buttonHeight}
                            fontSize={{ base: "md", md: "lg" }}
                            isLoading={loading}
                            loadingText="Completing..."
                            onClick={dispaly && graphUsername ? handleJoinWithUser : handleJoinNewUser}
                            isDisabled={!graphUsername && !newUsername.trim()}
                            leftIcon={<FaCheck />}
                            _hover={{ transform: "translateY(-2px)", boxShadow: "lg" }}
                            animation={(newUsername || graphUsername) ? `${pulse} 2s infinite` : undefined}
                          >
                            Complete Join
                          </Button>
                        </VStack>
                      ) : (
                        /* ── Branch 3c: No application yet → apply-to-join form ── */
                        <VStack spacing={formSpacing} align="stretch">
                          <Box
                            p={{ base: 3, md: 4 }}
                            borderRadius="lg"
                            bg={successBg}
                            borderWidth="1px"
                            borderColor={successBorderColor}
                          >
                            <Flex align="center" flexWrap="wrap">
                              <Icon as={isPasskeyUser ? FaFingerprint : FaCheck} color="green.500" mr={3} boxSize={isMobile ? 4 : 5} />
                              <Text color={textColor} fontWeight="medium" fontSize={{ base: "sm", md: "md" }}>
                                {isPasskeyUser
                                  ? `Passkey Account: ${accountAddress?.substring(0, 6)}...${accountAddress?.substring(accountAddress.length - 4)}`
                                  : `Wallet Connected: ${address?.substring(0, 6)}...${address?.substring(address?.length - 4)}`
                                }
                              </Text>
                            </Flex>
                          </Box>

                          <Box textAlign="center">
                            <Box display="inline-block" mb={4}>
                              <Icon as={FaPaperPlane} color={accentColor} boxSize={{ base: 10, md: 12 }} />
                            </Box>
                            <Heading size={{ base: "md", md: "lg" }} mb={{ base: 2, md: 4 }} color={textColor}>
                              Apply to Join {userDAO}
                            </Heading>
                            <Text color={subtextColor} mb={{ base: 4, md: 6 }} fontSize={{ base: "sm", md: "md" }}>
                              Membership in {userDAO} is by application. Select a role and tell us about yourself.
                              Existing members will review and vouch for you.
                            </Text>
                          </Box>

                          {/* Username section */}
                          {dispaly && graphUsername ? (
                            <Text textAlign="center" fontSize={{ base: "sm", md: "md" }} color={hintColor}>
                              Applying as: <b>{graphUsername}</b>
                            </Text>
                          ) : (
                            <InputGroup size={isMobile ? "md" : "lg"}>
                              <Input
                                placeholder="Choose a username"
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                                bg={inputBg}
                                borderColor={inputBorderColor}
                                _focus={{
                                  borderColor: "teal.400",
                                  boxShadow: "0 0 0 1px teal.400",
                                }}
                                ref={usernameInputRef}
                              />
                              <InputRightElement width="4.5rem">
                                <Icon
                                  as={FaUser}
                                  color={newUsername ? "green.500" : "gray.300"}
                                />
                              </InputRightElement>
                            </InputGroup>
                          )}

                          {/* Role application form */}
                          <RoleApplicationForm
                            roles={rolesWithVouching}
                            selectedHatId={selectedHatId}
                            onSelectRole={setSelectedHatId}
                            notes={applicationNotes}
                            onNotesChange={(e) => setApplicationNotes(e.target.value)}
                          />

                          <Button
                            colorScheme="teal"
                            size={isMobile ? "md" : "lg"}
                            width="100%"
                            height={buttonHeight}
                            fontSize={{ base: "md", md: "lg" }}
                            isLoading={loading || isApplying}
                            loadingText="Submitting Application..."
                            onClick={handleApplyAndJoin}
                            isDisabled={
                              !selectedHatId ||
                              !applicationNotes.trim() ||
                              (!graphUsername && !newUsername.trim()) ||
                              !eligibilityModuleAddress
                            }
                            leftIcon={<FaPaperPlane />}
                            _hover={{
                              transform: "translateY(-2px)",
                              boxShadow: "lg",
                            }}
                          >
                            Apply & Get Vouch Link
                          </Button>
                        </VStack>
                      )
                    ) : (
                      /* ── Default join flow (roles are freely claimable) ── */
                      <>
                        <VStack spacing={formSpacing} align="stretch">
                          <Box
                            p={{ base: 3, md: 4 }}
                            borderRadius="lg"
                            bg={successBg}
                            borderWidth="1px"
                            borderColor={successBorderColor}
                          >
                            <Flex align="center" flexWrap="wrap">
                              <Icon as={isPasskeyUser ? FaFingerprint : FaCheck} color="green.500" mr={3} boxSize={isMobile ? 4 : 5} />
                              <Text color={textColor} fontWeight="medium" fontSize={{ base: "sm", md: "md" }}>
                                {isPasskeyUser
                                  ? `Passkey Account: ${accountAddress?.substring(0, 6)}...${accountAddress?.substring(accountAddress.length - 4)}`
                                  : `Wallet Connected: ${address?.substring(0, 6)}...${address?.substring(address?.length - 4)}`
                                }
                              </Text>
                            </Flex>
                          </Box>

                          <Box textAlign="center">
                            <Box display="inline-block" mb={4}>
                              <Icon as={FaUserPlus} color={accentColor} boxSize={{ base: 10, md: 12 }} />
                            </Box>
                            <Heading size={{ base: "md", md: "lg" }} mb={{ base: 2, md: 4 }} color={textColor}>
                              Complete Your Membership
                            </Heading>
                            <Text color={subtextColor} mb={{ base: 4, md: 6 }} fontSize={{ base: "sm", md: "md" }}>
                              You're one step away from joining {userDAO}.
                              {dispaly && graphUsername ? " Use your existing account or create a new one." : " Create your new account."}
                            </Text>
                          </Box>

                          {dispaly && graphUsername ? (
                            <VStack spacing={{ base: 4, md: 6 }}>
                              <Button
                                size={isMobile ? "md" : "lg"}
                                colorScheme="teal"
                                width="100%"
                                height={buttonHeight}
                                fontSize={{ base: "md", md: "lg" }}
                                isLoading={loading}
                                loadingText="Joining..."
                                onClick={handleJoinWithUser}
                                leftIcon={<FaUser />}
                                _hover={{
                                  transform: "translateY(-2px)",
                                  boxShadow: "lg",
                                }}
                              >
                                Join with Existing Account
                              </Button>

                              <Text textAlign="center" fontSize={{ base: "xs", md: "sm" }} color={hintColor}>
                                Your existing username will be used: <b>{graphUsername}</b>
                              </Text>

                              <Divider />

                              <Text textAlign="center" fontSize={{ base: "xs", md: "sm" }} color={hintColor}>
                                Or create a new account instead
                              </Text>

                              <InputGroup size={isMobile ? "md" : "lg"}>
                                <Input
                                  placeholder="Choose a new username"
                                  value={newUsername}
                                  onChange={(e) => setNewUsername(e.target.value)}
                                  bg={inputBg}
                                  borderColor={inputBorderColor}
                                  _focus={{
                                    borderColor: "teal.400",
                                    boxShadow: "0 0 0 1px teal.400",
                                  }}
                                  ref={usernameInputRef}
                                />
                              </InputGroup>

                              <Button
                                colorScheme="blue"
                                size={isMobile ? "md" : "lg"}
                                width="100%"
                                isLoading={loading && newUsername}
                                loadingText="Creating Account..."
                                onClick={handleJoinNewUser}
                                isDisabled={!newUsername}
                                rightIcon={<FaChevronRight />}
                                _hover={{
                                  transform: "translateY(-2px)",
                                  boxShadow: "lg",
                                }}
                              >
                                Create New Account & Join
                              </Button>
                            </VStack>
                          ) : (
                            <VStack spacing={{ base: 4, md: 6 }}>
                              <Text textAlign="center" fontSize={{ base: "sm", md: "md" }} color={textColor}>
                                Create your account to join {userDAO}
                              </Text>

                              <InputGroup size={isMobile ? "md" : "lg"}>
                                <Input
                                  placeholder="Choose a username"
                                  value={newUsername}
                                  onChange={(e) => setNewUsername(e.target.value)}
                                  bg={inputBg}
                                  borderColor={inputBorderColor}
                                  _focus={{
                                    borderColor: "teal.400",
                                    boxShadow: "0 0 0 1px teal.400",
                                  }}
                                  ref={usernameInputRef}
                                />
                                <InputRightElement width="4.5rem">
                                  <Icon
                                    as={FaUser}
                                    color={newUsername ? "green.500" : "gray.300"}
                                  />
                                </InputRightElement>
                              </InputGroup>

                              <Button
                                colorScheme="teal"
                                size={isMobile ? "md" : "lg"}
                                width="100%"
                                height={buttonHeight}
                                fontSize={{ base: "md", md: "lg" }}
                                isLoading={loading}
                                loadingText="Creating Account..."
                                onClick={handleJoinNewUser}
                                isDisabled={!newUsername}
                                _hover={{
                                  transform: "translateY(-2px)",
                                  boxShadow: "lg",
                                }}
                                animation={newUsername ? `${pulse} 2s infinite` : undefined}
                              >
                                Create Account & Join {userDAO}
                              </Button>

                              <Text fontSize={{ base: "xs", md: "sm" }} color={footerColor} textAlign="center">
                                This will create your membership NFT and profile
                              </Text>
                            </VStack>
                          )}
                        </VStack>
                      </>
                    )
                  /* ── Branch 5: Not authenticated + vouch-gated → credential creation + vouch link ── */
                  ) : !isAuthenticated && orgStructureLoading ? (
                    <VStack spacing={6} align="center" py={12}>
                      <Spinner size="lg" color="teal.400" />
                      <Text color={subtextColor} fontSize="sm">
                        Loading organization details...
                      </Text>
                    </VStack>

                  ) : !isAuthenticated && hasVouchGatedRoles ? (
                    <VStack spacing={formSpacing} align="stretch">
                      <Box textAlign="center">
                        <Heading size={{ base: "md", md: "lg" }} mb={2} color={textColor}>
                          Apply to Join {userDAO}
                        </Heading>
                        <Text color={subtextColor} fontSize={{ base: "sm", md: "md" }}>
                          Create your passkey account, then share a link with existing members to vouch for you.
                        </Text>
                      </Box>

                      <Button
                        variant="outline"
                        colorScheme="teal"
                        size="sm"
                        onClick={onSignInOpen}
                        leftIcon={<FaUser />}
                      >
                        Already have an account? Sign In
                      </Button>

                      {/* Username input */}
                      <InputGroup size={isMobile ? "md" : "lg"}>
                        <Input
                          placeholder="Choose a username"
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value)}
                          bg={inputBg}
                          borderColor={inputBorderColor}
                          _focus={{ borderColor: "teal.400", boxShadow: "0 0 0 1px teal.400" }}
                          ref={usernameInputRef}
                        />
                        <InputRightElement width="4.5rem">
                          <Icon as={FaUser} color={newUsername ? "green.500" : "gray.300"} />
                        </InputRightElement>
                      </InputGroup>

                      {/* Role selection + application form */}
                      <RoleApplicationForm
                        roles={roles}
                        selectedHatId={selectedHatId}
                        onSelectRole={setSelectedHatId}
                        notes={applicationNotes}
                        onNotesChange={(e) => setApplicationNotes(e.target.value)}
                      />

                      {/* Error display */}
                      {vouchFirstHook.error && (
                        <Alert status="error" borderRadius="md">
                          <AlertIcon />
                          <Text fontSize="sm">{vouchFirstHook.error.message}</Text>
                        </Alert>
                      )}

                      <Button
                        colorScheme="teal"
                        size={isMobile ? "md" : "lg"}
                        width="100%"
                        height={buttonHeight}
                        fontSize={{ base: "md", md: "lg" }}
                        isLoading={vouchFirstHook.phase === VouchFirstPhase.CREATING_CREDENTIAL}
                        loadingText="Creating Passkey..."
                        onClick={() => vouchFirstHook.createCredentialAndLink(newUsername.trim(), selectedHatId)}
                        isDisabled={!newUsername.trim() || !selectedHatId}
                        leftIcon={<FaFingerprint />}
                        _hover={{ transform: "translateY(-2px)", boxShadow: "lg" }}
                      >
                        Create Account & Get Vouch Link
                      </Button>

                      <Text fontSize="xs" color={hintColor} textAlign="center">
                        No wallet needed. Your passkey will be created with your fingerprint.
                      </Text>

                      <HStack width="100%" align="center">
                        <Divider />
                        <Text fontSize="xs" color="gray.400" whiteSpace="nowrap" px={2}>
                          or connect a wallet
                        </Text>
                        <Divider />
                      </HStack>

                      <Flex justify="center" p={2}>
                        <ConnectButton
                          showBalance={false}
                          chainStatus={isMobile ? "none" : "icon"}
                          accountStatus={isMobile ? "avatar" : "address"}
                          label="Connect Wallet"
                        />
                      </Flex>
                    </VStack>

                  /* ── Branch 6: Not authenticated + open org → Create Account / Sign In ── */
                  ) : (
                    <VStack spacing={{ base: 6, md: 8 }} align="center">
                      <Box>
                        <Icon as={FaWallet} color={accentColor} boxSize={{ base: 12, md: 16 }} />
                      </Box>

                      <VStack spacing={{ base: 2, md: 3 }}>
                        <Heading size={{ base: "md", md: "lg" }} textAlign="center" color={textColor}>
                          Join {userDAO}
                        </Heading>
                        <Text textAlign="center" color={subtextColor} maxW="md" fontSize={{ base: "sm", md: "md" }}>
                          Create an account with your fingerprint or connect a wallet to get started.
                        </Text>
                      </VStack>

                      <Button
                        variant="outline"
                        colorScheme="teal"
                        size="sm"
                        onClick={onSignInOpen}
                        leftIcon={<FaUser />}
                      >
                        Already have an account? Sign In
                      </Button>

                      <VStack spacing={3} width="100%">
                        <Button
                          onClick={onCreateOpen}
                          width="100%"
                          size="lg"
                          height={buttonHeight}
                          fontSize={{ base: "md", md: "lg" }}
                          colorScheme="green"
                          leftIcon={<FaFingerprint />}
                          _hover={{ transform: "translateY(-2px)", boxShadow: "lg" }}
                        >
                          Create Account
                        </Button>
                        <Text fontSize="xs" color={hintColor} textAlign="center">
                          No wallet or ETH needed. Gas fees are sponsored.
                        </Text>
                      </VStack>

                    </VStack>
                  )}
                </CardBody>
              </Card>
            </ScaleFade>
          </GridItem>
        </Grid>

        <PasskeyOnboardingModal
          isOpen={isCreateOpen}
          onClose={onCreateClose}
          onSuccess={() => {
            if (!hasVouchGatedRoles) {
              router.push(`/dashboard/?userDAO=${userDAO}`);
            }
            // For vouch-gated orgs: stay on page so user can apply for a role
          }}
          showWalletOption
        />
        <SignInModal
          isOpen={isSignInOpen}
          onClose={onSignInClose}
          onSuccess={() => {
            if (!hasVouchGatedRoles) {
              router.push(`/dashboard/?userDAO=${userDAO}`);
            }
            // For vouch-gated orgs: stay on page, re-render shows appropriate branch
          }}
          onCreateAccount={() => { onSignInClose(); onCreateOpen(); }}
        />
      </Container>
    </>
  );
};

export default User;
