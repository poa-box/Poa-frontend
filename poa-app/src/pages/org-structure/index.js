/**
 * Organization Structure Page
 * Displays org roles, permissions, members, and governance configuration
 */

import SEOHead from "@/components/common/SEOHead";
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  VStack,
  Heading,
  Text,
  Center,
  Button,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import PulseLoader from "@/components/shared/PulseLoader";
import { FiArrowLeft } from 'react-icons/fi';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAccount } from 'wagmi';

import Navbar from '@/templateComponents/studentOrgDAO/NavBar';
import { useAuth } from '@/context/AuthContext';
import { useOrgStructure, useClaimRole, useVouches } from '@/hooks';
import { useUserContext } from '@/context/UserContext';
import { useVotingContext } from '@/context/VotingContext';
import {
  OrgOverviewCard,
  RoleHierarchyTree,
  PermissionsMatrix,
  MembersSection,
  GovernanceConfigSection,
  DeveloperInfoSection,
  VouchingSection,
  RoleApplicationModal,
} from '@/components/orgStructure';

const OrgStructurePage = () => {
  const router = useRouter();
  const { userDAO } = router.query;
  const { isConnected, address: wagmiAddress } = useAccount();
  const { isAuthenticated, accountAddress } = useAuth();

  // Use unified address (works for both passkey and wallet users)
  const userAddress = accountAddress || wagmiAddress;

  // Get user's current hat IDs
  const { userData } = useUserContext();
  const userHatIds = userData?.hatIds || [];

  // Get voting classes for governance display
  const { votingClasses } = useVotingContext();

  const {
    orgName,
    orgMetadata,
    deployedAt,
    totalMembers,
    roles,
    permissionsMatrix,
    permissionColumns,
    membersByRole,
    governance,
    contracts,
    tokenInfo,
    eligibilityModuleAddress,
    loading,
    error,
  } = useOrgStructure();

  // Role claiming and application functionality
  const {
    claimRole,
    isClaimingHat,
    isReady: claimReady,
    applyForRole,
    withdrawApplication,
    checkApplicationStatuses,
    hasApplied,
    isApplyingForHat,
    isWithdrawingFromHat,
  } = useClaimRole(eligibilityModuleAddress);

  // Vouching data for claim eligibility
  const rolesWithVouching = roles?.filter(role => role.vouchingEnabled) || [];
  const { getVouchProgress } = useVouches(eligibilityModuleAddress, rolesWithVouching);

  // Application modal state
  const [applicationModal, setApplicationModal] = useState({ isOpen: false, hatId: null, roleName: '' });

  const handleOpenApplicationModal = useCallback((hatId) => {
    const role = roles.find(r => r.hatId === hatId);
    setApplicationModal({ isOpen: true, hatId, roleName: role?.name || 'Role' });
  }, [roles]);

  const handleCloseApplicationModal = useCallback(() => {
    setApplicationModal({ isOpen: false, hatId: null, roleName: '' });
  }, []);

  const handleSubmitApplication = useCallback(async (applicationData) => {
    if (!applicationModal.hatId) return;
    handleCloseApplicationModal();
    await applyForRole(applicationModal.hatId, applicationData);
  }, [applicationModal.hatId, applyForRole, handleCloseApplicationModal]);

  // Refresh application statuses when roles data is available
  useEffect(() => {
    if (roles?.length && eligibilityModuleAddress && (userAddress || accountAddress)) {
      checkApplicationStatuses();
    }
  }, [roles, eligibilityModuleAddress, userAddress, accountAddress, checkApplicationStatuses]);

  const seoHead = (
    <SEOHead
      title="Organization Structure"
      description="View organization roles and governance structure."
      path="/org-structure"
      noIndex
    />
  );

  // Loading state
  if (loading) {
    return (
      <>
        {seoHead}
        <Box
          minH="100vh"
          bg="linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)"
        >
          <Navbar />
          <Center minH="60vh">
            <VStack spacing={4}>
              <PulseLoader size="xl" color="purple.400" />
              <Text color="gray.400">Loading organization structure...</Text>
            </VStack>
          </Center>
        </Box>
      </>
    );
  }

  // Error state
  if (error) {
    return (
      <>
        {seoHead}
        <Box
          minH="100vh"
          bg="linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)"
        >
          <Navbar />
          <Center minH="60vh">
            <VStack spacing={4}>
              <Alert status="error" borderRadius="md">
                <AlertIcon />
                Failed to load organization data
              </Alert>
              <Link href={`/dashboard?userDAO=${userDAO}`} passHref>
                <Button leftIcon={<FiArrowLeft />} variant="ghost" colorScheme="purple">
                  Back to Dashboard
                </Button>
              </Link>
            </VStack>
          </Center>
        </Box>
      </>
    );
  }

  return (
    <>
      {seoHead}
    <Box
      minH="100vh"
      bg="linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)"
    >
      <Navbar />

      <Box
        maxW="1200px"
        mx="auto"
        px={{ base: 4, md: 6, lg: 8 }}
        py={{ base: 6, md: 8 }}
      >
        <VStack spacing={{ base: 6, md: 8 }} align="stretch">

          {/* Page Header */}
          <Box>
            <Link href={`/dashboard?userDAO=${userDAO}`} passHref>
              <Button
                leftIcon={<FiArrowLeft />}
                variant="ghost"
                colorScheme="gray"
                size="sm"
                mb={4}
              >
                Back to Dashboard
              </Button>
            </Link>
            <Heading size="xl" color="white" mb={2}>
              Organization Structure
            </Heading>
            <Text color="gray.400">
              Explore the governance structure, roles, and permissions of this organization
            </Text>
          </Box>

          {/* Overview Section */}
          <Box as="section">
            <OrgOverviewCard
              name={orgName}
              description={orgMetadata.description}
              links={orgMetadata.links}
              logo={orgMetadata.logo}
              deployedAt={deployedAt}
              totalMembers={totalMembers}
              loading={loading}
            />
          </Box>

          {/* Role Hierarchy Section */}
          <Box as="section">
            <Heading size="lg" color="white" mb={4}>
              Roles
            </Heading>
            <Text color="gray.400" mb={4}>
              The organizational hierarchy defines who can do what within the organization
            </Text>
            <RoleHierarchyTree
              roles={roles}
              loading={loading}
              userHatIds={userHatIds}
              userAddress={userAddress}
              getVouchProgress={getVouchProgress}
              onClaimRole={claimRole}
              isClaimingHat={isClaimingHat}
              isConnected={isAuthenticated}
              showClaimButtons={Boolean(eligibilityModuleAddress)}
              hasApplied={hasApplied}
              isApplyingForHat={isApplyingForHat}
              isWithdrawingFromHat={isWithdrawingFromHat}
              onApplyForRole={handleOpenApplicationModal}
              onWithdrawApplication={withdrawApplication}
            />
          </Box>

          {/* Permissions Matrix Section */}
          <Box as="section">
            <Heading size="lg" color="white" mb={4}>
              Permissions
            </Heading>
            <Text color="gray.400" mb={4}>
              What each role can do across the organization&apos;s systems
            </Text>
            <PermissionsMatrix
              roles={roles}
              permissionsMatrix={permissionsMatrix}
              permissionColumns={permissionColumns}
              loading={loading}
            />
          </Box>

          {/* Members Section */}
          <Box as="section">
            <Heading size="lg" color="white" mb={4}>
              Members
            </Heading>
            <Text color="gray.400" mb={4}>
              Members of the organization grouped by their roles
            </Text>
            <MembersSection
              roles={roles}
              membersByRole={membersByRole}
              loading={loading}
            />
          </Box>

          {/* Vouching Section - only shown if org has vouching enabled */}
          {roles.some(role => role.vouchingEnabled) && (
            <Box as="section">
              <Heading size="lg" color="white" mb={4}>
                Member Vouching
              </Heading>
              <Text color="gray.400" mb={4}>
                Vouch for new members seeking roles in the organization
              </Text>
              <VouchingSection
                roles={roles}
                eligibilityModuleAddress={eligibilityModuleAddress}
                userHatIds={userHatIds}
                userAddress={userAddress}
                isConnected={isAuthenticated}
              />
            </Box>
          )}

          {/* Governance Section */}
          <Box as="section">
            <Heading size="lg" color="white" mb={4}>
              Governance
            </Heading>
            <Text color="gray.400" mb={4}>
              How decisions are made in this organization
            </Text>
            <GovernanceConfigSection
              governance={governance}
              tokenInfo={tokenInfo}
              votingClasses={votingClasses}
              loading={loading}
            />
          </Box>

          {/* Developer Info Section (hidden by default) */}
          <DeveloperInfoSection contracts={contracts} />

        </VStack>
      </Box>

      <RoleApplicationModal
        isOpen={applicationModal.isOpen}
        onClose={handleCloseApplicationModal}
        onApply={handleSubmitApplication}
        roleName={applicationModal.roleName}
      />
    </Box>
    </>
  );
};

export default OrgStructurePage;
