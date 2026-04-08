/**
 * RecommendationView - Full recommendation breakdown screen
 *
 * Shows a comprehensive breakdown of ALL settings that will be applied:
 * voting, roles, joining, task management, and features — with contextual
 * explanations for why each setting was chosen based on discovery answers.
 */

import React, { useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Badge,
  Icon,
  Flex,
  useColorModeValue,
  ScaleFade,
} from '@chakra-ui/react';
import {
  PiArrowLeft,
  PiScales,
  PiUsersThree,
  PiDoorOpen,
  PiKanban,
  PiLightning,
  PiCheck,
  PiX,
  PiCrown,
  PiUser,
  PiArrowRight,
} from 'react-icons/pi';
import { getRecommendationExplanations } from '../../utils/recommendationExplanations';

/**
 * Merge variation settings with template defaults to get final config
 */
function getMergedConfig(template, variation) {
  const defaults = template?.defaults || {};
  const settings = variation?.settings || {};

  return {
    voting: {
      democracyWeight: settings.democracyWeight ?? defaults.voting?.democracyWeight ?? 50,
      participationWeight: settings.participationWeight ?? defaults.voting?.participationWeight ?? 50,
      quorum: settings.quorum ?? 30,
    },
    roles: defaults.roles || [],
    permissions: {
      ...defaults.permissions,
      ...(settings.permissions || {}),
    },
    features: {
      ...defaults.features,
      ...(settings.features || {}),
    },
  };
}

/**
 * Format role indices into readable role names
 */
function formatRoleNames(roleIndices, roles) {
  if (!roleIndices || roleIndices.length === 0) return 'None';
  if (roleIndices.length === roles.length) return 'Everyone';
  return roleIndices.map((i) => roles[i]?.name || `Role ${i}`).join(', ');
}

/**
 * Get joining method description for a role
 */
function getJoiningMethod(role, allRoles, quickJoinRoles, roleIndex) {
  if (quickJoinRoles?.includes(roleIndex)) {
    return 'Quick Join (open to anyone)';
  }
  if (role.vouching?.enabled && role.vouching.quorum > 0) {
    const voucherRole = allRoles[role.vouching.voucherRoleIndex];
    const voucherName = voucherRole?.name || 'an existing member';
    return `Needs ${role.vouching.quorum} vouch${role.vouching.quorum > 1 ? 'es' : ''} from ${voucherName}`;
  }
  // Top-level roles are elected — governance can control all aspects of the org
  const isTopLevel = role.hierarchy?.adminRoleIndex === null || role.hierarchy?.adminRoleIndex === undefined;
  if (isTopLevel) {
    return 'Elected';
  }
  return 'Invite only';
}

/**
 * Get hierarchy label for a role
 */
function getRoleHierarchyLabel(role, allRoles) {
  if (role.hierarchy?.adminRoleIndex === null || role.hierarchy?.adminRoleIndex === undefined) {
    return 'Top-level';
  }
  const parent = allRoles[role.hierarchy.adminRoleIndex];
  return parent ? `Under ${parent.name}` : 'Top-level';
}

/**
 * Voting balance bar (compact version for recommendation)
 */
function VotingBar({ democracy, participation }) {
  const democracyBg = useColorModeValue('blue.400', 'blue.500');
  const participationBg = useColorModeValue('amethyst.400', 'amethyst.500');
  const labelColor = useColorModeValue('warmGray.500', 'warmGray.400');

  return (
    <Box>
      <Box
        h="36px"
        borderRadius="full"
        overflow="hidden"
        display="flex"
        bg={useColorModeValue('warmGray.100', 'warmGray.700')}
      >
        <Flex
          w={`${democracy}%`}
          bg={democracyBg}
          align="center"
          justify="center"
          color="white"
          transition="width 0.3s ease"
        >
          <Text fontWeight="600" fontSize="sm">{democracy}%</Text>
        </Flex>
        <Flex
          w={`${participation}%`}
          bg={participationBg}
          align="center"
          justify="center"
          color="white"
          transition="width 0.3s ease"
        >
          <Text fontWeight="600" fontSize="sm">{participation}%</Text>
        </Flex>
      </Box>
      <HStack justify="space-between" mt={2} px={1}>
        <HStack spacing={2}>
          <Box w="8px" h="8px" borderRadius="full" bg={democracyBg} />
          <Text fontSize="xs" color={labelColor}>Direct democracy</Text>
        </HStack>
        <HStack spacing={2}>
          <Box w="8px" h="8px" borderRadius="full" bg={participationBg} />
          <Text fontSize="xs" color={labelColor}>Contribution</Text>
        </HStack>
      </HStack>
    </Box>
  );
}

/**
 * Section card wrapper with consistent glass morphism styling
 */
