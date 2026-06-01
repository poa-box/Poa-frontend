/**
 * RoleHierarchyTree - Visual tree display of Hats Protocol roles
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Flex,
  VStack,
  HStack,
  Text,
  Badge,
  Button,
  Icon,
  Tooltip,
  Skeleton,
} from '@chakra-ui/react';
import {
  FiUsers,
  FiShield,
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
} from 'react-icons/fi';
import { ClaimRoleButton } from './ClaimRoleButton';

/**
 * Normalize hat ID for comparison
 */
function normalizeHatId(id) {
  if (id === null || id === undefined) return '';
  const str = String(id).trim();
  if (str.startsWith('0x') || str.startsWith('0X')) {
    return str.toLowerCase();
  }
  return str;
}

/**
 * Role description with a graceful clamp.
 *
 * Collapsed to two lines so the tree stays compact and scannable; a
 * "Read more" toggle is shown only when the text actually overflows. Overflow
 * is measured against the live layout (which changes with viewport width and
 * the role's tree depth) rather than a fixed character count, so the toggle
 * never appears for descriptions that already fit.
 */
function RoleDescription({ text }) {
  const COLLAPSED_LINES = 2;
  const textRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return undefined;

    // Only measure while collapsed — expanding removes the clamp, so measuring
    // then would always report "fits" and wrongly hide the Show less toggle.
    const measure = () => {
      if (expanded) return;
      setIsClamped(el.scrollHeight > el.clientHeight + 1);
    };

    measure();

    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <Box>
      <Text
        ref={textRef}
        fontSize="sm"
        color="warmGray.600"
        lineHeight="tall"
        noOfLines={expanded ? undefined : COLLAPSED_LINES}
      >
        {text}
      </Text>

      {(isClamped || expanded) && (
        <Button
          variant="link"
          size="xs"
          mt={1}
          color="amethyst.500"
          fontWeight="semibold"
          rightIcon={<Icon as={expanded ? FiChevronUp : FiChevronDown} boxSize={3} />}
          _hover={{ color: 'amethyst.600' }}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? 'Show less' : 'Read more'}
        </Button>
      )}
    </Box>
  );
}

/**
 * Single role node in the tree
 */
function RoleNode({
  role,
  isLast = false,
  userHasRole = false,
  isClaiming = false,
  onClaim,
  isConnected = true,
  showClaimButton = true,
  vouchProgress = null,
  hasApplied = false,
  isApplying = false,
  isWithdrawing = false,
  onApplyForRole,
  onWithdrawApplication,
}) {
  const { name, description, memberCount, level, vouchingEnabled, vouchingQuorum } = role;

  // Connector position: centered in the gap created by the current level's padding
  // Each level adds 32px (8 spacing units * 4px). Connector sits 16px into that gap.
  const connectorLeft = `${(level - 1) * 32 + 16}px`;

  return (
    <Box position="relative" pl={level * 8} py={2}>
      {/* Connector line for child roles */}
      {level > 0 && (
        <>
          {/* Horizontal line */}
          <Box
            position="absolute"
            left={connectorLeft}
            top="50%"
            width="16px"
            height="2px"
            bg="warmGray.300"
          />
          {/* Vertical line */}
          <Box
            position="absolute"
            left={connectorLeft}
            top={0}
            bottom={isLast ? '50%' : 0}
            width="2px"
            bg="warmGray.300"
          />
        </>
      )}

      {/* Role card */}
      <Box
        bg="white"
        border="1px solid"
        borderColor="warmGray.100"
        borderLeft="3px solid"
        borderLeftColor="amethyst.400"
        borderRadius="xl"
        p={4}
        transition="transform 0.2s, box-shadow 0.2s"
        _hover={{
          transform: 'translateX(4px)',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
          borderColor: 'amethyst.300',
        }}
      >
        <HStack align="flex-start" spacing={3}>
          {/* Role icon */}
          <Box
            p={2}
            borderRadius="lg"
            bg="amethyst.50"
            flexShrink={0}
          >
            <Icon as={FiShield} color="amethyst.500" boxSize={5} />
          </Box>

          {/* Role body: header row, then full-width description */}
          <VStack align="stretch" flex="1" minW={0} spacing={2}>
            {/* Header row — name/meta on the left, count + claim on the right */}
            <Flex justify="space-between" align="flex-start" gap={3} flexWrap="wrap">
              <VStack align="flex-start" spacing={1} minW={0}>
                <Text fontWeight="bold" color="warmGray.900" fontSize="md">
                  {name}
                </Text>
                {vouchingEnabled && (
                  <Tooltip
                    label={`Requires ${vouchingQuorum} vouches to join`}
                    placement="top"
                  >
                    <HStack spacing={1}>
                      <Icon as={FiCheckCircle} color="green.500" boxSize={3} />
                      <Text fontSize="xs" color="warmGray.500">
                        Vouching enabled
                      </Text>
                    </HStack>
                  </Tooltip>
                )}
              </VStack>

              <HStack spacing={3} flexShrink={0}>
                <Badge
                  bg="amethyst.100"
                  color="amethyst.700"
                  px={3}
                  py={1}
                  borderRadius="full"
                  display="flex"
                  alignItems="center"
                  gap={1}
                >
                  <Icon as={FiUsers} boxSize={3} />
                  {memberCount}
                </Badge>

                {showClaimButton && (
                  <ClaimRoleButton
                    role={role}
                    userHasRole={userHasRole}
                    isClaiming={isClaiming}
                    onClaim={onClaim}
                    isConnected={isConnected}
                    vouchProgress={vouchProgress}
                    hasApplied={hasApplied}
                    isApplying={isApplying}
                    isWithdrawing={isWithdrawing}
                    onApply={onApplyForRole}
                    onWithdraw={onWithdrawApplication}
                  />
                )}
              </HStack>
            </Flex>

            {/* Description — its own row, aligned under the role name */}
            {description ? <RoleDescription text={description} /> : null}
          </VStack>
        </HStack>
      </Box>
    </Box>
  );
}

