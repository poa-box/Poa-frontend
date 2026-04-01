/**
 * VotingEducationHeader
 * Comprehensive educational header for the voting page that explains the hybrid voting system
 * using progressive disclosure and the "Two Voices" metaphor.
 *
 * Displays:
 * - User's actual voting power values
 * - Class weights from the contract
 * - Step-by-step explanation of how votes are calculated
 * - Visual representation of voting power breakdown
 */

import React, { useState } from "react";
import {
  Box,
  Flex,
  Heading,
  Text,
  VStack,
  HStack,
  Collapse,
  Button,
  useBreakpointValue,
  Tooltip,
  Badge,
  SimpleGrid,
  Skeleton,
  keyframes,
} from "@chakra-ui/react";
import { InfoOutlineIcon } from "@chakra-ui/icons";

// Breathing animation for official governance indicator
const breathe = keyframes`
  0%, 100% {
    box-shadow: 0 0 8px rgba(237, 137, 54, 0.3);
    border-color: rgba(237, 137, 54, 0.3);
  }
  50% {
    box-shadow: 0 0 16px rgba(237, 137, 54, 0.5);
    border-color: rgba(237, 137, 54, 0.5);
  }
`;
import { ChevronDownIcon, ChevronUpIcon } from "@chakra-ui/icons";
import { useVotingPower } from "@/hooks";
import { useUserContext } from "@/context/UserContext";
import { usePOContext } from "@/context/POContext";

const glassLayerStyle = {
  position: "absolute",
  height: "100%",
  width: "100%",
  zIndex: -1,
  borderRadius: "inherit",
  backgroundColor: "rgba(0, 0, 0, .85)",
  boxShadow: "inset 0 0 15px rgba(148, 115, 220, 0.15)",
  border: "1px solid rgba(148, 115, 220, 0.2)",
};

/**
 * Compact education dropdown for users without voting power
 */
const LearnMoreDropdown = ({ classWeights, classConfig }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const democracyWeight = classWeights?.democracy ?? 50;
  const contributionWeight = classWeights?.contribution ?? 50;
  const isQuadratic = classConfig?.some(c => c.strategy === 'ERC20_BAL' && c.quadratic) ?? false;

  return (
    <Box w="100%" display="flex" flexDirection="column" alignItems="center">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(prev => !prev)}
        color="gray.400"
        _hover={{ color: "white", bg: "whiteAlpha.100" }}
        rightIcon={isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
        fontWeight="normal"
      >
        Learn more about hybrid voting
      </Button>

      <Collapse in={isExpanded} animateOpacity>
        <Box
          mt={4}
          p={{ base: 4, md: 5 }}
          bg="whiteAlpha.50"
          borderRadius="xl"
          border="1px solid"
          borderColor="whiteAlpha.100"
        >
          <VStack spacing={4} align="stretch">
            <VStack align="start" spacing={2}>
              <Heading size="sm" color="white">
                How Hybrid Voting Works
              </Heading>
              <Text fontSize="sm" color="gray.300">
                Two factors determine your voting power:
              </Text>
            </VStack>

            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              {/* Membership */}
              <Box
                p={3}
                bg="rgba(128, 90, 213, 0.1)"
                borderRadius="lg"
                border="1px solid"
                borderColor="rgba(128, 90, 213, 0.3)"
              >
                <VStack align="start" spacing={2}>
                  <HStack>
                    <Box w="12px" h="12px" borderRadius="full" bg="purple.400" />
                    <Text fontWeight="bold" color="purple.300" fontSize="sm">
                      Membership
                    </Text>
                    <Badge colorScheme="purple" variant="subtle" fontSize="2xs">
                      {democracyWeight}%
                    </Badge>
                  </HStack>
                  <Text fontSize="xs" color="gray.300">
                    Every member gets an equal share of this portion. If there
                    are 6 members, each gets 1/6 of the membership weight.
                  </Text>
                </VStack>
              </Box>

              {/* Contribution */}
              <Box
                p={3}
                bg="rgba(49, 130, 206, 0.1)"
                borderRadius="lg"
                border="1px solid"
                borderColor="rgba(49, 130, 206, 0.3)"
              >
                <VStack align="start" spacing={2}>
                  <HStack>
                    <Box w="12px" h="12px" borderRadius="full" bg="blue.400" />
                    <Text fontWeight="bold" color="blue.300" fontSize="sm">
                      Contribution
                    </Text>
                    <Badge colorScheme="blue" variant="subtle" fontSize="2xs">
                      {contributionWeight}%
                    </Badge>
                  </HStack>
                  <Text fontSize="xs" color="gray.300">
                    Your share of this portion is based on participation tokens,
                    earned by completing tasks. More tokens = more influence.
                    {isQuadratic && " Uses quadratic scaling so no single person can dominate."}
                  </Text>
                </VStack>
              </Box>
            </SimpleGrid>

            {/* Worked example */}
            <Box
              p={3}
              bg="whiteAlpha.50"
              borderRadius="lg"
              border="1px solid"
              borderColor="whiteAlpha.100"
            >
              <VStack align="start" spacing={2}>
                <Text fontWeight="bold" color="white" fontSize="sm">
                  Example
                </Text>
                <Text fontSize="xs" color="gray.300">
                  Say there are 6 members and 100 total tokens. You hold 10 tokens.
                </Text>
                <VStack align="start" spacing={1} pl={2}>
                  <Text fontSize="xs" color="purple.200">
                    Membership: 1/6 of {democracyWeight}% = {(democracyWeight / 6).toFixed(1)}%
                  </Text>
                  <Text fontSize="xs" color="blue.200">
                    Contribution: 10/100 of {contributionWeight}% = {(contributionWeight * 10 / 100).toFixed(1)}%
                  </Text>
                  <Text fontSize="xs" color="green.200" fontWeight="semibold">
                    Your total voting power: {((democracyWeight / 6) + (contributionWeight * 10 / 100)).toFixed(1)}%
                  </Text>
                </VStack>
              </VStack>
            </Box>
          </VStack>
        </Box>
      </Collapse>
    </Box>
  );
};

