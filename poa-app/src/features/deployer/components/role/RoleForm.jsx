/**
 * RoleForm - Complete form for creating/editing a role
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  FormControl,
  FormLabel,
  FormHelperText,
  FormErrorMessage,
  Input,
  Textarea,
  Switch,
  Select,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Button,
  Divider,
  Text,
  Heading,
  Collapse,
  useDisclosure,
  Alert,
  AlertIcon,
  Checkbox,
  Tooltip,
  Icon,
  IconButton,
} from '@chakra-ui/react';
import { InfoIcon, ChevronDownIcon, ChevronUpIcon, AddIcon, CloseIcon } from '@chakra-ui/icons';
import { useDeployer } from '../../context/DeployerContext';
import NativeMembershipFields from '@/features/deployer/components/role/NativeMembershipFields';

export function RoleForm({
  role,
  roleIndex,
  onSave,
  onCancel,
  isNew = false,
}) {
  const { state } = useDeployer();
  const [formData, setFormData] = useState({ ...role });
  const [errors, setErrors] = useState({});

  // Collapsible sections
  const advancedDisclosure = useDisclosure();



  // Update form field
  const updateField = (path, value) => {
    setFormData(prev => {
      const newData = { ...prev };
      const keys = path.split('.');
      let current = newData;

      for (let i = 0; i < keys.length - 1; i++) {
        current[keys[i]] = { ...current[keys[i]] };
        current = current[keys[i]];
      }

      current[keys[keys.length - 1]] = value;

      // Turning vouching on forces the role closed by default: a default-eligible
      // hat satisfies eligibility for everyone, so the vouch quorum would be a
      // no-op — and the contracts now reject the pair outright (EligibilityModule
      // M-03 at deploy, QuickJoin H-03 at claim). Turning it back OFF leaves the
      // eligibility switch where it is; "closed, admin-granted only" is a valid
      // role and this control shouldn't silently reopen it.
      if (path === 'vouching.enabled' && value) {
        newData.open = false;
      }

      return newData;
    });

    // Clear error for this field
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[path];
      return newErrors;
    });
  };

  // Validate form
  const validate = () => {
    const newErrors = {};

    if (!formData.name || formData.name.trim() === '') {
      newErrors.name = 'Role name is required';
    }

    // Check for duplicate names
    const duplicateName = state.roles.some((r, idx) =>
      idx !== roleIndex && r.name.toLowerCase() === formData.name?.toLowerCase()
    );
    if (duplicateName) {
      newErrors.name = 'Role name must be unique';
    }

    // Validate vouching
    if (formData.vouching.enabled) {
      if (formData.vouching.quorum <= 0) {
        newErrors['vouching.quorum'] = 'Quorum must be at least 1';
      }
      if (formData.vouching.voucherRoleIndex < 0 || formData.vouching.voucherRoleIndex >= state.roles.length) {
        newErrors['vouching.voucherRoleIndex'] = 'Select a valid voucher role';
      }
    }

    // Validate hat config
    if (formData.maxMembers < 0) {
      newErrors.maxMembers = 'Maximum members must be zero or greater';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle save
  const handleSave = () => {
    if (validate()) {
      onSave(formData);
    }
  };

  return (
    <Box>
      <VStack spacing={5} align="stretch">
        {/* Basic Info */}
        <Box>
          <Heading size="sm" mb={3}>Basic Information</Heading>

          <VStack spacing={4} align="stretch">
            <FormControl isInvalid={!!errors.name} isRequired>
              <FormLabel>Role Name</FormLabel>
              <Input
                value={formData.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="e.g., Member, Executive, Manager"
              />
              <FormErrorMessage>{errors.name}</FormErrorMessage>
            </FormControl>

            <FormControl>
              <FormLabel>Description</FormLabel>
              <Textarea
                value={formData.description || ''}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Describe the responsibilities and purpose of this role..."
                rows={3}
              />
              <FormHelperText>A brief description of this role's purpose and responsibilities</FormHelperText>
            </FormControl>

            <FormControl>
              <FormLabel>Role Image URL</FormLabel>
              <Input
                value={formData.image}
                onChange={(e) => updateField('image', e.target.value)}
                placeholder="https://..."
              />
              <FormHelperText>Optional image URL for the role</FormHelperText>
            </FormControl>

            <FormControl display="flex" alignItems="center">
              <FormLabel mb={0}>Can Vote</FormLabel>
              <Switch
                isChecked={formData.canVote}
                onChange={(e) => updateField('canVote', e.target.checked)}
                colorScheme="green"
              />
              <Tooltip label="Members with this role can participate in governance votes">
                <Icon as={InfoIcon} ml={2} color="warmGray.400" />
              </Tooltip>
            </FormControl>
          </VStack>
        </Box>

        <Divider />

        <NativeMembershipFields role={formData} roles={state.roles} onChange={setFormData} />
        <Divider />

        {/* Advanced Settings */}
        <Box>
          <HStack justify="space-between" mb={3} cursor="pointer" onClick={advancedDisclosure.onToggle}>
            <Heading size="sm">Advanced Settings</Heading>
            <Icon as={advancedDisclosure.isOpen ? ChevronUpIcon : ChevronDownIcon} />
          </HStack>

          <Collapse in={advancedDisclosure.isOpen}>
            <VStack spacing={4} align="stretch" pl={4} borderLeft="2px solid" borderColor="warmGray.200">
              <FormControl isInvalid={!!errors.maxMembers}>
                <FormLabel>Maximum members (0 means unlimited)</FormLabel>
                <NumberInput value={formData.maxMembers} min={0} max={4294967295}
                  onChange={(_, value) => updateField('maxMembers', value)}>
                  <NumberInputField />
                </NumberInput>
                <FormErrorMessage>{errors.maxMembers}</FormErrorMessage>
              </FormControl>

              {/* Distribution */}
              <Heading size="xs" color="warmGray.600" mt={2}>Initial Distribution</Heading>

              <HStack spacing={8}>
                <FormControl display="flex" alignItems="center">
                  <FormLabel mb={0} fontSize="sm">Assign to Me</FormLabel>
                  <Switch
                    isChecked={formData.distribution.mintToDeployer}
                    onChange={(e) => updateField('distribution.mintToDeployer', e.target.checked)}
                    size="sm"
                    colorScheme="green"
                  />
                  <Tooltip label="You will receive this role when the org is deployed">
                    <Icon as={InfoIcon} ml={2} color="warmGray.400" boxSize={3} />
                  </Tooltip>
                </FormControl>

              </HStack>

              {/* Additional Members by Username */}
              <FormControl mt={4}>
                <FormLabel fontSize="sm">
                  Additional Members
                  <Tooltip label="Enter usernames of people who should receive this role when the org is deployed. Usernames must be registered in the system.">
                    <Icon as={InfoIcon} ml={2} color="warmGray.400" boxSize={3} />
                  </Tooltip>
                </FormLabel>
                <VStack align="stretch" spacing={2}>
                  {(formData.distribution.additionalWearerUsernames || []).map((username, idx) => (
                    <HStack key={idx}>
                      <Input
                        size="sm"
                        value={username}
                        onChange={(e) => {
                          const current = [...(formData.distribution.additionalWearerUsernames || [])];
                          current[idx] = e.target.value;
                          updateField('distribution.additionalWearerUsernames', current);
                        }}
                        placeholder="Enter username"
                      />
                      <IconButton
                        size="sm"
                        icon={<CloseIcon boxSize={2} />}
                        onClick={() => {
                          const current = formData.distribution.additionalWearerUsernames || [];
                          updateField('distribution.additionalWearerUsernames',
                            current.filter((_, i) => i !== idx));
                        }}
                        aria-label="Remove member"
                        variant="ghost"
                        colorScheme="red"
                      />
                    </HStack>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<AddIcon boxSize={2} />}
                    onClick={() => {
                      const current = formData.distribution.additionalWearerUsernames || [];
                      updateField('distribution.additionalWearerUsernames', [...current, '']);
                    }}
                    alignSelf="flex-start"
                  >
                    Add Member
                  </Button>
                </VStack>
                <FormHelperText fontSize="xs">
                  These users will receive this role when the org is deployed
                </FormHelperText>
              </FormControl>
            </VStack>
          </Collapse>
        </Box>

        {/* Action Buttons */}
        <HStack justify="flex-end" spacing={3} pt={4}>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button colorScheme="blue" onClick={handleSave}>
            {isNew ? 'Add Role' : 'Save Changes'}
          </Button>
        </HStack>
      </VStack>
    </Box>
  );
}

export default RoleForm;
