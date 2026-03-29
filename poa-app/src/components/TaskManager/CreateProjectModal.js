import React, { useState, useEffect, useMemo } from 'react';
import {
  Button,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  ModalFooter,
  VStack,
  HStack,
  Textarea,
  Text,
  Box,
  Divider,
  Tooltip,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  IconButton,
  Tag,
  TagLabel,
  TagCloseButton,
  Wrap,
  WrapItem,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Switch,
  Checkbox,
  useToast,
} from '@chakra-ui/react';
import { AddIcon, InfoIcon } from '@chakra-ui/icons';
import { ethers } from 'ethers';
import { resolveUsernames } from '@/features/deployer/utils/usernameResolver';
import { getBountyTokenOptions } from '../../util/tokens';
import { usePOContext } from '../../context/POContext';

/**
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {Function} props.onClose
 * @param {Function} props.onCreateProject
 * @param {string[]} props.roleHatIds - All org role hat IDs
 * @param {Object} props.roleNames - Map of hatId -> role name
 * @param {string[]} props.creatorHatIds - Hat IDs that can create projects
 */
const CreateProjectModal = ({ isOpen, onClose, onCreateProject, roleHatIds = [], roleNames = {}, creatorHatIds = [] }) => {
  const toast = useToast();
  const { orgChainId } = usePOContext();
  const [loading, setLoading] = useState(false);

  // Basic fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Token cap (0 = unlimited)
  const [hasCap, setHasCap] = useState(false);
  const [cap, setCap] = useState('');

  // Bounty budgets: array of { token, cap, isUnlimited } objects
  const [bountyBudgets, setBountyBudgets] = useState([]);
  const availableTokens = useMemo(() => getBountyTokenOptions(orgChainId), [orgChainId]);

  // Additional managers - stores { address, displayName } objects
  const [managers, setManagers] = useState([]);
  const [newManager, setNewManager] = useState('');
  const [isAddingManager, setIsAddingManager] = useState(false);

  // Role-based permissions: sets of hatIds that have each permission
  const [createRoles, setCreateRoles] = useState(new Set());
  const [claimRoles, setClaimRoles] = useState(new Set());
  const [reviewRoles, setReviewRoles] = useState(new Set());
  const [assignRoles, setAssignRoles] = useState(new Set());

  // Compute smart defaults when modal opens
  useEffect(() => {
    if (isOpen && roleHatIds.length > 0) {
      const creatorSet = new Set(creatorHatIds.map(String));

      // CREATE: roles in creatorHatIds (they can create projects, so they should create tasks)
      // If no creatorHatIds, fall back to non-member roles (index 1+)
      let defaultCreate;
      if (creatorSet.size > 0) {
        defaultCreate = new Set(roleHatIds.filter(id => creatorSet.has(String(id))));
      } else {
        defaultCreate = new Set(roleHatIds.slice(1));
      }
      // If still empty, give all roles create permission
      if (defaultCreate.size === 0) defaultCreate = new Set(roleHatIds);

      // CLAIM: all roles
      const defaultClaim = new Set(roleHatIds);

      // REVIEW: same as create (trusted roles review work)
      const defaultReview = new Set(defaultCreate);

      // ASSIGN: same as create
      const defaultAssign = new Set(defaultCreate);

      setCreateRoles(defaultCreate);
      setClaimRoles(defaultClaim);
      setReviewRoles(defaultReview);
      setAssignRoles(defaultAssign);
    }
  }, [isOpen, roleHatIds, creatorHatIds]);

  const getRoleName = (hatId) => {
    return roleNames[hatId] || roleNames[String(hatId)] || `Role ${hatId.toString().slice(-6)}`;
  };

  const toggleRole = (hatId, setter) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(hatId)) {
        next.delete(hatId);
      } else {
        next.add(hatId);
      }
      return next;
    });
  };

  // Supports both usernames and addresses
  const handleAddManager = async () => {
    const input = newManager.trim();
    if (!input) return;

    setIsAddingManager(true);

    try {
      let address, displayName;

      // Check if input is already a valid address
      if (ethers.utils.isAddress(input)) {
        address = input;
        displayName = `${input.slice(0, 6)}...${input.slice(-4)}`;
      } else {
        // Try to resolve as username
        const { resolved, notFound } = await resolveUsernames([input]);

        if (notFound.length > 0 || !resolved.has(input.toLowerCase())) {
          toast({
            title: 'User Not Found',
            description: `No user found with username "${input}". Please check the spelling or use a wallet address.`,
            status: 'error',
            duration: 4000,
          });
          setIsAddingManager(false);
          return;
        }

        address = resolved.get(input.toLowerCase());
        displayName = input; // Keep username as display name
      }

      // Check for duplicates
      if (managers.some(m => m.address.toLowerCase() === address.toLowerCase())) {
        toast({
          title: 'Duplicate',
          description: 'This user is already added as a manager',
          status: 'warning',
          duration: 3000,
        });
        setIsAddingManager(false);
        return;
      }

      setManagers([...managers, { address, displayName }]);
      setNewManager('');
    } catch (error) {
      console.error('Error adding manager:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add manager',
        status: 'error',
        duration: 3000,
      });
    } finally {
      setIsAddingManager(false);
    }
  };

  const handleRemoveManager = (address) => {
    setManagers(managers.filter(m => m.address !== address));
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setHasCap(false);
    setCap('');
    setBountyBudgets([]);
    setManagers([]);
    setNewManager('');
    // Permission sets are re-populated by useEffect on next open
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({
        title: 'Name Required',
        description: 'Please enter a project name',
        status: 'error',
        duration: 3000,
      });
      return;
    }

    // Validate bounty budgets: each enabled token must have a cap or be unlimited
    for (const b of bountyBudgets) {
      const tokenInfo = availableTokens.find(t => t.address === b.token);
      if (!b.isUnlimited && (!b.cap || Number(b.cap) <= 0)) {
        toast({
          title: 'Bounty Cap Required',
          description: `Please set a spending cap for ${tokenInfo?.symbol || 'token'} or mark it as unlimited.`,
          status: 'error',
          duration: 3000,
        });
        return;
      }
      // Contract enforces MAX_PAYOUT = 1e24 wei (1M tokens at 18 decimals)
      if (!b.isUnlimited) {
        const decimals = tokenInfo?.decimals || 18;
        const capWei = ethers.utils.parseUnits(b.cap.toString(), decimals);
        const MAX_PAYOUT = ethers.BigNumber.from('1000000000000000000000000'); // 1e24
        if (capWei.gt(MAX_PAYOUT)) {
          toast({
            title: 'Cap Too Large',
            description: `${tokenInfo?.symbol || 'Token'} cap exceeds the maximum of ${(1e24 / Math.pow(10, decimals)).toLocaleString()} ${tokenInfo?.symbol || 'tokens'}. Use unlimited for no cap.`,
            status: 'error',
            duration: 5000,
          });
          return;
        }
      }
    }

    setLoading(true);

    try {
      // Convert cap to wei if set
      let capWei = 0;
      if (hasCap && cap) {
        capWei = ethers.utils.parseUnits(cap.toString(), 18);
      }

      // Build bounty token arrays from configured budgets
      // UNLIMITED = type(uint128).max = 2^128 - 1
      const UNLIMITED = ethers.BigNumber.from('340282366920938463463374607431768211455');
      const bountyTokenAddrs = bountyBudgets.map(b => b.token);
      const bountyCapsWei = bountyBudgets.map(b => {
        if (b.isUnlimited) return UNLIMITED;
        const tokenInfo = availableTokens.find(t => t.address === b.token);
        const decimals = tokenInfo?.decimals || 18;
        return ethers.utils.parseUnits(b.cap.toString(), decimals);
      });

      await onCreateProject({
        name: name.trim(),
        description: description.trim(),
        cap: capWei,
        managers: managers.map(m => m.address),
        createHats: Array.from(createRoles).map(String),
        claimHats: Array.from(claimRoles).map(String),
        reviewHats: Array.from(reviewRoles).map(String),
        assignHats: Array.from(assignRoles).map(String),
        bountyTokens: bountyTokenAddrs,
        bountyCaps: bountyCapsWei,
      });

      handleClose();
    } catch (error) {
      console.error('Error creating project:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create project',
        status: 'error',
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  const permissionConfig = [
    { label: 'Create Tasks', description: 'Create and manage tasks in this project', set: createRoles, setter: setCreateRoles, color: 'green' },
    { label: 'Claim Tasks', description: 'Pick up and work on tasks', set: claimRoles, setter: setClaimRoles, color: 'blue' },
    { label: 'Review Tasks', description: 'Approve or reject submitted work', set: reviewRoles, setter: setReviewRoles, color: 'orange' },
    { label: 'Assign Tasks', description: 'Assign tasks to specific members', set: assignRoles, setter: setAssignRoles, color: 'purple' },
  ];

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="lg" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Create Project</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            {/* Basic Info */}
            <FormControl isRequired>
              <FormLabel>Project Name</FormLabel>
              <Input
                placeholder="Enter project name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </FormControl>

            <FormControl>
              <FormLabel>Description (Optional)</FormLabel>
              <Textarea
                placeholder="Describe the project..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </FormControl>

            <Divider />

            {/* Token Cap */}
            <FormControl>
              <HStack justify="space-between">
                <HStack spacing={1}>
                  <FormLabel mb={0}>Token Budget Cap</FormLabel>
                  <Tooltip label="Set a maximum amount of participation tokens this project can allocate to tasks. Leave unchecked for unlimited." placement="top">
                    <InfoIcon color="gray.400" boxSize={3} />
                  </Tooltip>
                </HStack>
                <Switch
                  isChecked={hasCap}
                  onChange={(e) => setHasCap(e.target.checked)}
                  colorScheme="purple"
                />
              </HStack>
            </FormControl>

            {hasCap && (
              <Box w="100%" p={3} bg="gray.50" borderRadius="md">
                <FormControl>
                  <FormLabel fontSize="sm">Maximum Token Budget</FormLabel>
                  <NumberInput
                    value={cap}
                    onChange={(value) => setCap(value)}
                    min={0}
                  >
                    <NumberInputField placeholder="e.g., 10000" />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                  <Text fontSize="xs" color="gray.500" mt={1}>
                    Total participation tokens that can be allocated to tasks in this project
                  </Text>
                </FormControl>
              </Box>
            )}

            <Divider />

            {/* Bounty Token Budgets */}
            {availableTokens.length > 0 && (
              <>
                <FormControl>
                  <HStack spacing={1} mb={2}>
                    <FormLabel mb={0}>Bounty Token Budgets</FormLabel>
                    <Tooltip label="Enable ERC-20 tokens for bounty payments on tasks in this project. Each token needs a spending cap." placement="top">
                      <InfoIcon color="gray.400" boxSize={3} />
                    </Tooltip>
                  </HStack>
                  <Text fontSize="xs" color="gray.500" mb={3}>
                    Tasks can only use bounty tokens that are enabled here.
                  </Text>

                  <VStack spacing={2} align="stretch">
                    {availableTokens.map((token) => {
                      const budget = bountyBudgets.find(b => b.token === token.address);
                      const isEnabled = !!budget;

                      return (
                        <Box key={token.address} p={3} bg="gray.50" borderRadius="md">
                          <HStack justify="space-between" mb={isEnabled ? 2 : 0}>
                            <HStack spacing={2}>
                              <Text fontSize="sm" fontWeight="600">{token.symbol}</Text>
                              <Text fontSize="xs" color="gray.500">{token.name}</Text>
                            </HStack>
                            <Switch
                              isChecked={isEnabled}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setBountyBudgets(prev => [...prev, { token: token.address, cap: '', isUnlimited: false }]);
                                } else {
                                  setBountyBudgets(prev => prev.filter(b => b.token !== token.address));
                                }
                              }}
                              colorScheme="teal"
                              size="sm"
                            />
                          </HStack>

                          {isEnabled && (
                            <HStack spacing={3}>
                              <Checkbox
                                size="sm"
                                isChecked={budget.isUnlimited}
                                onChange={(e) => {
                                  setBountyBudgets(prev => prev.map(b =>
                                    b.token === token.address ? { ...b, isUnlimited: e.target.checked } : b
                                  ));
                                }}
                                colorScheme="teal"
                              >
                                <Text fontSize="xs">Unlimited</Text>
                              </Checkbox>
                              {!budget.isUnlimited && (
                                <NumberInput
                                  size="sm"
                                  value={budget.cap}
                                  onChange={(value) => {
                                    setBountyBudgets(prev => prev.map(b =>
                                      b.token === token.address ? { ...b, cap: value } : b
                                    ));
                                  }}
                                  min={0}
                                  flex={1}
                                >
                                  <NumberInputField placeholder={`Max ${token.symbol}`} />
                                </NumberInput>
                              )}
                            </HStack>
                          )}
                        </Box>
                      );
                    })}
                  </VStack>
                </FormControl>

                <Divider />
              </>
            )}

            {/* Advanced Settings */}
            <Accordion allowToggle>
              <AccordionItem border="none">
                <AccordionButton px={0}>
                  <Box flex="1" textAlign="left" fontWeight="medium">
                    Advanced Settings
                  </Box>
                  <AccordionIcon />
                </AccordionButton>
                <AccordionPanel pb={4} px={0}>
                  <VStack spacing={4} align="stretch">
                    {/* Additional Managers */}
                    <FormControl>
                      <HStack spacing={1} mb={2}>
                        <FormLabel mb={0}>Additional Managers</FormLabel>
                        <Tooltip label="Add other users that can manage this project. Managers bypass all role permission checks." placement="top">
                          <InfoIcon color="gray.400" boxSize={3} />
                        </Tooltip>
                      </HStack>
                      <HStack>
                        <Input
                          placeholder="Username or 0x... address"
                          value={newManager}
                          onChange={(e) => setNewManager(e.target.value)}
                          size="sm"
                          onKeyPress={(e) => e.key === 'Enter' && !isAddingManager && handleAddManager()}
                        />
                        <IconButton
                          aria-label="Add manager"
                          icon={<AddIcon />}
                          size="sm"
                          colorScheme="purple"
                          onClick={handleAddManager}
                          isLoading={isAddingManager}
                        />
                      </HStack>
                      {managers.length > 0 && (
                        <Wrap mt={2}>
                          {managers.map((manager) => (
                            <WrapItem key={manager.address}>
                              <Tooltip label={manager.address} placement="top">
                                <Tag size="sm" colorScheme="purple" borderRadius="full">
                                  <TagLabel>{manager.displayName}</TagLabel>
                                  <TagCloseButton onClick={() => handleRemoveManager(manager.address)} />
                                </Tag>
                              </Tooltip>
                            </WrapItem>
                          ))}
                        </Wrap>
                      )}
                    </FormControl>

                    <Divider />

                    {/* Role Permissions */}
                    <Box>
                      <HStack spacing={1} mb={3}>
                        <Text fontWeight="medium">Role Permissions</Text>
                        <Tooltip label="Choose which roles can perform each action in this project. Defaults are based on your org's configuration." placement="top">
                          <InfoIcon color="gray.400" boxSize={3} />
                        </Tooltip>
                      </HStack>

                      {roleHatIds.length > 0 ? (
                        <VStack spacing={3} align="stretch">
                          {permissionConfig.map(({ label, description: desc, set, setter, color }) => (
                            <Box key={label} p={3} bg="gray.50" borderRadius="md" borderLeft="3px solid" borderLeftColor={`${color}.400`}>
                              <Text fontSize="sm" fontWeight="600" color="gray.700" mb={0.5}>{label}</Text>
                              <Text fontSize="xs" color="gray.500" mb={2}>{desc}</Text>
                              <Wrap spacing={3}>
                                {roleHatIds.map((hatId) => (
                                  <WrapItem key={hatId}>
                                    <Checkbox
                                      size="sm"
                                      colorScheme={color}
                                      isChecked={set.has(hatId)}
                                      onChange={() => toggleRole(hatId, setter)}
                                    >
                                      <Text fontSize="sm">{getRoleName(hatId)}</Text>
                                    </Checkbox>
                                  </WrapItem>
                                ))}
                              </Wrap>
                            </Box>
                          ))}
                        </VStack>
                      ) : (
                        <Text fontSize="sm" color="gray.500">
                          Organization roles are still loading...
                        </Text>
                      )}
                    </Box>
                  </VStack>
                </AccordionPanel>
              </AccordionItem>
            </Accordion>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={handleClose}>
            Cancel
          </Button>
          <Button
            colorScheme="purple"
            onClick={handleSubmit}
            isLoading={loading}
            loadingText="Creating..."
          >
            Create Project
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default CreateProjectModal;