export function RoleHierarchyTree({
  roles = [],
  loading = false,
  userHatIds = [],
  userAddress,
  getVouchProgress,
  onClaimRole,
  isClaimingHat,
  isConnected = true,
  showClaimButtons = true,
  hasApplied,
  isApplyingForHat,
  isWithdrawingFromHat,
  onApplyForRole,
  onWithdrawApplication,
}) {
  // Normalize user hat IDs for comparison
  const normalizedUserHatIds = userHatIds.map(id => normalizeHatId(id));

  // Check if user has a specific role
  const userHasHat = (hatId) => {
    const normalizedHatId = normalizeHatId(hatId);
    return normalizedUserHatIds.includes(normalizedHatId);
  };

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
        <VStack spacing={4} align="stretch">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height="60px" borderRadius="xl" />
          ))}
        </VStack>
      </Box>
    );
  }

  if (roles.length === 0) {
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
        <Text color="warmGray.500">No roles defined for this organization</Text>
      </Box>
    );
  }

  // Roles arrive pre-sorted in tree order with level = display depth (from useOrgStructure)
  return (
    <Box
      bg="rgba(255, 255, 255, 0.8)"
      border="1px solid"
      borderColor="warmGray.200"
      borderRadius="2xl"
      p={{ base: 4, md: 6 }}
      boxShadow="0 4px 24px rgba(0, 0, 0, 0.06)"
    >
      <VStack spacing={2} align="stretch">
        {roles.map((role, index) => (
          <RoleNode
            key={role.id || role.hatId}
            role={role}
            isLast={index === roles.length - 1 ||
                    (roles[index + 1]?.level <= role.level)}
            userHasRole={userHasHat(role.hatId)}
            isClaiming={isClaimingHat?.(role.hatId) || false}
            onClaim={onClaimRole}
            isConnected={isConnected}
            showClaimButton={showClaimButtons}
            vouchProgress={getVouchProgress?.(userAddress, role.hatId)}
            hasApplied={hasApplied?.(role.hatId) || false}
            isApplying={isApplyingForHat?.(role.hatId) || false}
            isWithdrawing={isWithdrawingFromHat?.(role.hatId) || false}
            onApplyForRole={onApplyForRole}
            onWithdrawApplication={onWithdrawApplication}
          />
        ))}
      </VStack>
    </Box>
  );
}

export default RoleHierarchyTree;