/**
 * Visual component showing the "Two Voices" voting power breakdown
 * with actual numerical values and class weights
 */
const TwoVoicesBar = ({ membershipPower, contributionPower, classWeights, isLoading, hasMemberRole }) => {
  const totalPower = membershipPower + contributionPower;
  const democracyWeight = classWeights?.democracy ?? 50;
  const contributionWeight = classWeights?.contribution ?? 50;

  // If loading, show skeleton
  if (isLoading) {
    return (
      <VStack spacing={3} w="100%" maxW="500px">
        <Skeleton height="20px" width="150px" />
        <Skeleton height="32px" width="100%" borderRadius="full" />
        <Skeleton height="16px" width="200px" />
      </VStack>
    );
  }

  // Don't show the voting power bar if user has no voting power
  if (totalPower === 0 || !hasMemberRole) {
    return null;
  }

  return (
    <VStack spacing={3} w="100%" maxW="500px">
      <Text fontSize="xs" color="gray.500">
        How votes are weighted
      </Text>

      {/* Class weight bar */}
      <Box w="100%" position="relative">
        <Flex w="100%" h="36px" borderRadius="full" overflow="hidden" bg="gray.700" boxShadow="inner">
          {/* Membership class */}
          <Tooltip
            label={
              <VStack spacing={1} align="start" p={1}>
                <Text fontWeight="bold">Membership</Text>
                <Text fontSize="xs">Equal vote for every member — {democracyWeight}% of the final decision.</Text>
              </VStack>
            }
            placement="top"
            hasArrow
            bg="gray.700"
            p={2}
          >
            <Flex
              w={`${democracyWeight}%`}
              h="100%"
              bg="linear-gradient(90deg, #805AD5 0%, #9F7AEA 100%)"
              align="center"
              justify="center"
              cursor="help"
              transition="filter 0.3s"
              _hover={{ filter: "brightness(1.15)" }}
            >
              <HStack spacing={1}>
                <Text fontSize="sm" fontWeight="bold" color="white">
                  {democracyWeight}%
                </Text>
                <Text fontSize="2xs" color="whiteAlpha.800">
                  membership
                </Text>
              </HStack>
            </Flex>
          </Tooltip>

          {/* Contribution class */}
          <Tooltip
            label={
              <VStack spacing={1} align="start" p={1}>
                <Text fontWeight="bold">Contribution</Text>
                <Text fontSize="xs">Based on your participation tokens — {contributionWeight}% of the final decision.</Text>
              </VStack>
            }
            placement="top"
            hasArrow
            bg="gray.700"
            p={2}
          >
            <Flex
              w={`${contributionWeight}%`}
              h="100%"
              bg="linear-gradient(90deg, #3182CE 0%, #63B3ED 100%)"
              align="center"
              justify="center"
              cursor="help"
              transition="filter 0.3s"
              _hover={{ filter: "brightness(1.15)" }}
            >
              <HStack spacing={1}>
                <Text fontSize="sm" fontWeight="bold" color="white">
                  {contributionWeight}%
                </Text>
                <Text fontSize="2xs" color="whiteAlpha.800">
                  contribution
                </Text>
              </HStack>
            </Flex>
          </Tooltip>
        </Flex>
      </Box>

    </VStack>
  );
};

