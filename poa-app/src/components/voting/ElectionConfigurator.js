/**
 * ElectionConfigurator
 * Template-style election configuration component with guided flow.
 * Select Role -> Select Incumbents at Stake -> Add Candidates -> Preview.
 *
 * Key concept: a hat (e.g. "Executive") may be held by many people with
 * different actual roles (VP, Treasurer, etc.). The user picks which specific
 * incumbent(s) will lose the hat if they don't win the election — not all
 * holders automatically.
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
  Checkbox,
  Select,
} from '@chakra-ui/react';
import {
  FiChevronRight,
  FiArrowLeft,
  FiSearch,
  FiUserPlus,
} from 'react-icons/fi';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import { utils } from 'ethers';

const inputStyles = {
  bg: 'whiteAlpha.100',
  border: '1px solid',
  borderColor: 'whiteAlpha.300',
  color: 'white',
  _placeholder: { color: 'gray.400' },
  _hover: { borderColor: 'whiteAlpha.400' },
  _focus: {
    borderColor: 'purple.400',
    boxShadow: '0 0 0 1px var(--chakra-colors-purple-400)',
  },
};

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

  // All holders of the selected hat (for display / selection)
  const allHolders = proposal.electionCurrentHolders || [];

  // Only the incumbents the user selected to be at stake
  const selectedIncumbents = proposal.electionSelectedIncumbents || [];

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

    // Sort: selected incumbents first, then other holders, then everyone else
    const incumbentAddresses = new Set(selectedIncumbents.map(h => h.address.toLowerCase()));
    const holderAddresses = new Set(allHolders.map(h => h.address.toLowerCase()));
    members.sort((a, b) => {
      const aScore = incumbentAddresses.has(a.address.toLowerCase()) ? 0
        : holderAddresses.has(a.address.toLowerCase()) ? 1 : 2;
      const bScore = incumbentAddresses.has(b.address.toLowerCase()) ? 0
        : holderAddresses.has(b.address.toLowerCase()) ? 1 : 2;
      return aScore - bScore;
    });

    return members;
  }, [leaderboardData, proposal.electionCandidates, searchQuery, allHolders, selectedIncumbents]);

  // Check if a candidate is a selected incumbent (hat at stake)
  const isSelectedIncumbent = useCallback(
    (address) =>
      selectedIncumbents.some(h => h.address.toLowerCase() === address.toLowerCase()),
    [selectedIncumbents]
  );

  // Check if an address holds the hat at all
  const isCurrentHolder = useCallback(
    (address) =>
      allHolders.some(h => h.address.toLowerCase() === address.toLowerCase()),
    [allHolders]
  );

  // Fallback role options (exclude the elected role)
  const fallbackRoleOptions = useMemo(() => {
    if (!proposal.electionRoleId) return [];
    return allRoles.filter(r => String(r.hatId) !== String(proposal.electionRoleId));
  }, [allRoles, proposal.electionRoleId]);

  // Fallback role display name for preview
  const fallbackRoleName = useMemo(() => {
    if (!proposal.electionFallbackRoleId) return '';
    const role = allRoles.find(r => String(r.hatId) === String(proposal.electionFallbackRoleId));
    return role?.name || '';
  }, [proposal.electionFallbackRoleId, allRoles]);

  // Handle fallback role selection
  const handleFallbackRoleChange = useCallback((e) => {
    const fallbackHatId = e.target.value;
    if (!fallbackHatId) {
      onChange({ electionFallbackRoleId: '', electionFallbackHolders: [] });
      return;
    }
    // Pre-compute which addresses currently hold the fallback hat
    const holders = getCurrentHolders(fallbackHatId, leaderboardData);
    const holderAddresses = holders.map(h => h.address);
    onChange({
      electionFallbackRoleId: fallbackHatId,
      electionFallbackHolders: holderAddresses,
    });
  }, [onChange, leaderboardData]);

  // Handle role selection (step 1 -> 2)
  const handleRoleSelect = useCallback(
    (role) => {
      const holders = getCurrentHolders(role.hatId, leaderboardData);
      const updates = {
        electionRoleId: role.hatId,
        electionCurrentHolders: holders,
        electionSelectedIncumbents: [],
        electionCandidates: [],
        electionFallbackRoleId: '',
        electionFallbackHolders: [],
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

  // Toggle an incumbent's selection (whose hat is at stake)
  const handleToggleIncumbent = useCallback(
    (holder) => {
      const current = proposal.electionSelectedIncumbents || [];
      const isSelected = current.some(
        h => h.address.toLowerCase() === holder.address.toLowerCase()
      );

      const updated = isSelected
        ? current.filter(h => h.address.toLowerCase() !== holder.address.toLowerCase())
        : [...current, { name: holder.name, address: holder.address }];

      onChange({ electionSelectedIncumbents: updated });
    },
    [onChange, proposal.electionSelectedIncumbents]
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
        electionSelectedIncumbents: [],
        electionFallbackRoleId: '',
        electionFallbackHolders: [],
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

      {/* Step 2: Configure Incumbents & Candidates */}
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

          {/* Incumbent Selection — pick which holders' hats are at stake */}
          {allHolders.length > 0 && (
            <Box
              p={3}
              bg="whiteAlpha.50"
              borderRadius="md"
              border="1px solid rgba(148, 115, 220, 0.3)"
            >
              <Text fontSize="sm" color="gray.300" fontWeight="medium" mb={1}>
                Select who is up for election
              </Text>
              <Text fontSize="xs" color="gray.500" mb={3}>
                Only selected holders will lose the hat if they don&apos;t win.
                Other holders are unaffected.
              </Text>
              <VStack spacing={2} align="stretch">
                {allHolders.map((holder) => {
                  const checked = selectedIncumbents.some(
                    h => h.address.toLowerCase() === holder.address.toLowerCase()
                  );
                  return (
                    <HStack
                      key={holder.address}
                      spacing={3}
                      p={2}
                      bg={checked ? 'rgba(148, 115, 220, 0.15)' : 'whiteAlpha.50'}
                      borderRadius="md"
                      cursor="pointer"
                      onClick={() => handleToggleIncumbent(holder)}
                      _hover={{ bg: checked ? 'rgba(148, 115, 220, 0.2)' : 'whiteAlpha.100' }}
                      transition="background 0.15s"
                    >
                      <Checkbox
                        isChecked={checked}
                        onChange={() => handleToggleIncumbent(holder)}
                        colorScheme="purple"
                        size="sm"
                      />
                      <Badge colorScheme="purple" variant="subtle" fontSize="xs">
                        Holder
                      </Badge>
                      <Text fontSize="sm" color="white">
                        {holder.name}
                      </Text>
                      <Text fontSize="xs" color="gray.400">
                        {holder.address.slice(0, 6)}...{holder.address.slice(-4)}
                      </Text>
                    </HStack>
                  );
                })}
              </VStack>
            </Box>
          )}

          {/* Info when no holders exist */}
          {allHolders.length === 0 && (
            <Alert
              status="info"
              borderRadius="md"
              bg="rgba(66, 153, 225, 0.15)"
            >
              <AlertIcon color="blue.300" />
              <Text fontSize="sm" color="gray.300">
                No one currently holds this role. The winner will be granted
                the hat.
              </Text>
            </Alert>
          )}

          {/* Warning about selected incumbents */}
          {selectedIncumbents.length > 0 && (
            <Alert
              status="warning"
              borderRadius="md"
              bg="rgba(236, 201, 75, 0.15)"
            >
              <AlertIcon color="yellow.300" />
              <Text fontSize="sm" color="yellow.200">
                {selectedIncumbents.length === 1
                  ? `${selectedIncumbents[0].name} will lose the hat if they don't win.`
                  : `${selectedIncumbents.length} selected holders will lose the hat if they don't win.`}
                {' '}Add them as candidates if they should be eligible to keep it.
              </Text>
            </Alert>
          )}

          {/* Fallback Role for Losers — only show when incumbents are selected */}
          {selectedIncumbents.length > 0 && fallbackRoleOptions.length > 0 && (
            <Box
              p={3}
              bg="rgba(66, 153, 225, 0.08)"
              borderRadius="md"
              border="1px solid rgba(66, 153, 225, 0.2)"
            >
              <Text fontSize="sm" color="gray.300" fontWeight="medium" mb={1}>
                Fallback role for losers (optional)
              </Text>
              <Text fontSize="xs" color="gray.500" mb={2}>
                Losing incumbents will be granted this role instead of being
                removed entirely.
              </Text>
              <Select
                placeholder="None — just revoke hat"
                value={proposal.electionFallbackRoleId || ''}
                onChange={handleFallbackRoleChange}
                size="sm"
                {...inputStyles}
              >
                {fallbackRoleOptions.map(role => (
                  <option key={role.hatId} value={role.hatId} style={{ background: '#1a1a2e' }}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </Box>
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
                {...inputStyles}
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
                        {isSelectedIncumbent(member.address) && (
                          <Badge
                            colorScheme="orange"
                            variant="subtle"
                            fontSize="xs"
                          >
                            At Stake
                          </Badge>
                        )}
                        {!isSelectedIncumbent(member.address) && isCurrentHolder(member.address) && (
                          <Badge
                            colorScheme="purple"
                            variant="subtle"
                            fontSize="xs"
                          >
                            Holder
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

            {/* Quick-add selected incumbents as candidates if not already added */}
            {selectedIncumbents.length > 0 &&
              selectedIncumbents.some(
                (h) =>
                  !candidates.some(
                    (c) =>
                      c.address.toLowerCase() === h.address.toLowerCase()
                  )
              ) && (
                <Box mt={2}>
                  {selectedIncumbents
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
                        Add {holder.name} (incumbent)
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
                  size="sm"
                  flex="1"
                  {...inputStyles}
                />
                <Input
                  placeholder="0x..."
                  value={manualAddress}
                  onChange={(e) => setManualAddress(e.target.value)}
                  size="sm"
                  flex="2"
                  {...inputStyles}
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
              bg="whiteAlpha.50"
              borderRadius="md"
              border="1px solid rgba(148, 115, 220, 0.3)"
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
                          {isSelectedIncumbent(candidate.address) && (
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
                  const candidateIsIncumbent = isSelectedIncumbent(candidate.address);
                  // Only revoke from selected incumbents who aren't this candidate
                  const incumbentsToRevoke = selectedIncumbents.filter(
                    (h) =>
                      h.address.toLowerCase() !==
                      candidate.address.toLowerCase()
                  );
                  // Mint hat if candidate doesn't already hold it
                  const candidateAlreadyHolds = isCurrentHolder(candidate.address);

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
                      {incumbentsToRevoke.map((h) => {
                        const alreadyHoldsFallback = proposal.electionFallbackRoleId &&
                          (proposal.electionFallbackHolders || []).some(
                            addr => addr.toLowerCase() === h.address.toLowerCase()
                          );
                        return (
                          <React.Fragment key={h.address}>
                            <Text
                              fontSize="xs"
                              color="red.300"
                              pl={2}
                            >
                              - Revoke {selectedRoleName} from {h.name}
                            </Text>
                            {proposal.electionFallbackRoleId && (
                              <Text
                                fontSize="xs"
                                color={alreadyHoldsFallback ? 'gray.400' : 'blue.300'}
                                pl={2}
                              >
                                - {alreadyHoldsFallback
                                    ? `${h.name} already holds ${fallbackRoleName}`
                                    : `Grant ${fallbackRoleName} to ${h.name}`}
                              </Text>
                            )}
                          </React.Fragment>
                        );
                      })}
                      {!candidateAlreadyHolds && (
                        <Text fontSize="xs" color="green.300" pl={2}>
                          - Grant hat to {candidate.name}
                        </Text>
                      )}
                      {candidateIsIncumbent && incumbentsToRevoke.length === 0 && (
                        <Text fontSize="xs" color="gray.400" pl={2}>
                          - No changes (keeps existing hat)
                        </Text>
                      )}
                      {candidateAlreadyHolds && !candidateIsIncumbent && incumbentsToRevoke.length === 0 && (
                        <Text fontSize="xs" color="gray.400" pl={2}>
                          - No changes (already holds hat)
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