function SectionCard({ icon, title, children, explanation }) {
  const cardBg = useColorModeValue('rgba(255, 255, 255, 0.8)', 'rgba(51, 48, 44, 0.8)');
  const borderColor = useColorModeValue('warmGray.100', 'warmGray.700');
  const headingColor = useColorModeValue('warmGray.900', 'white');
  const explanationColor = useColorModeValue('warmGray.500', 'warmGray.400');
  const dividerColor = useColorModeValue('warmGray.100', 'warmGray.700');

  return (
    <Box
      bg={cardBg}
      border="1px solid"
      borderColor={borderColor}
      borderRadius="xl"
      boxShadow="0 4px 24px rgba(0, 0, 0, 0.06)"
      backdropFilter="blur(16px)"
      p={{ base: 5, md: 6 }}
    >
      <VStack spacing={4} align="stretch">
        <HStack spacing={3}>
          <Icon as={icon} boxSize={5} color="amethyst.500" />
          <Text fontSize="md" fontWeight="600" color={headingColor}>
            {title}
          </Text>
        </HStack>

        {children}

        {explanation && (
          <Box borderTop="1px solid" borderColor={dividerColor} pt={3}>
            <Text fontSize="sm" color={explanationColor} fontStyle="italic" lineHeight="tall">
              {explanation}
            </Text>
          </Box>
        )}
      </VStack>
    </Box>
  );
}

/**
 * Main RecommendationView component
 */
