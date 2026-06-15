import React from 'react';
import {
  Badge,
  Box,
  HStack,
  IconButton,
  Text,
  VStack,
} from '@chakra-ui/react';
import { CloseIcon, EditIcon } from '@chakra-ui/icons';
import { calculatePayout, formatEstTime } from '@/util/taskUtils';
import { formatDeadlineDate, formatWindow } from '@/util/deadlineUtils';
import { getTokenByAddress, hasBounty } from '@/util/tokens';
import { usePOContext } from '@/context/POContext';

const DraftRow = ({ draft, onEdit, onDelete, compact = false, isActive = false }) => {
  const { taskPayoutConfig } = usePOContext() || {};
  const payout = calculatePayout(draft.difficulty, draft.estHours, taskPayoutConfig);
  const showBounty = hasBounty(draft.bountyToken, draft.bountyAmount);
  const bountyToken = showBounty ? getTokenByAddress(draft.bountyToken) : null;

  const clickable = !!onEdit;

  return (
    <HStack
      p={compact ? 2 : 3}
      borderRadius="md"
      bg={isActive ? 'purple.900' : 'whiteAlpha.50'}
      border="1px solid"
      borderColor={isActive ? 'purple.500' : 'whiteAlpha.100'}
      _hover={clickable ? { bg: isActive ? 'purple.900' : 'whiteAlpha.100', borderColor: 'purple.400' } : undefined}
      align="start"
      spacing={2}
      cursor={clickable ? 'pointer' : 'default'}
      onClick={clickable ? () => onEdit(draft) : undefined}
    >
      <VStack align="start" spacing={1} flex={1} minW={0}>
        <Text color="white" fontSize={compact ? 'xs' : 'sm'} fontWeight="medium" noOfLines={1}>
          {draft.name || 'Untitled draft'}
        </Text>
        {!compact && draft.description && (
          <Text color="gray.400" fontSize="xs" noOfLines={2}>
            {draft.description}
          </Text>
        )}
        <HStack spacing={1.5} flexWrap="wrap">
          <Badge colorScheme="purple" variant="subtle" fontSize="2xs">
            {payout} payout
          </Badge>
          <Badge colorScheme="gray" variant="subtle" fontSize="2xs">
            {taskPayoutConfig?.hoursOnly
              ? formatEstTime(draft.estHours)
              : `${draft.difficulty} · ${draft.estHours}h`}
          </Badge>
          {showBounty && (
            <Badge colorScheme="green" variant="subtle" fontSize="2xs">
              {draft.bountyAmount} {bountyToken?.symbol || 'TOKEN'}
            </Badge>
          )}
          {draft.requiresApplication && (
            <Badge colorScheme="orange" variant="subtle" fontSize="2xs">
              app
            </Badge>
          )}
          {draft.dueDate && (
            <Badge colorScheme="yellow" variant="subtle" fontSize="2xs">
              due {formatDeadlineDate(draft.dueDate)}
              {draft.absoluteDeadline ? ' · hard' : ''}
            </Badge>
          )}
          {Number(draft.completionWindow) > 0 && (
            <Badge colorScheme="cyan" variant="subtle" fontSize="2xs">
              {formatWindow(draft.completionWindow)} limit
            </Badge>
          )}
        </HStack>
      </VStack>
      <Box onClick={(e) => e.stopPropagation()}>
        <HStack spacing={0.5}>
          {onEdit && !compact && (
            <IconButton
              icon={<EditIcon boxSize={3} />}
              aria-label="Edit draft"
              size="xs"
              variant="ghost"
              colorScheme="whiteAlpha"
              onClick={() => onEdit(draft)}
            />
          )}
          {onDelete && (
            <IconButton
              icon={<CloseIcon boxSize={2} />}
              aria-label="Remove draft"
              size="xs"
              variant="ghost"
              colorScheme="whiteAlpha"
              onClick={() => onDelete(draft.draftId)}
            />
          )}
        </HStack>
      </Box>
    </HStack>
  );
};

export default DraftRow;
