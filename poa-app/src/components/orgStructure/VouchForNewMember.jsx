/**
 * VouchForNewMember - Form to vouch for a user who has 0 vouches
 * Solves the chicken-and-egg problem where users need at least 1 vouch to appear in the UI
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Select,
  Icon,
  IconButton,
  Avatar,
} from '@chakra-ui/react';
import { FiUserPlus, FiX } from 'react-icons/fi';
import { UserSearchInput } from '@/components/common';

/**
 * Truncate an Ethereum address for display
 */
function truncateAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * VouchForNewMember component
 * @param {Object} props
 * @param {Array} props.rolesWithVouching - Roles that have vouching enabled
 * @param {Array} props.userHatIds - Current user's hat IDs (to check vouch permission)
 * @param {Function} props.onVouch - Callback: (address, hatId) => Promise
 * @param {boolean} props.isVouching - Whether a vouch is in progress
 * @param {boolean} props.isConnected - Whether wallet is connected
 * @param {Function} props.canUserVouchForRole - Check if user can vouch for a role: (membershipHatId, userHatIds) => boolean
 */
export function VouchForNewMember({
  rolesWithVouching = [],
  userHatIds = [],
  onVouch,
  isVouching = false,
  isConnected = true,
  canUserVouchForRole,
}) {
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedRoleHatId, setSelectedRoleHatId] = useState('');

  // Filter to roles the user can vouch for — memoized to keep a stable reference
  const vouchableRoles = useMemo(
    () => rolesWithVouching.filter(role =>
      canUserVouchForRole?.(role.vouchingMembershipHatId, userHatIds)
    ),
    [rolesWithVouching, userHatIds, canUserVouchForRole]
  );

  // Auto-select if only one role available
  useEffect(() => {
    if (vouchableRoles.length === 1 && !selectedRoleHatId) {
      setSelectedRoleHatId(vouchableRoles[0].hatId);
    }
  }, [vouchableRoles, selectedRoleHatId]);

  const handleVouch = async () => {
    if (!selectedUser || !selectedRoleHatId || !onVouch) return;

    await onVouch(selectedUser.address, selectedRoleHatId);

    // Reset form after vouch
    setSelectedUser(null);
    // Keep role selected if only one option
    if (vouchableRoles.length !== 1) {
      setSelectedRoleHatId('');
    }
  };

  const canSubmit = selectedUser && selectedRoleHatId && !isVouching && isConnected;

  // Don't render if user can't vouch for any roles
  if (vouchableRoles.length === 0) {
    return null;
  }

  // Find selected role name for button text
  const selectedRole = vouchableRoles.find(r => r.hatId === selectedRoleHatId);

  return (
    <Box
      p={4}
      borderRadius="xl"
      bg="white"
      border="1px solid"
      borderColor="warmGray.200"
      boxShadow="0 2px 4px rgba(0, 0, 0, 0.04)"
    >
      <VStack spacing={3} align="stretch">
        {/* Header */}
        <HStack>
          <Icon as={FiUserPlus} color="rose.500" />
          <Text fontWeight="medium" color="warmGray.900">
            Vouch for a new member
          </Text>
        </HStack>

        {/* User search */}
        <UserSearchInput
          onSelect={setSelectedUser}
          placeholder="Search by username or 0x address..."
          disabled={isVouching}
        />

        {/* Selected user display */}
        {selectedUser && (
          <HStack
            p={2}
            bg="amethyst.50"
            borderRadius="md"
            justify="space-between"
          >
            <HStack>
              <Avatar
                size="xs"
                name={selectedUser.username || selectedUser.address}
                bg="amethyst.500"
              />
              <Text color="warmGray.900" fontSize="sm">
                {selectedUser.username || truncateAddress(selectedUser.address)}
              </Text>
            </HStack>
            <IconButton
              icon={<FiX />}
              size="xs"
              variant="ghost"
              colorScheme="gray"
              onClick={() => setSelectedUser(null)}
              aria-label="Clear selection"
              _hover={{ bg: 'warmGray.100' }}
            />
          </HStack>
        )}

        {/* Role selector (only shown if multiple roles available) */}
        {vouchableRoles.length > 1 && (
          <Select
            placeholder="Select role to vouch for..."
            value={selectedRoleHatId}
            onChange={(e) => setSelectedRoleHatId(e.target.value)}
            disabled={isVouching}
            bg="white"
            borderColor="warmGray.200"
            color="warmGray.900"
            _hover={{ borderColor: 'warmGray.300' }}
          >
            {vouchableRoles.map(role => (
              <option key={role.hatId} value={role.hatId}>
                {role.name} ({role.vouchingQuorum} vouches needed)
              </option>
            ))}
          </Select>
        )}

        {/* Single role indicator */}
        {vouchableRoles.length === 1 && (
          <Text color="warmGray.500" fontSize="sm">
            Vouching for: <Text as="span" color="warmGray.900">{vouchableRoles[0].name}</Text>
          </Text>
        )}

        {/* Vouch button */}
        <Button
          colorScheme="purple"
          leftIcon={isVouching ? undefined : <Icon as={FiUserPlus} />}
          isLoading={isVouching}
          loadingText="Vouching..."
          isDisabled={!canSubmit}
          onClick={handleVouch}
        >
          {selectedUser
            ? `Vouch for ${selectedUser.username || truncateAddress(selectedUser.address)}`
            : 'Vouch'}
        </Button>

        {/* Connection warning */}
        {!isConnected && (
          <Text color="warmGray.500" fontSize="xs" textAlign="center">
            Connect wallet to vouch
          </Text>
        )}
      </VStack>
    </Box>
  );
}

export default VouchForNewMember;
