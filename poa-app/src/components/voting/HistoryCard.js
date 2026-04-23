import React from "react";
import { Box, Text, Flex, VStack, HStack, Progress } from "@chakra-ui/react";
import { CheckCircleIcon, WarningIcon } from "@chakra-ui/icons";

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

const HistoryCard = ({ proposal, onPollClick }) => {
  const predefinedColors = [
    "#9B59B6", // Purple
    "#3498DB", // Blue
    "#2ECC71", // Green
    "#F1C40F", // Yellow
    "#E74C3C", // Red
  ];

  // VotingContext.transformProposal has already computed per-option vote counts
  // (voter counts for Hybrid) and contract-equivalent percentages. Trust those.
  const rawOptions = Array.isArray(proposal.options) ? proposal.options : [];
  const processedOptions = rawOptions.map((option, index) => ({
    name: option.name || `Option ${index + 1}`,
    votes: typeof option.votes === 'number' ? option.votes : 0,
    percentage: Number.isFinite(option.percentage) ? option.percentage : 0,
    color: predefinedColors[index % predefinedColors.length],
    isWinner: proposal.winningOption === index && proposal.isValid !== false,
  }));

  // Determine winner name
  let winnerName = "No Winner";
  let hasWinner = false;
  if (proposal.isValid !== false &&
      proposal.winningOption !== undefined &&
      proposal.winningOption !== null &&
      rawOptions[proposal.winningOption]) {
    winnerName = rawOptions[proposal.winningOption].name || `Option ${proposal.winningOption + 1}`;
    hasWinner = true;
  }

  // Truncate description to first 100 characters
  const truncatedDescription = proposal.description
    ? proposal.description.length > 100
      ? proposal.description.substring(0, 100) + "..."
      : proposal.description
    : "";

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="space-between"
      borderRadius="2xl"
      boxShadow="lg"
      display="flex"
      w="100%"
      maxWidth="380px"
      bg="transparent"
      position="relative"
      color="rgba(333, 333, 333, 1)"
      p={4}
      zIndex={1}
      h="240px"
      transition="transform 0.3s ease, box-shadow 0.3s ease, background 0.3s ease, border-color 0.3s ease"
      cursor="pointer"
      _hover={{
        transform: "translateY(-5px) scale(1.02)",
        boxShadow: "0 10px 20px rgba(148, 115, 220, 0.2)",
        "& .glass": {
          border: "1px solid rgba(148, 115, 220, 0.5)",
          boxShadow: "inset 0 0 20px rgba(148, 115, 220, 0.3)",
        }
      }}
      onClick={() => onPollClick(proposal, true)}
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
        transition="transform 0.3s ease, box-shadow 0.3s ease, background 0.3s ease, border-color 0.3s ease"
      />

      <VStack spacing={2} align="stretch" w="100%" h="100%">
        {/* Title */}
        <Box>
          <Text
            fontSize="md"
            fontWeight="extrabold"
            borderBottom="2px solid rgba(148, 115, 220, 0.5)"
            pb={1}
            textAlign="center"
            noOfLines={1}
            title={proposal.title}
          >
            {proposal.title}
          </Text>
        </Box>

        {/* Description preview */}
        {truncatedDescription && (
          <Text
            fontSize="xs"
            color="gray.300"
            noOfLines={2}
            lineHeight="1.4"
            textAlign="center"
            px={1}
          >
            {truncatedDescription}
          </Text>
        )}

        {/* Results visualization */}
        <VStack spacing={1} flex="1" justify="center">
          {processedOptions.slice(0, 3).map((option, index) => (
            <HStack key={index} w="100%" spacing={2}>
              <Text
                fontSize="xs"
                color={option.isWinner ? "purple.300" : "gray.400"}
                fontWeight={option.isWinner ? "bold" : "normal"}
                w="70px"
                noOfLines={1}
              >
                {option.name}
              </Text>
              <Box flex="1">
                <Progress
                  value={option.percentage}
                  size="sm"
                  borderRadius="full"
                  bg="rgba(100, 100, 100, 0.3)"
                  sx={{
                    '& > div': {
                      background: option.isWinner
                        ? 'linear-gradient(90deg, rgba(148, 115, 220, 0.8), rgba(148, 115, 220, 1))'
                        : 'rgba(150, 150, 150, 0.5)',
                    }
                  }}
                />
              </Box>
              <Text fontSize="xs" color="gray.400" w="35px" textAlign="right">
                {option.percentage.toFixed(0)}%
              </Text>
            </HStack>
          ))}
          {processedOptions.length > 3 && (
            <Text fontSize="xs" color="gray.500">+{processedOptions.length - 3} more options</Text>
          )}
        </VStack>

        {/* Winner display */}
        <HStack justify="center" spacing={2} pt={1}>
          {proposal.executionFailed ? (
            <>
              <WarningIcon color="red.400" boxSize={4} />
              <Text fontSize="sm" fontWeight="bold" color="red.300">
                Execution Failed
              </Text>
            </>
          ) : hasWinner ? (
            <>
              <CheckCircleIcon color="green.400" boxSize={4} />
              <Text fontSize="sm" fontWeight="bold">
                Winner: <Text as="span" color="purple.300">{winnerName}</Text>
              </Text>
            </>
          ) : (
            <>
              <WarningIcon color="orange.400" boxSize={4} />
              <Text fontSize="sm" fontWeight="bold" color="orange.300">
                No Winner
              </Text>
            </>
          )}
        </HStack>
      </VStack>
    </Box>
  );
};

export default HistoryCard;