/**
 * Stats panel showing user's effective voting share breakdown by class
 */
const VotingPowerStats = ({ classWeights, orgStats, poMembers }) => {
  const membershipPct = orgStats?.membershipPercent ?? 0;
  const contributionPct = orgStats?.contributionPercent ?? 0;
  const totalPct = orgStats?.percentOfTotal ?? 0;
  const democracyWeight = classWeights?.democracy ?? 50;
  const contributionWeight = classWeights?.contribution ?? 50;

  return (
    <VStack spacing={3} w="100%" maxW="500px">
      <Text fontSize="sm" color="gray.300" fontWeight="semibold">
        Your Personal Voting Power
      </Text>

      {/* Effective percentage breakdown: membership + contribution = total */}
      <HStack
        spacing={0}
        w="100%"
        justify="space-between"
        p={3}
        bg="whiteAlpha.50"
        borderRadius="lg"
        border="1px solid"
        borderColor="whiteAlpha.100"
      >
        <VStack spacing={0} flex={1}>
          <Text fontSize="md" fontWeight="bold" color="purple.300">
            {membershipPct.toFixed(1)}%
          </Text>
          <Text fontSize="2xs" color="gray.500">membership</Text>
        </VStack>
        <Text color="gray.600" fontSize="xs">+</Text>
        <VStack spacing={0} flex={1}>
          <Text fontSize="md" fontWeight="bold" color="blue.300">
            {contributionPct.toFixed(1)}%
          </Text>
          <Text fontSize="2xs" color="gray.500">contribution</Text>
        </VStack>
        <Text color="gray.600" fontSize="xs">=</Text>
        <VStack spacing={0} flex={1}>
          <HStack spacing={1} justify="center">
            <Text fontSize="md" fontWeight="bold" color="green.300">
              {totalPct.toFixed(1)}%
            </Text>
            <Tooltip
              label={
                <VStack spacing={2} align="start" p={1}>
                  <Text fontWeight="bold" fontSize="sm">How your voting power works</Text>
                  <Text fontSize="xs">
                    Your effective share is the sum of two weighted class scores:
                  </Text>
                  <VStack spacing={1} align="start" pl={2}>
                    <Text fontSize="xs" color="purple.200">
                      Membership ({democracyWeight}% weight): Your equal share among {poMembers} members
                    </Text>
                    <Text fontSize="xs" color="blue.200">
                      Contribution ({contributionWeight}% weight): Your share based on participation tokens
                    </Text>
                  </VStack>
                  <Text fontSize="xs" color="gray.300" fontStyle="italic">
                    Each class is scored independently, then combined by weight to determine your total influence.
                  </Text>
                </VStack>
              }
              placement="top"
              hasArrow
              bg="gray.700"
              p={3}
              maxW="300px"
            >
              <Box as="span" display="inline-flex" cursor="help">
                <InfoOutlineIcon color="gray.500" boxSize="12px" />
              </Box>
            </Tooltip>
          </HStack>
          <Text fontSize="2xs" color="gray.500">your share</Text>
        </VStack>
      </HStack>
    </VStack>
  );
};

