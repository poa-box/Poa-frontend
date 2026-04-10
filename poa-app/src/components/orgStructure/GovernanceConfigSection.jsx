/**
 * GovernanceConfigSection - Displays voting system configuration
 */

import React from 'react';
import {
  Box,
  SimpleGrid,
  VStack,
  HStack,
  Text,
  Heading,
  Icon,
  Badge,
  Skeleton,
  Progress,
} from '@chakra-ui/react';
import { FiUsers, FiLayers, FiPercent } from 'react-icons/fi';

/**
 * Card for a single voting system
 */
function VotingCard({ title, description, quorum: threshold, icon, colorScheme = 'purple', classWeights, isQuadratic }) {
  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor="warmGray.100"
      borderLeft="3px solid"
      borderLeftColor="amethyst.400"
      borderRadius="xl"
      p={5}
      height="100%"
      boxShadow="0 2px 4px rgba(0, 0, 0, 0.04)"
    >
      <VStack align="stretch" spacing={4} height="100%">
        {/* Header */}
        <HStack spacing={3}>
          <Box
            p={2}
            borderRadius="lg"
            bg={`${colorScheme}.50`}
          >
            <Icon as={icon} color={`${colorScheme}.500`} boxSize={5} />
          </Box>
          <Heading size="sm" color="warmGray.900">
            {title}
          </Heading>
          {isQuadratic && (
            <Badge colorScheme="blue" variant="subtle" fontSize="2xs">
              Quadratic
            </Badge>
          )}
        </HStack>

        {/* Class Weights for Hybrid Voting */}
        {classWeights && (
          <Box
            p={3}
            bg="warmGray.50"
            borderRadius="lg"
            border="1px solid"
            borderColor="warmGray.200"
          >
            <Text fontSize="xs" color="warmGray.500" mb={2}>
              Voting Power Split
            </Text>
            <HStack spacing={4} justify="center">
              <VStack spacing={0}>
                <Text fontSize="xl" fontWeight="bold" color="amethyst.500">
                  {classWeights.democracy}%
                </Text>
                <Text fontSize="xs" color="warmGray.600">Democracy</Text>
              </VStack>
              <Text color="warmGray.400">/</Text>
              <VStack spacing={0}>
                <Text fontSize="xl" fontWeight="bold" color="blue.500">
                  {classWeights.contribution}%
                </Text>
                <Text fontSize="xs" color="warmGray.600">Work</Text>
              </VStack>
            </HStack>
          </Box>
        )}

        {/* Description */}
        <Text color="warmGray.600" fontSize="sm" flex={1}>
          {description}
        </Text>

        {/* Threshold */}
        <Box>
          <HStack justify="space-between" mb={2}>
            <Text fontSize="xs" color="warmGray.500">
              Threshold Required
            </Text>
            <Badge colorScheme={colorScheme} borderRadius="full" px={2}>
              <HStack spacing={1}>
                <Icon as={FiPercent} boxSize={3} />
                <Text>{threshold}%</Text>
              </HStack>
            </Badge>
          </HStack>
          <Progress
            value={threshold}
            size="sm"
            colorScheme={colorScheme}
            borderRadius="full"
            bg="warmGray.200"
          />
        </Box>
      </VStack>
    </Box>
  );
}

export function GovernanceConfigSection({
  governance = {},
  tokenInfo = null,
  votingClasses = [],
  loading = false,
}) {
  const { hybridVoting, directDemocracyVoting } = governance;

  // Read class weights directly from subgraph data
  let classWeights = null;
  let isQuadratic = false;

  if (votingClasses && votingClasses.length > 0) {
    let democracyWeight = 0;
    let contributionWeight = 0;

    votingClasses.forEach(cls => {
      if (cls.strategy === 'DIRECT') {
        democracyWeight = Number(cls.slicePct);
      } else if (cls.strategy === 'ERC20_BAL') {
        contributionWeight = Number(cls.slicePct);
        isQuadratic = cls.quadratic;
      }
    });

    classWeights = {
      democracy: democracyWeight,
      contribution: contributionWeight,
    };
  }

  if (loading) {
    return (
      <Box
        bg="rgba(255, 255, 255, 0.8)"
        border="1px solid"
        borderColor="warmGray.200"
        borderRadius="2xl"
        p={{ base: 4, md: 6 }}
        boxShadow="0 4px 24px rgba(0, 0, 0, 0.06)"
      >
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <Skeleton height="180px" borderRadius="xl" />
          <Skeleton height="180px" borderRadius="xl" />
        </SimpleGrid>
      </Box>
    );
  }

  const hasVotingSystems = hybridVoting || directDemocracyVoting;

  if (!hasVotingSystems) {
    return (
      <Box
        bg="rgba(255, 255, 255, 0.8)"
        border="1px solid"
        borderColor="warmGray.200"
        borderRadius="2xl"
        p={{ base: 4, md: 6 }}
        boxShadow="0 4px 24px rgba(0, 0, 0, 0.06)"
        textAlign="center"
      >
        <Text color="warmGray.500">No voting systems configured</Text>
      </Box>
    );
  }

  return (
    <Box
      bg="rgba(255, 255, 255, 0.8)"
      border="1px solid"
      borderColor="warmGray.200"
      borderRadius="2xl"
      p={{ base: 4, md: 6 }}
      boxShadow="0 4px 24px rgba(0, 0, 0, 0.06)"
    >
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        {/* Hybrid Voting */}
        {hybridVoting && (
          <VotingCard
            title="Hybrid Voting"
            description="Combines participation-weighted voting with direct democracy. Workers and community members share governance power based on configured class weights."
            quorum={hybridVoting.quorum}
            icon={FiLayers}
            colorScheme="purple"
            classWeights={classWeights}
            isQuadratic={isQuadratic}
          />
        )}

        {/* Direct Democracy */}
        {directDemocracyVoting && (
          <VotingCard
            title="Direct Democracy"
            description="One member, one vote. Every member has equal voting power regardless of participation level. Used for community polls and decisions."
            quorum={directDemocracyVoting.quorumPercentage}
            icon={FiUsers}
            colorScheme="blue"
          />
        )}
      </SimpleGrid>

      {/* Token Info */}
      {tokenInfo && (
        <Box mt={4}>
          <Box
            bg="warmGray.50"
            border="1px solid"
            borderColor="warmGray.200"
            borderRadius="xl"
            p={4}
          >
            <HStack justify="space-between" flexWrap="wrap" gap={4}>
              <VStack align="flex-start" spacing={0}>
                <Text fontSize="xs" color="warmGray.500">
                  Shares
                </Text>
                <HStack>
                  <Text fontWeight="semibold" color="warmGray.900">
                    {tokenInfo.name}
                  </Text>
                  <Badge colorScheme="purple" variant="subtle">
                    {tokenInfo.symbol}
                  </Badge>
                </HStack>
              </VStack>

              <VStack align="flex-end" spacing={0}>
                <Text fontSize="xs" color="warmGray.500">
                  Total Supply
                </Text>
                <Text fontWeight="semibold" color="warmGray.900">
                  {tokenInfo.totalSupply} {tokenInfo.symbol}
                </Text>
              </VStack>
            </HStack>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default GovernanceConfigSection;
