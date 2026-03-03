/**
 * Organization Settings Page
 * Allows org admins to edit organization metadata (name, description, logo, links)
 */

import React from 'react';
import {
  Box,
  VStack,
  Heading,
  Text,
  Spinner,
  Center,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
} from '@chakra-ui/react';
import { useRouter } from 'next/router';

import Navbar from '@/templateComponents/studentOrgDAO/NavBar';
import { useAuth } from '@/context/AuthContext';
import { usePOContext } from '@/context/POContext';
import { useIsOrgAdmin } from '@/hooks/useIsOrgAdmin';
import OrgMetadataEditor from '@/components/settings/OrgMetadataEditor';

const SettingsPage = () => {
  const router = useRouter();
  const { userDAO } = router.query;
  const { isAuthenticated, accountAddress } = useAuth();

  const {
    orgId,
    poDescription,
    poLinks,
    logoUrl,
    poContextLoading,
    error: contextError,
  } = usePOContext();

  // Check if user is an org admin using unified accountAddress
  const { isAdmin, loading: adminLoading, error: adminError } = useIsOrgAdmin(orgId, accountAddress);

  // Loading state
  if (poContextLoading || adminLoading) {
    return (
      <Box minH="100vh" bg="gray.900">
        <Navbar />
        <Center minH="80vh" pt={{ base: "60px", md: 0 }}>
          <VStack spacing={4}>
            <Spinner size="xl" color="blue.400" thickness="4px" />
            <Text color="gray.400">Loading settings...</Text>
          </VStack>
        </Center>
      </Box>
    );
  }

  // Error state
  if (contextError || adminError) {
    return (
      <Box minH="100vh" bg="gray.900">
        <Navbar />
        <Center minH="80vh" pt={{ base: "60px", md: 0 }}>
          <Alert status="error" maxW="lg" borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle>Error loading settings</AlertTitle>
              <AlertDescription>{contextError?.message || adminError?.message}</AlertDescription>
            </Box>
          </Alert>
        </Center>
      </Box>
    );
  }

  // Not authenticated state
  if (!isAuthenticated) {
    return (
      <Box minH="100vh" bg="gray.900">
        <Navbar />
        <Center minH="80vh" pt={{ base: "60px", md: 0 }}>
          <Alert status="warning" maxW="lg" borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle>Not signed in</AlertTitle>
              <AlertDescription>Please sign in to access organization settings.</AlertDescription>
            </Box>
          </Alert>
        </Center>
      </Box>
    );
  }

  // Not admin state
  if (!isAdmin) {
    return (
      <Box minH="100vh" bg="gray.900">
        <Navbar />
        <Center minH="80vh" pt={{ base: "60px", md: 0 }}>
          <Alert status="warning" maxW="lg" borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle>Access Denied</AlertTitle>
              <AlertDescription>
                Only organization admins can access settings. You need to be wearing the admin hat or top hat to edit organization metadata.
              </AlertDescription>
            </Box>
          </Alert>
        </Center>
      </Box>
    );
  }

  return (
    <Box minH="100vh" bg="gray.900">
      <Navbar />
      <Box maxW="4xl" mx="auto" px={4} pt={{ base: "80px", md: 8 }} pb={8}>
        <VStack spacing={8} align="stretch">
          <Box>
            <Heading size="lg" color="white" mb={2}>
              Organization Settings
            </Heading>
            <Text color="gray.400">
              Edit your organization&apos;s name, description, logo, and links
            </Text>
          </Box>

          <OrgMetadataEditor
            orgId={orgId}
            currentName={userDAO}
            currentDescription={poDescription}
            currentLinks={poLinks}
            currentLogoHash={logoUrl}
          />
        </VStack>
      </Box>
    </Box>
  );
};

export default SettingsPage;