const VotingEducationHeader = ({ selectedTab, PTVoteType }) => {

  const { userData, hasMemberRole } = useUserContext();
  const { poMembers } = usePOContext();

  const {
    membershipPower,
    contributionPower,
    classWeights,
    classConfig,
    orgStats,
    hasVotingPower,
    isLoading,
  } = useVotingPower();

  const headingSize = useBreakpointValue({ base: "lg", md: "xl" });
  // Tab 0 = Hybrid/Participation Voting, Tab 1 = Direct Democracy
  const showHybridEducation = selectedTab === 0 && PTVoteType === "Hybrid";
  const showParticipationEducation = selectedTab === 0 && PTVoteType === "Participation";


  // Get the appropriate title and tagline
  // Tab 0 = Hybrid/Participation Voting, Tab 1 = Direct Democracy
  const getTitle = () => {
    if (selectedTab === 1) {
      return "Quick Temperature Check";
    } else if (PTVoteType === "Hybrid") {
      return "Hybrid Voting";
    } else {
      return "Participation Voting";
    }
  };

  const getTagline = () => {
    if (selectedTab === 1) {
      return "One person, one vote — gauge sentiment without commitment";
    } else if (PTVoteType === "Hybrid") {
      return "Binding decisions weighted by membership + contributions";
    } else {
      return "Official governance based on your contributions";
    }
  };

  const ptBalance = userData?.participationTokenBalance || "0";

  return (
    <Flex
      align="center"
      mb={{ base: 4, md: 6 }}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      borderRadius="3xl"
      boxShadow="lg"
      p={{ base: 4, md: 6 }}
      w="100%"
      maxW="1440px"
      mx="auto"
      bg="transparent"
      position="relative"
      display="flex"
      zIndex={0}
      transition="transform 0.3s ease, box-shadow 0.3s ease, background 0.3s ease, border-color 0.3s ease"
    >
      <Box
        className="glass"
        style={glassLayerStyle}
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        borderRadius="inherit"
        zIndex={-1}
      />

      <VStack spacing={5} w="100%">
        {/* Type indicator badge + Title */}
        <VStack spacing={3}>
          {/* Official/Informal badge */}
          {/* Tab 0 = Hybrid/Participation (Official), Tab 1 = Democracy (Informal) */}
          {selectedTab === 0 ? (
            <HStack
              spacing={2}
              bg="rgba(237, 137, 54, 0.1)"
              border="1px solid rgba(237, 137, 54, 0.3)"
              borderRadius="full"
              px={3}
              py={1.5}
              animation={`${breathe} 3s ease-in-out infinite`}
            >
              <Box
                w="8px"
                h="8px"
                borderRadius="full"
                bg="linear-gradient(135deg, #F6AD55 0%, #ED8936 100%)"
                boxShadow="0 0 8px rgba(237, 137, 54, 0.6)"
              />
              <Text
                fontSize="xs"
                color="orange.300"
                fontWeight="semibold"
                textTransform="uppercase"
                letterSpacing="wide"
              >
                Official Governance
              </Text>
            </HStack>
          ) : (
            <HStack
              spacing={2}
              bg="whiteAlpha.100"
              borderRadius="full"
              px={3}
              py={1.5}
            >
              <Box
                w="8px"
                h="8px"
                borderRadius="full"
                bg="blue.400"
                boxShadow="0 0 8px rgba(66, 153, 225, 0.5)"
              />
              <Text
                fontSize="xs"
                color="gray.400"
                fontWeight="semibold"
                textTransform="uppercase"
                letterSpacing="wide"
              >
                Informal Poll
              </Text>
            </HStack>
          )}

          {/* Title */}
          <Heading
            color="ghostwhite"
            size={headingSize}
            bgGradient={selectedTab === 0
              ? "linear(to-r, orange.300, purple.400)"
              : "linear(to-r, blue.300, blue.400)"
            }
            bgClip="text"
            textAlign="center"
          >
            {getTitle()}
          </Heading>
          <Text
            color="gray.300"
            fontSize={{ base: "sm", md: "md" }}
            textAlign="center"
          >
            {getTagline()}
          </Text>
        </VStack>

        {/* Hybrid Voting Education Section */}
        {showHybridEducation && (
          <>
            {/* Two Voices visualization bar - shows user's personal power */}
            <TwoVoicesBar
              membershipPower={membershipPower}
              contributionPower={contributionPower}
              classWeights={classWeights}
              isLoading={isLoading}
              hasMemberRole={hasMemberRole}
            />

            {/* Voting Power Stats Grid */}
            {hasVotingPower && !isLoading && (
              <VotingPowerStats
                classWeights={classWeights}
                poMembers={poMembers}
                orgStats={orgStats}
              />
            )}

            {/* Learn more dropdown - always show for hybrid voting */}
            <LearnMoreDropdown classWeights={classWeights} classConfig={classConfig} />
          </>
        )}

        {/* Participation Voting (non-hybrid) Education */}
        {showParticipationEducation && (
          <VStack spacing={3}>
            <Box
              p={4}
              bg="whiteAlpha.50"
              borderRadius="lg"
              border="1px solid"
              borderColor="rgba(237, 137, 54, 0.15)"
              maxW="500px"
            >
              <VStack spacing={2}>
                <Text fontSize="sm" color="gray.300" textAlign="center">
                  Binding governance weighted by your participation tokens.
                  Complete tasks and contribute to earn more influence.
                </Text>
                {userData?.participationTokenBalance && (
                  <HStack spacing={2}>
                    <Text fontSize="xs" color="gray.400">Your tokens:</Text>
                    <Badge colorScheme="orange" variant="subtle">
                      {ptBalance}
                    </Badge>
                  </HStack>
                )}
              </VStack>
            </Box>
          </VStack>
        )}

        {/* Simple message for Democracy voting - no Total members, just clean explanation */}
        {selectedTab === 1 && (
          <Text
            fontSize="sm"
            color="gray.400"
            textAlign="center"
            maxW="400px"
          >
            One person, one vote. Results are non-binding.
          </Text>
        )}
      </VStack>
    </Flex>
  );
};

export default VotingEducationHeader;
