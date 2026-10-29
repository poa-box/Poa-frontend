/**
 * RoleCardAdvanced - Full-featured inline role editing card
 * Has the same look and feel as RoleCardSimple but with all advanced options
 */

import NativeMembershipFields from '@/features/deployer/components/role/NativeMembershipFields';
import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Switch,
  Button,
  Icon,
  Tooltip,
  NumberInput,
  NumberInputField,
  Collapse,
  useDisclosure,
  Divider,
} from '@chakra-ui/react';
import {
  PiInfo,
  PiCaretDown,
  PiCaretUp,
  PiImage,
  PiGear,
  PiSliders,
} from 'react-icons/pi';
import { GranularPermissionsModal } from './GranularPermissionsModal';
import { AdditionalMembersInput } from './AdditionalMembersInput';
import { setAdditionalMembers } from '../../utils/additionalMembers';
import { RoleCardContainer, RoleCardFields } from './RoleCardShared';

/**
 * AdvancedSettings - Collapsible section with all advanced options
 */
function AdvancedSettings({ role, roleIndex, roles, onUpdate }) {
  const { isOpen, onToggle } = useDisclosure();

  return (
    <Box>
      {/* Toggle header */}
      <HStack
        justify="space-between"
        cursor="pointer"
        onClick={onToggle}
        py={2}
        px={3}
        bg="warmGray.50"
        borderRadius="lg"
        _hover={{ bg: 'warmGray.100' }}
        transition="background 0.2s"
      >
        <HStack spacing={2}>
          <Icon as={PiGear} boxSize={4} color="warmGray.500" />
          <Text fontSize="sm" fontWeight="500" color="warmGray.600">
            Advanced Settings
          </Text>
        </HStack>
        <Icon
          as={isOpen ? PiCaretUp : PiCaretDown}
          boxSize={4}
          color="warmGray.400"
        />
      </HStack>

      <Collapse in={isOpen} animateOpacity>
        <VStack
          mt={3}
          spacing={4}
          align="stretch"
          pl={4}
          borderLeft="2px solid"
          borderColor="warmGray.200"
        >
          {/* Role Image */}
          <Box>
            <HStack spacing={1} mb={2}>
              <Icon as={PiImage} boxSize={3.5} color="warmGray.400" />
              <Text fontSize="xs" color="warmGray.500" fontWeight="600">
                Role Image URL
              </Text>
            </HStack>
            <Input
              size="sm"
              value={role.image || ''}
              onChange={(e) => onUpdate(roleIndex, { ...role, image: e.target.value })}
              placeholder="https://..."
              bg="white"
            />
          </Box>

          {/* Can Vote toggle */}
          <HStack justify="space-between" py={2}>
            <HStack spacing={2}>
              <Text fontSize="sm" color="warmGray.700">
                Can participate in governance votes
              </Text>
              {/* Only gates weighted PROPOSAL voting: GovernanceFactory backfills the
                  hybrid voting classes with canVote roles. Poll (direct-democracy)
                  eligibility comes from a separate role bitmap, which the deploy
                  currently grants to every role — so don't promise it here. */}
              <Tooltip
                label="Members with this role count in proposal votes. Turn it off for bot or service roles that shouldn't carry voting weight."
                hasArrow
                placement="top"
                fontSize="xs"
              >
                <Box as="span" cursor="help">
                  <Icon as={PiInfo} boxSize={3} color="warmGray.400" />
                </Box>
              </Tooltip>
            </HStack>
            <Switch
              isChecked={role.canVote || false}
              onChange={(e) => onUpdate(roleIndex, { ...role, canVote: e.target.checked })}
              colorScheme="green"
              size="sm"
            />
          </HStack>

          <Divider borderColor="warmGray.200" />

          <HStack justify="space-between">
            <Text fontSize="sm">Maximum members (0 means unlimited)</Text>
            <NumberInput size="sm" w="120px" min={0} max={4294967295}
              value={role.maxMembers} onChange={(_, value) => onUpdate(roleIndex, { ...role, maxMembers: value })}>
              <NumberInputField aria-label="Maximum members" />
            </NumberInput>
          </HStack>
          <Divider borderColor="warmGray.200" />

          {/* Distribution */}
          <Box>
            <Text fontSize="xs" color="warmGray.500" fontWeight="600" mb={3}>
              Initial Distribution
            </Text>
            <VStack spacing={3} align="stretch">
              <AdditionalMembersInput
                role={role}
                onChange={(members) => onUpdate(roleIndex, setAdditionalMembers(role, members))}
              />
            </VStack>
          </Box>
        </VStack>
      </Collapse>
    </Box>
  );
}

/**
 * Main RoleCardAdvanced component
 */
export function RoleCardAdvanced({
  role,
  roleIndex,
  roles,
  permissions,
  onUpdate,
  onDelete,
  onTogglePower,
  onTogglePermission,
  canDelete = true,
}) {
  const { isOpen: isPermissionsOpen, onOpen: openPermissions, onClose: closePermissions } = useDisclosure();

  return (
    <RoleCardContainer>
      <RoleCardFields
        role={role}
        roleIndex={roleIndex}
        roles={roles}
        permissions={permissions}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onTogglePower={onTogglePower}
        canDelete={canDelete}
        joinMethod={(
          <NativeMembershipFields role={role} roles={roles}
            onChange={updated => onUpdate(roleIndex, updated)} />
        )}
      >
        {onTogglePermission && (
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Icon as={PiSliders} />}
            onClick={openPermissions}
            borderColor="warmGray.300"
            color="warmGray.600"
            _hover={{ bg: 'amethyst.50', borderColor: 'amethyst.300', color: 'amethyst.600' }}
            alignSelf="flex-start"
          >
            Fine-tune permissions
          </Button>
        )}

        <AdvancedSettings
          role={role}
          roleIndex={roleIndex}
          roles={roles}
          onUpdate={onUpdate}
        />
      </RoleCardFields>

      {onTogglePermission && (
        <GranularPermissionsModal
          isOpen={isPermissionsOpen}
          onClose={closePermissions}
          role={role}
          roleIndex={roleIndex}
          permissions={permissions}
          onTogglePermission={onTogglePermission}
        />
      )}
    </RoleCardContainer>
  );
}

export default RoleCardAdvanced;