export function RecommendationView({
  template,
  variation,
  variationKey,
  onConfirm,
  onCustomize,
  onBack,
}) {
  const headingColor = useColorModeValue('warmGray.900', 'white');
  const helperColor = useColorModeValue('warmGray.600', 'warmGray.400');
  const subtleColor = useColorModeValue('warmGray.500', 'warmGray.400');
  const checkColor = useColorModeValue('green.500', 'green.400');
  const disabledColor = useColorModeValue('warmGray.300', 'warmGray.600');
  const roleBg = useColorModeValue('warmGray.50', 'warmGray.800');
  const permBadgeBg = useColorModeValue('amethyst.50', 'rgba(144, 85, 232, 0.08)');
  const permBadgeColor = useColorModeValue('amethyst.700', 'amethyst.300');

  // Merge template defaults with variation overrides
  const config = useMemo(
    () => getMergedConfig(template, variation),
    [template, variation]
  );

  // Get contextual explanations
  const explanations = useMemo(
    () => getRecommendationExplanations(template?.id, variationKey),
    [template?.id, variationKey]
  );

  if (!template || !variation) return null;

  const { roles } = config;
  const permissions = config.permissions || {};
  const features = config.features || {};

  return (
    <ScaleFade in={true} initialScale={0.98}>
      <VStack spacing={6} align="stretch">
        {/* Back button */}
        <Button
          variant="ghost"
          leftIcon={<Icon as={PiArrowLeft} />}
          onClick={onBack}
          alignSelf="flex-start"
          color={subtleColor}
        >
          Back to Questions
        </Button>

        {/* Header with gradient accent */}
        <Box overflow="hidden">
          {/* Gradient accent bar */}
          <Box
            h="3px"
            bgGradient="linear(90deg, #9055E8, #E85D85)"
            borderRadius="full"
            mb={6}
          />

          <VStack spacing={3} align="flex-start">
            <Heading size="lg" color={headingColor}>
              Your Recommended Configuration
            </Heading>
            <Badge
              bg="amethyst.50"
              color="amethyst.700"
              borderRadius="full"
              px={3}
              py={1}
              fontSize="sm"
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing="0.05em"
            >
              {variation.name || variationKey}
            </Badge>
            <Text color={helperColor} fontSize="md" lineHeight="tall">
              {variation.reasoning}
            </Text>
          </VStack>
        </Box>

        {/* 1. Voting Power */}
        <SectionCard
          icon={PiScales}
          title="Voting Power"
          explanation={explanations.voting}
        >
          <VotingBar
            democracy={config.voting.democracyWeight}
            participation={config.voting.participationWeight}
          />
          <HStack spacing={2}>
            <Text fontSize="sm" color={subtleColor}>
              Quorum required:
            </Text>
            <Text fontSize="sm" fontWeight="600" color={headingColor}>
              {config.voting.quorum}%
            </Text>
          </HStack>
        </SectionCard>

        {/* 2. Team Structure */}
        <SectionCard
          icon={PiUsersThree}
          title="Team Structure"
          explanation={explanations.roles}
        >
          <VStack spacing={3} align="stretch">
            {roles.map((role, i) => {
              const isTopLevel =
                role.hierarchy?.adminRoleIndex === null ||
                role.hierarchy?.adminRoleIndex === undefined;
              return (
                <HStack
                  key={i}
                  spacing={3}
                  p={3}
                  bg={roleBg}
                  borderRadius="lg"
                >
                  <Icon
                    as={isTopLevel ? PiCrown : PiUser}
                    boxSize={4}
                    color={isTopLevel ? 'amethyst.500' : 'warmGray.400'}
                  />
                  <VStack align="start" spacing={0} flex={1}>
                    <Text fontWeight="600" fontSize="sm" color={headingColor}>
                      {role.name}
                    </Text>
                    <Text fontSize="xs" color={subtleColor}>
                      {getRoleHierarchyLabel(role, roles)}
                      {role.hatConfig?.maxSupply
                        ? ` · Max ${role.hatConfig.maxSupply} members`
                        : ''}
                    </Text>
                  </VStack>
                </HStack>
              );
            })}
          </VStack>
        </SectionCard>

        {/* 3. How People Join */}
        <SectionCard
          icon={PiDoorOpen}
          title="How People Join"
          explanation={explanations.joining}
        >
          <VStack spacing={2} align="stretch">
            {roles.map((role, i) => {
              const method = getJoiningMethod(
                role,
                roles,
                permissions.quickJoinRoles,
                i
              );
              return (
                <HStack key={i} spacing={3}>
                  <Text fontSize="sm" fontWeight="500" color={headingColor} minW="100px">
                    {role.name}
                  </Text>
                  <Text fontSize="sm" color={subtleColor}>
                    {method}
                  </Text>
                </HStack>
              );
            })}
          </VStack>
        </SectionCard>

        {/* 4. Task Management */}
        <SectionCard
          icon={PiKanban}
          title="Task Management"
          explanation={explanations.taskManagement}
        >
          <VStack spacing={2} align="stretch">
            {[
              { label: 'Create tasks', key: 'taskCreators' },
              { label: 'Review tasks', key: 'taskReviewers' },
              { label: 'Claim tasks', key: 'taskClaimers' },
            ].map(({ label, key }) => (
              <HStack key={key} spacing={3} justify="space-between">
                <Text fontSize="sm" color={subtleColor}>
                  {label}
                </Text>
                <Badge
                  bg={permBadgeBg}
                  color={permBadgeColor}
                  borderRadius="full"
                  px={2}
                  py={0.5}
                  fontSize="xs"
                  fontWeight="500"
                >
                  {formatRoleNames(permissions[key], roles)}
                </Badge>
              </HStack>
            ))}
          </VStack>
        </SectionCard>

        {/* 5. Features */}
        <SectionCard
          icon={PiLightning}
          title="Features"
          explanation={explanations.features}
        >
          <VStack spacing={2} align="stretch">
            {/* Elections — always included, inherent to governance */}
            <HStack spacing={3}>
              <Icon as={PiCheck} boxSize={4} color={checkColor} />
              <VStack align="start" spacing={0} flex={1}>
                <Text fontSize="sm" fontWeight="500" color={headingColor}>
                  Elections
                </Text>
                <Text fontSize="xs" color={subtleColor}>
                  Democratic role transitions and leadership changes
                </Text>
              </VStack>
            </HStack>

            {/* Configurable features */}
            {[
              {
                key: 'educationHubEnabled',
                name: 'Education Hub',
                description: 'Onboard new members with learning modules',
              },
            ].map(({ key, name, description }) => {
              const enabled = features[key];
              return (
                <HStack key={key} spacing={3}>
                  <Icon
                    as={enabled ? PiCheck : PiX}
                    boxSize={4}
                    color={enabled ? checkColor : disabledColor}
                  />
                  <VStack align="start" spacing={0} flex={1}>
                    <Text
                      fontSize="sm"
                      fontWeight="500"
                      color={enabled ? headingColor : subtleColor}
                    >
                      {name}
                    </Text>
                    <Text fontSize="xs" color={subtleColor}>
                      {description}
                    </Text>
                  </VStack>
                </HStack>
              );
            })}
          </VStack>
        </SectionCard>

        {/* CTAs */}
        <VStack spacing={3} pt={2}>
          <HStack spacing={3} w="100%" justify="center">
            <Button
              bg="warmGray.900"
              color="white"
              borderRadius="full"
              size="lg"
              fontWeight="600"
              onClick={onConfirm}
              rightIcon={<Icon as={PiArrowRight} />}
              _hover={{ bg: 'warmGray.800' }}
            >
              Use These Settings
            </Button>
            <Button
              variant="outline"
              borderColor="warmGray.300"
              borderRadius="full"
              size="lg"
              onClick={onCustomize}
              _hover={{ bg: 'warmGray.50' }}
            >
              Customize Further
            </Button>
          </HStack>
          <Text fontSize="sm" color={subtleColor} textAlign="center">
            You can adjust any of these in the next steps
          </Text>
        </VStack>
      </VStack>
    </ScaleFade>
  );
}

export default RecommendationView;
