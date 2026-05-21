/**
 * OrganizerHatAdminPanel
 *
 * Lists the hats currently authorised as folder organizers. Add/remove
 * goes through the existing governance-vote flow (executor-only on-chain),
 * matching the pattern already used for creator hats.
 */

import React from 'react';
import {
  Box,
  HStack,
  VStack,
  Text,
  Badge,
  Button,
  Alert,
  AlertIcon,
  Tooltip,
} from '@chakra-ui/react';
import { ExternalLinkIcon, AddIcon } from '@chakra-ui/icons';
import Link from 'next/link';
import { usePOContext } from '@/context/POContext';
import { useOrgName } from '@/hooks/useOrgName';

function HatBadge({ hatId, roleName }) {
  return (
    <HStack
      spacing={2}
      bg="whiteAlpha.100"
      borderRadius="full"
      px={3}
      py={1.5}
      border="1px solid"
      borderColor="whiteAlpha.200"
    >
      <Text fontSize="sm" color="white" fontWeight="500">
        {roleName || `Hat ${hatId.toString().slice(0, 10)}…`}
      </Text>
      <Tooltip label={hatId.toString()} placement="top" hasArrow>
        <Text fontSize="xs" color="gray.400">
          {hatId.toString().slice(0, 6)}…
        </Text>
      </Tooltip>
    </HStack>
  );
}

export default function OrganizerHatAdminPanel({ organizerHatIds = [] }) {
  const { roleNames = {} } = usePOContext() || {};
  const userDAO = useOrgName();

  return (
    <VStack align="stretch" spacing={3}>
      <HStack justify="space-between" align="center">
        <Box>
          <Text fontWeight="600" color="white">
            Folder organizer hats
          </Text>
          <Text fontSize="xs" color="gray.400">
            Wearers of these hats can publish folder-tree updates. Changes
            require a governance vote (executor-only on-chain).
          </Text>
        </Box>
        <Link href={`/votes?org=${encodeURIComponent(userDAO)}`} legacyBehavior passHref>
          <Button as="a" size="sm" colorScheme="purple" leftIcon={<AddIcon />}>
            Propose change
          </Button>
        </Link>
      </HStack>

      {organizerHatIds.length === 0 ? (
        <Alert status="info" borderRadius="md" fontSize="sm">
          <AlertIcon />
          No organizer hats configured. Only the executor can publish folder updates.
        </Alert>
      ) : (
        <HStack spacing={2} flexWrap="wrap">
          {organizerHatIds.map((hatId) => (
            <HatBadge
              key={hatId.toString()}
              hatId={hatId}
              roleName={roleNames[hatId] || roleNames[String(hatId)]}
            />
          ))}
        </HStack>
      )}

      <Link href={`/votes?org=${encodeURIComponent(userDAO)}`} legacyBehavior passHref>
        <Text
          as="a"
          fontSize="xs"
          color="purple.300"
          _hover={{ color: 'purple.200' }}
          display="inline-flex"
          alignItems="center"
        >
          Open governance to grant/revoke{' '}
          <ExternalLinkIcon ml={1} boxSize={3} />
        </Text>
      </Link>
    </VStack>
  );
}
