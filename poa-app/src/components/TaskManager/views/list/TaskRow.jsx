import { Box, Flex, HStack, Text, Badge, Tooltip, Image } from '@chakra-ui/react';
import { TimeIcon, StarIcon, CheckIcon, WarningIcon, InfoIcon } from '@chakra-ui/icons';
import { useRouter } from 'next/router';
import UserIdentity from '@/components/common/UserIdentity';
import { usePOContext } from '@/context/POContext';
import { useOrgName } from '@/hooks/useOrgName';
import { hasBounty as checkHasBounty, getTokenByAddress } from '@/util/tokens';
import {
  getDifficultyColor,
  DIFFICULTY_DOTS,
  COLUMN_COLORS,
  COLUMN_TITLES,
} from '@/util/taskUtils';

const STATUS_BADGE_SCHEME = {
  open: 'green',
  inProgress: 'purple',
  inReview: 'yellow',
  completed: 'gray',
};

const TaskRow = ({ task, isMobile = false, showProject = false }) => {
  const router = useRouter();
  const userDAO = useOrgName();
  const poContext = usePOContext();
  const tokenLabel = poContext?.tokenLabel || 'Shares';

  const {
    id,
    name,
    description,
    difficulty,
    estHours,
    claimedBy,
    claimerUsername,
    projectId,
    Payout,
    bountyToken,
    bountyPayout,
    bountyPayoutRaw,
    rejectionCount,
    requiresApplication,
    applicants,
    columnId,
    columnTitle,
    projectName,
  } = task;

  const openTask = () => {
    const safeProjectId = projectId
      ? encodeURIComponent(decodeURIComponent(projectId))
      : undefined;
    router.push(
      {
        pathname: '/tasks/',
        query: {
          ...router.query,
          org: userDAO,
          task: id,
          ...(safeProjectId ? { projectId: safeProjectId } : {}),
        },
      },
      undefined,
      { shallow: true },
    );
  };

  const diffKey = difficulty ? String(difficulty).toLowerCase().replace(' ', '') : null;
  const diffColor = getDifficultyColor(difficulty);
  const dots = (diffKey && DIFFICULTY_DOTS[diffKey]) || 1;
  const statusLabel = COLUMN_TITLES[columnId] || columnTitle || '';
  const statusScheme = STATUS_BADGE_SCHEME[columnId] || 'gray';
  const hasTokenBounty = checkHasBounty(bountyToken, bountyPayoutRaw);
  const tokenInfo = hasTokenBounty ? getTokenByAddress(bountyToken) : null;

  // Mobile renders the row as a card-ish stack to preserve density on
  // narrow widths. Desktop fits the metadata into one horizontal flex row.
  const containerSx = isMobile
    ? {
        bg: 'rgba(255,255,255,0.98)',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
        p: '12px 14px',
        mb: '10px',
      }
    : {
        bg: 'ghostwhite',
        borderRadius: 'md',
        boxShadow: 'sm',
        p: '8px 12px',
        mb: '8px',
        cursor: 'pointer',
      };

  return (
    <Box
      data-tour="task-row"
      role="button"
      tabIndex={0}
      aria-label={`Open task ${name || id}`}
      onClick={openTask}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openTask();
        }
      }}
      sx={{
        ...containerSx,
        borderLeft: `3px solid ${diffColor}`,
        transition: 'box-shadow 0.15s ease, transform 0.15s ease',
        _hover: { boxShadow: 'md' },
        _focusVisible: {
          outline: 'none',
          boxShadow: '0 0 0 2px rgba(159,122,234,0.7)',
        },
      }}
    >
      {isMobile ? (
        <Flex direction="column" gap={1.5}>
          <Flex justify="space-between" align="center" gap={2}>
            <Text
              fontWeight="700"
              fontSize="0.95rem"
              color="#2D3748"
              noOfLines={2}
              lineHeight="tight"
              flex="1"
            >
              {name || id}
            </Text>
            <Badge
              colorScheme={statusScheme}
              fontSize="0.65rem"
              textTransform="none"
              borderRadius="full"
              px={2}
            >
              {statusLabel}
            </Badge>
          </Flex>
          {showProject && projectName && (
            <Text fontSize="0.7rem" color="purple.600" fontWeight="600" noOfLines={1}>
              {projectName}
            </Text>
          )}
          {description && (
            <Text fontSize="0.75rem" color="#4A5568" noOfLines={1} lineHeight="1.4">
              {description}
            </Text>
          )}
          <Flex justify="space-between" align="center" wrap="wrap" gap={2}>
            <HStack spacing={3}>
              {difficulty && (
                <HStack spacing={1}>
                  {Array.from({ length: dots }).map((_, i) => (
                    <Box key={i} w={1.5} h={1.5} borderRadius="full" bg={diffColor} />
                  ))}
                  <Text fontSize="xs" color="gray.500" fontWeight="medium" textTransform="capitalize">
                    {difficulty}
                  </Text>
                </HStack>
              )}
              <HStack spacing={1}>
                <TimeIcon boxSize={3} color="gray.400" />
                <Text fontSize="xs" color="gray.500" fontWeight="medium">
                  {estHours} hr{estHours !== 1 ? 's' : ''}
                </Text>
              </HStack>
            </HStack>
            <HStack spacing={2}>
              {Payout && (
                <Flex align="center" bg="purple.50" px={2} py={0.5} borderRadius="full">
                  <StarIcon boxSize={3} mr={1} color="purple.500" />
                  <Text fontWeight="bold" color="purple.700" fontSize="xs">
                    {Payout} {tokenLabel}
                  </Text>
                </Flex>
              )}
              {(claimedBy || claimerUsername) && (
                <UserIdentity
                  address={claimedBy}
                  usernameHint={claimerUsername}
                  size="xs"
                  showName={false}
                />
              )}
            </HStack>
          </Flex>
        </Flex>
      ) : (
        <Flex align="center" gap={3}>
          {/* Title + optional excerpt */}
          <Box flex="1" minW={0}>
            <Flex align="baseline" gap={2}>
              <Text
                fontWeight="700"
                fontSize="0.9rem"
                color="#2D3748"
                noOfLines={1}
                lineHeight="tight"
              >
                {name || id}
              </Text>
              {showProject && projectName && (
                <Text
                  fontSize="0.65rem"
                  color="purple.600"
                  fontWeight="600"
                  noOfLines={1}
                  flexShrink={0}
                  title={projectName}
                >
                  · {projectName}
                </Text>
              )}
            </Flex>
            {description && (
              <Text fontSize="0.7rem" color="#4A5568" noOfLines={1} mt={0.5}>
                {description}
              </Text>
            )}
          </Box>

          {/* Status badge */}
          <Badge
            colorScheme={statusScheme}
            fontSize="0.65rem"
            textTransform="none"
            borderRadius="full"
            px={2}
            flexShrink={0}
            display={{ base: 'none', md: 'inline-flex' }}
          >
            {statusLabel}
          </Badge>

          {/* Difficulty pill */}
          {difficulty && (
            <HStack spacing={1} flexShrink={0} minW="80px" display={{ base: 'none', lg: 'flex' }}>
              <HStack spacing={1}>
                {Array.from({ length: dots }).map((_, i) => (
                  <Box key={i} w={1.5} h={1.5} borderRadius="full" bg={diffColor} />
                ))}
              </HStack>
              <Text fontSize="xs" color="gray.500" fontWeight="medium" textTransform="capitalize">
                {difficulty}
              </Text>
            </HStack>
          )}

          {/* Hours */}
          <HStack spacing={1} flexShrink={0} minW="60px" display={{ base: 'none', md: 'flex' }}>
            <TimeIcon boxSize={3} color="gray.400" />
            <Text fontSize="xs" color="gray.500" fontWeight="medium">
              {estHours}h
            </Text>
          </HStack>

          {/* Payout pill */}
          {Payout && (
            <Flex
              align="center"
              bg="purple.50"
              px={2}
              py={0.5}
              borderRadius="full"
              flexShrink={0}
            >
              <StarIcon boxSize={3} mr={1} color="purple.500" />
              <Text fontWeight="bold" color="purple.700" fontSize="xs" whiteSpace="nowrap">
                {Payout} {tokenLabel}
              </Text>
            </Flex>
          )}

          {/* Bounty pill */}
          {hasTokenBounty && tokenInfo && (
            <Tooltip label={`Token bounty: ${tokenInfo.name}`} placement="top">
              <Flex align="center" bg="green.50" px={2} py={0.5} borderRadius="full" flexShrink={0}>
                {tokenInfo.logo && (
                  <Image
                    src={tokenInfo.logo}
                    alt={tokenInfo.symbol}
                    boxSize="14px"
                    borderRadius="full"
                    mr={1}
                    fallback={<></>}
                  />
                )}
                <Text fontWeight="bold" color="green.700" fontSize="xs" whiteSpace="nowrap">
                  +{bountyPayout} {tokenInfo.symbol}
                </Text>
              </Flex>
            </Tooltip>
          )}

          {/* Rejection / application flags */}
          {rejectionCount > 0 && columnId !== 'completed' && (
            <Tooltip label={`Rejected ${rejectionCount} time${rejectionCount > 1 ? 's' : ''}`} placement="top">
              <Badge colorScheme="red" fontSize="0.6rem" borderRadius="full" px={2} flexShrink={0}>
                <WarningIcon mr={1} boxSize={2} />
                Rejected
              </Badge>
            </Tooltip>
          )}
          {requiresApplication && columnId === 'open' && applicants?.length > 0 && (
            <Tooltip label={`${applicants.length} applicant${applicants.length > 1 ? 's' : ''}`} placement="top">
              <Badge colorScheme="purple" fontSize="0.6rem" borderRadius="full" px={2} flexShrink={0}>
                <InfoIcon mr={1} boxSize={2} />
                {applicants.length}
              </Badge>
            </Tooltip>
          )}

          {/* Assignee avatar */}
          <Box flexShrink={0} minW="24px">
            {(claimedBy || claimerUsername) ? (
              <UserIdentity
                address={claimedBy}
                usernameHint={claimerUsername}
                size="xs"
                showName={false}
              />
            ) : (
              <Box w="24px" />
            )}
          </Box>
        </Flex>
      )}
    </Box>
  );
};

export default TaskRow;
