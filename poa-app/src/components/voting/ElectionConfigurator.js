/**
 * ElectionConfigurator
 * Template-style election configuration component with guided 3-step flow.
 * Mirrors the SetterActionSelector pattern: Select Role -> Configure Candidates -> Preview.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  VStack,
  HStack,
  Box,
  Text,
  Button,
  Input,
  SimpleGrid,
  Alert,
  AlertIcon,
  Badge,
  Icon,
  IconButton,
  InputGroup,
  InputLeftElement,
} from '@chakra-ui/react';
import {
  FiChevronRight,
  FiArrowLeft,
  FiSearch,
  FiUserPlus,
} from 'react-icons/fi';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import { utils } from 'ethers';

/**
 * Derive current holders of a hat from leaderboard data
 */
function getCurrentHolders(hatId, leaderboardData) {
  if (!hatId || !leaderboardData) return [];
  const hatIdStr = String(hatId);
  return leaderboardData
    .filter(user => user.hatIds.map(String).includes(hatIdStr))
    .map(user => ({ address: user.address, name: user.name }));
}

/**
 * Role card for step 1 selection
 */
const RoleCard = ({ role, holderCount, holderNames, onClick }) => (
  <Box
    p={4}
    borderRadius="md"
    cursor="pointer"
    bg="whiteAlpha.50"
    border="1px solid rgba(148, 115, 220, 0.2)"
    onClick={onClick}
    _hover={{
      borderColor: 'purple.400',
      bg: 'whiteAlpha.100',
    }}
    transition="background 0.2s, border-color 0.2s"
  >
    <HStack justify="space-between">
      <VStack align="start" spacing={0}>
        <Text fontSize="sm" fontWeight="bold" color="white">
          {role.name}
        </Text>
        <Text fontSize="xs" color="gray.400">
          {holderCount === 0
            ? 'No current holder'
            : holderCount === 1
            ? `Held by ${holderNames[0]}`
            : `${holderCount} current holders`}
        </Text>
      </VStack>
      <Icon as={FiChevronRight} color="gray.400" />
    </HStack>
  </Box>
);

/**
 * Main ElectionConfigurator component
 */
