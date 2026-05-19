/**
 * Folders page
 *
 * Org folder tree view + organizer admin panel. Edit-mode is gated on the
 * connected wallet wearing an organizerHatIds hat. The contract itself
 * also gates `setFolders` with `_requireOrganizer`, so a misconfigured
 * UI gate is not a security boundary — but we hide the affordance to
 * keep the surface honest.
 */

import SEOHead from '@/components/common/SEOHead';
import React, { useMemo } from 'react';
import {
  Box,
  Heading,
  Text,
  VStack,
  HStack,
  Button,
  Center,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  useDisclosure,
  Divider,
} from '@chakra-ui/react';
import { EditIcon } from '@chakra-ui/icons';
import Navbar from '@/templateComponents/studentOrgDAO/NavBar';
import PulseLoader from '@/components/shared/PulseLoader';
import { usePOContext } from '@/context/POContext';
import { useUserContext } from '@/context/UserContext';
import { useOrgTheme, useTaskManagerV4State } from '@/hooks';
import { glassLayerStyle } from '@/components/shared/glassStyles';

import FolderTreeView from '@/components/folders/FolderTreeView';
import FolderTreeEditor from '@/components/folders/FolderTreeEditor';
import OrganizerHatAdminPanel from '@/components/folders/OrganizerHatAdminPanel';
import { useFolderDoc } from '@/components/folders/useFolderDoc';

export default function FoldersPage() {
  const {
    poContextLoading,
    error: contextError,
  } = usePOContext() || {};
  const { userData, loading: userLoading } = useUserContext() || {};
  const { pageBackground, onBackground, onBackgroundMuted } = useOrgTheme();

  const editor = useDisclosure();
  // Lens fallback while subgraph fields are pending (subgraph-pop #174/#175).
  const { foldersRoot, organizerHatIds } = useTaskManagerV4State();
  const { doc, loading: docLoading, error: docError } = useFolderDoc(foldersRoot);

  const userHatIds = userData?.hatIds || [];
  const userIsOrganizer = useMemo(() => {
    if (!userHatIds.length || !organizerHatIds.length) return false;
    const userSet = new Set(userHatIds.map((h) => String(h)));
    return organizerHatIds.some((id) => userSet.has(String(id)));
  }, [userHatIds, organizerHatIds]);

  const seoHead = (
    <SEOHead
      title="Folders"
      description="Organize projects into folders."
      path="/folders"
      noIndex
    />
  );

  if (poContextLoading || userLoading) {
    return (
      <>
        {seoHead}
        <Box minH="100vh" background={pageBackground()}>
          <Navbar />
          <Center minH="80vh">
            <VStack spacing={4}>
              <PulseLoader size="xl" />
              <Text color={onBackgroundMuted}>Loading folders...</Text>
            </VStack>
          </Center>
        </Box>
      </>
    );
  }

  if (contextError) {
    return (
      <>
        {seoHead}
        <Box minH="100vh" background={pageBackground()}>
          <Navbar />
          <Center minH="80vh">
            <Alert status="error" maxW="lg" borderRadius="xl">
              <AlertIcon />
              <Box>
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{contextError?.message}</AlertDescription>
              </Box>
            </Alert>
          </Center>
        </Box>
      </>
    );
  }

  return (
    <>
      {seoHead}
      <Box minH="100vh" background={pageBackground()}>
        <Navbar />
        <Box maxW="4xl" mx="auto" px={4} pt={{ base: 4, md: 10 }} pb={12}>
          <VStack spacing={8} align="stretch">
            <HStack justify="space-between" align="center">
              <Box>
                <Heading size="lg" color={onBackground} fontWeight="600">
                  Folders
                </Heading>
                <Text color={onBackgroundMuted} fontSize="sm">
                  Organize projects into folders. Tree is stored off-chain on IPFS
                  and only the root hash is on-chain.
                </Text>
              </Box>
              {userIsOrganizer && (
                <Button
                  leftIcon={<EditIcon />}
                  colorScheme="purple"
                  onClick={editor.onOpen}
                >
                  Edit folders
                </Button>
              )}
            </HStack>

            <Box position="relative" borderRadius="2xl" overflow="hidden" p={4}>
              <Box sx={glassLayerStyle} borderRadius="2xl" />
              {docLoading ? (
                <Center py={8}>
                  <PulseLoader size="md" />
                </Center>
              ) : docError ? (
                <Alert status="warning" borderRadius="md">
                  <AlertIcon />
                  {docError.message}
                </Alert>
              ) : (
                <FolderTreeView doc={doc} />
              )}
            </Box>

            <Divider borderColor="whiteAlpha.200" />

            <Box position="relative" borderRadius="2xl" overflow="hidden" p={4}>
              <Box sx={glassLayerStyle} borderRadius="2xl" />
              <OrganizerHatAdminPanel organizerHatIds={organizerHatIds} />
            </Box>
          </VStack>
        </Box>
      </Box>

      <FolderTreeEditor
        isOpen={editor.isOpen}
        onClose={editor.onClose}
        foldersRoot={foldersRoot}
      />
    </>
  );
}