const ElectionConfigurator = ({
  proposal,
  onChange,
  allRoles = [],
  leaderboardData = [],
}) => {
  const [step, setStep] = useState(proposal.electionRoleId ? 2 : 1);
  const [searchQuery, setSearchQuery] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);

  // Use the snapshotted current holders from proposal state (set at role selection time).
  // This ensures the preview matches what the batch builder will use.
  const currentHolders = proposal.electionCurrentHolders || [];

  // Selected role name
  const selectedRoleName = useMemo(() => {
    if (!proposal.electionRoleId) return '';
    const role = allRoles.find(r => String(r.hatId) === String(proposal.electionRoleId));
    return role?.name || '';
  }, [proposal.electionRoleId, allRoles]);

  // Members available to add as candidates (exclude already-added)
  const availableMembers = useMemo(() => {
    const addedAddresses = new Set(
      (proposal.electionCandidates || []).map(c => c.address.toLowerCase())
    );
    let members = leaderboardData.filter(
      user => user.hasUsername && !addedAddresses.has(user.address.toLowerCase())
    );

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      members = members.filter(
        user =>
          user.name.toLowerCase().includes(q) ||
          user.address.toLowerCase().includes(q)
      );
    }

    // Sort: current holders first
    const holderAddresses = new Set(currentHolders.map(h => h.address.toLowerCase()));
    members.sort((a, b) => {
      const aIsHolder = holderAddresses.has(a.address.toLowerCase()) ? 0 : 1;
      const bIsHolder = holderAddresses.has(b.address.toLowerCase()) ? 0 : 1;
      return aIsHolder - bIsHolder;
    });

    return members;
  }, [leaderboardData, proposal.electionCandidates, searchQuery, currentHolders]);

  // Check if a candidate is a current holder
  const isCurrentHolder = useCallback(
    (address) =>
      currentHolders.some(h => h.address.toLowerCase() === address.toLowerCase()),
    [currentHolders]
  );

  // Handle role selection (step 1 -> 2)
  const handleRoleSelect = useCallback(
    (role) => {
      const holders = getCurrentHolders(role.hatId, leaderboardData);
      const updates = {
        electionRoleId: role.hatId,
        electionCurrentHolders: holders,
        electionCandidates: [],
      };

      // Auto-populate title if it's empty or was auto-generated from a previous role
      if (!proposal.name || proposal.name.startsWith('Election for ')) {
        updates.name = `Election for ${role.name}`;
      }

      onChange(updates);
      setStep(2);
      setSearchQuery('');
    },
    [onChange, leaderboardData, proposal.name]
  );

  // Handle adding a candidate from member list
  const handleAddMember = useCallback(
    (member) => {
      const alreadyAdded = (proposal.electionCandidates || []).some(
        c => c.address.toLowerCase() === member.address.toLowerCase()
      );
      if (alreadyAdded) return;

      onChange({
        electionCandidates: [
          ...(proposal.electionCandidates || []),
          { name: member.name, address: member.address },
        ],
      });
      setSearchQuery('');
    },
    [onChange, proposal.electionCandidates]
  );

  // Handle manual candidate entry
  const handleAddManual = useCallback(() => {
    if (!manualName.trim() || !manualAddress.trim()) return;
    if (!utils.isAddress(manualAddress.trim())) return;

    const alreadyAdded = (proposal.electionCandidates || []).some(
      c => c.address.toLowerCase() === manualAddress.trim().toLowerCase()
    );
    if (alreadyAdded) return;

    onChange({
      electionCandidates: [
        ...(proposal.electionCandidates || []),
        { name: manualName.trim(), address: manualAddress.trim() },
      ],
    });
    setManualName('');
    setManualAddress('');
  }, [manualName, manualAddress, onChange, proposal.electionCandidates]);

  // Handle removing a candidate
  const handleRemoveCandidate = useCallback(
    (index) => {
      onChange({
        electionCandidates: (proposal.electionCandidates || []).filter(
          (_, i) => i !== index
        ),
      });
    },
    [onChange, proposal.electionCandidates]
  );

  // Handle back navigation
  const handleBack = useCallback(() => {
    if (step === 2) {
      setStep(1);
      const updates = {
        electionRoleId: '',
        electionCandidates: [],
        electionCurrentHolders: [],
      };
      // Clear auto-generated title
      if (proposal.name.startsWith('Election for ')) {
        updates.name = '';
      }
      onChange(updates);
    }
  }, [step, onChange, proposal.name]);

  const candidates = proposal.electionCandidates || [];

  return (
    <VStack spacing={4} align="stretch">
      {/* Step 1: Select Role */}
      {step === 1 && (
        <>
          <Text fontSize="sm" color="gray.300" fontWeight="medium">
            Select the role to be elected:
          </Text>
          <SimpleGrid columns={2} spacing={3}>
            {allRoles.map((role) => {
              const holders = getCurrentHolders(role.hatId, leaderboardData);
              return (
                <RoleCard
                  key={role.hatId}
                  role={role}
                  holderCount={holders.length}
                  holderNames={holders.map(h => h.name)}
                  onClick={() => handleRoleSelect(role)}
                />
              );
            })}
          </SimpleGrid>
          {allRoles.length === 0 && (
            <Text fontSize="sm" color="gray.500">
              No roles available in this organization.
            </Text>
          )}
        </>
      )}

      {/* Step 2: Configure Candidates */}
      {step === 2 && (
        <>
          <HStack>
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<FiArrowLeft />}
              onClick={handleBack}
              color="gray.400"
              _hover={{ color: 'white' }}
            >
              Back
            </Button>
            <Text fontSize="sm" color="white" fontWeight="bold">
              {selectedRoleName}
            </Text>
          </HStack>

          {/* Current Holder Display */}
          {currentHolders.length > 0 && (
            <Box
              p={3}
              bg="rgba(148, 115, 220, 0.1)"
              borderRadius="md"
              border="1px solid rgba(148, 115, 220, 0.3)"
            >
              <Text fontSize="sm" color="gray.300" fontWeight="medium" mb={2}>
                Current Holder{currentHolders.length > 1 ? 's' : ''}
              </Text>
              <VStack spacing={1} align="stretch">
                {currentHolders.map((holder) => (
                  <HStack key={holder.address} spacing={2}>
                    <Badge colorScheme="purple" variant="subtle" fontSize="xs">
                      Current
                    </Badge>
                    <Text fontSize="sm" color="white">
                      {holder.name}
                    </Text>
                    <Text fontSize="xs" color="gray.400">
                      {holder.address.slice(0, 6)}...{holder.address.slice(-4)}
                    </Text>
                  </HStack>
                ))}
              </VStack>
            </Box>
          )}

          {/* Warning about current holder losing role */}
          {currentHolders.length > 0 && (
            <Alert
              status="warning"
              borderRadius="md"
              bg="rgba(236, 201, 75, 0.15)"
            >
              <AlertIcon color="yellow.300" />
              <Text fontSize="sm" color="yellow.200">
                The current holder will lose this role if they don&apos;t win the
                election. Add them as a candidate if they should be eligible to
                keep it.
              </Text>
            </Alert>
          )}

          {/* Member Search */}
          <Box>
            <Text fontSize="sm" color="gray.300" fontWeight="medium" mb={2}>
              Add Candidates
            </Text>
            <InputGroup size="sm" mb={2}>
              <InputLeftElement>
                <Icon as={FiSearch} color="gray.400" />
              </InputLeftElement>
              <Input
                placeholder="Search members by name or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                bg="whiteAlpha.100"
                border="1px solid rgba(148, 115, 220, 0.3)"
                color="white"
                _hover={{ borderColor: 'purple.400' }}
                _focus={{ borderColor: 'purple.500' }}
              />
            </InputGroup>

            {/* Member Results */}
            {searchQuery.trim() && (
              <Box
                maxH="160px"
                overflowY="auto"
                borderRadius="md"
                border="1px solid rgba(148, 115, 220, 0.2)"
                bg="rgba(0, 0, 0, 0.3)"
              >
                {availableMembers.length > 0 ? (
                  availableMembers.slice(0, 10).map((member) => (
                    <HStack
                      key={member.address}
                      p={2}
                      cursor="pointer"
                      _hover={{ bg: 'whiteAlpha.100' }}
                      onClick={() => handleAddMember(member)}
                      justify="space-between"
                    >
                      <HStack spacing={2}>
                        <Text fontSize="sm" color="white">
                          {member.name}
                        </Text>
                        {isCurrentHolder(member.address) && (
                          <Badge
                            colorScheme="purple"
                            variant="subtle"
                            fontSize="xs"
                          >
                            Current Holder
                          </Badge>
                        )}
                      </HStack>
                      <Text fontSize="xs" color="gray.400">
                        {member.address.slice(0, 6)}...{member.address.slice(-4)}
                      </Text>
                    </HStack>
                  ))
                ) : (
                  <Text fontSize="sm" color="gray.500" p={2}>
                    No matching members found.
                  </Text>
                )}
              </Box>
            )}

            {/* Quick-add current holders if not already candidates */}
            {currentHolders.length > 0 &&
              currentHolders.some(
                (h) =>
                  !candidates.some(
                    (c) =>
                      c.address.toLowerCase() === h.address.toLowerCase()
                  )
              ) && (
                <Box mt={2}>
                  {currentHolders
                    .filter(
                      (h) =>
                        !candidates.some(
                          (c) =>
                            c.address.toLowerCase() ===
                            h.address.toLowerCase()
                        )
                    )
                    .map((holder) => (
                      <Button
                        key={holder.address}
                        size="xs"
                        variant="outline"
                        colorScheme="purple"
                        leftIcon={<FiUserPlus />}
                        onClick={() => handleAddMember(holder)}
                        mr={2}
                        mb={1}
                      >
                        Add {holder.name} (current holder)
                      </Button>
                    ))}
                </Box>
              )}

            {/* Manual Entry Toggle */}
            <Button
              size="xs"
              variant="ghost"
              color="gray.400"
              leftIcon={<AddIcon />}
              onClick={() => setShowManualEntry(!showManualEntry)}
              mt={2}
              _hover={{ color: 'white' }}
            >
              {showManualEntry ? 'Hide manual entry' : 'Add by wallet address'}
            </Button>

            {showManualEntry && (
              <HStack spacing={2} mt={2}>
                <Input
                  placeholder="Name"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  bg="whiteAlpha.100"
                  border="1px solid rgba(148, 115, 220, 0.3)"
                  color="white"
                  size="sm"
                  flex="1"
                  _hover={{ borderColor: 'purple.400' }}
                  _focus={{ borderColor: 'purple.500' }}
                />
                <Input
                  placeholder="0x..."
                  value={manualAddress}
                  onChange={(e) => setManualAddress(e.target.value)}
                  bg="whiteAlpha.100"
                  border="1px solid rgba(148, 115, 220, 0.3)"
                  color="white"
                  size="sm"
                  flex="2"
                  _hover={{ borderColor: 'purple.400' }}
                  _focus={{ borderColor: 'purple.500' }}
                />
                <IconButton
                  icon={<AddIcon />}
                  colorScheme="purple"
                  size="sm"
                  onClick={handleAddManual}
                  isDisabled={
                    !manualName.trim() ||
                    !manualAddress.trim() ||
                    !utils.isAddress(manualAddress.trim())
                  }
                  aria-label="Add candidate"
                />
              </HStack>
            )}
          </Box>

          {/* Candidate List */}
          {candidates.length > 0 && (
            <Box
              p={4}
              bg="rgba(148, 115, 220, 0.05)"
              borderRadius="md"
              border="1px solid rgba(148, 115, 220, 0.2)"
            >
              <Text fontSize="sm" color="gray.300" fontWeight="medium" mb={3}>
                Candidates ({candidates.length})
              </Text>
              <VStack spacing={2} align="stretch">
                {candidates.map((candidate, index) => (
                  <HStack
                    key={candidate.address}
                    justify="space-between"
                    p={2}
                    bg="whiteAlpha.50"
                    borderRadius="md"
                  >
                    <HStack spacing={2}>
                      <Badge colorScheme="purple" variant="subtle">
                        {index + 1}
                      </Badge>
                      <VStack align="start" spacing={0}>
                        <HStack spacing={1}>
                          <Text fontSize="sm" color="white" fontWeight="medium">
                            {candidate.name}
                          </Text>
                          {isCurrentHolder(candidate.address) && (
                            <Badge
                              colorScheme="green"
                              variant="subtle"
                              fontSize="xs"
                            >
                              Incumbent
                            </Badge>
                          )}
                        </HStack>
                        <Text fontSize="xs" color="gray.400">
                          {candidate.address.slice(0, 6)}...
                          {candidate.address.slice(-4)}
                        </Text>
                      </VStack>
                    </HStack>
                    <IconButton
                      icon={<DeleteIcon />}
                      size="xs"
                      colorScheme="red"
                      variant="ghost"
                      onClick={() => handleRemoveCandidate(index)}
                      aria-label="Remove candidate"
                    />
                  </HStack>
                ))}
              </VStack>
            </Box>
          )}

          {candidates.length < 2 && (
            <Text fontSize="xs" color="orange.300">
              Add at least 2 candidates to create an election.
            </Text>
          )}

          {/* Election Preview - shown when >= 2 candidates */}
          {candidates.length >= 2 && (
            <Box
              p={4}
              bg="rgba(66, 153, 225, 0.08)"
              borderRadius="md"
              border="1px solid rgba(66, 153, 225, 0.2)"
            >
              <Text
                fontSize="sm"
                fontWeight="medium"
                color="white"
                mb={3}
              >
                Election Outcomes
              </Text>
              <VStack spacing={2} align="stretch">
                {candidates.map((candidate) => {
                  const candidateIsHolder = isCurrentHolder(candidate.address);
                  const holdersToRevoke = currentHolders.filter(
                    (h) =>
                      h.address.toLowerCase() !==
                      candidate.address.toLowerCase()
                  );

                  return (
                    <Box
                      key={candidate.address}
                      p={2}
                      bg="whiteAlpha.50"
                      borderRadius="md"
                    >
                      <Text
                        fontSize="sm"
                        fontWeight="medium"
                        color="white"
                        mb={1}
                      >
                        If {candidate.name} wins:
                      </Text>
                      {holdersToRevoke.map((h) => (
                        <Text
                          key={h.address}
                          fontSize="xs"
                          color="red.300"
                          pl={2}
                        >
                          - Revoke role from {h.name}
                        </Text>
                      ))}
                      {!candidateIsHolder && (
                        <Text fontSize="xs" color="green.300" pl={2}>
                          - Grant role to {candidate.name}
                        </Text>
                      )}
                      {candidateIsHolder && holdersToRevoke.length === 0 && (
                        <Text fontSize="xs" color="gray.400" pl={2}>
                          - No changes (already holds role)
                        </Text>
                      )}
                    </Box>
                  );
                })}
              </VStack>
            </Box>
          )}

          <Alert
            status="info"
            borderRadius="md"
            bg="rgba(66, 153, 225, 0.15)"
          >
            <AlertIcon color="blue.300" />
            <Text fontSize="sm" color="gray.300">
              When voting ends, the winning candidate&apos;s actions will be
              executed automatically.
            </Text>
          </Alert>
        </>
      )}
    </VStack>
  );
};

export default ElectionConfigurator;
