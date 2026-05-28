/**
 * RoleConfigurator
 * Template-style configurator for the `createRole` proposal type.
 * Three-step flow: Basics -> Permissions & Vouching -> Initial Wearers.
 *
 * Builds the same set of role-config fields the deployer wizard collects in
 * RoleForm.jsx, but stored under `proposal.roleConfig` and keyed by on-chain
 * hat IDs (not deployer-array indices). useProposalForm consumes the result
 * at submit time to encode a multi-call batch (createHatWithEligibility +
 * configureVouching + setCreatorHatAllowed + setProjectRolePerm).
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  VStack,
  HStack,
  Box,
  Text,
  Button,
  Input,
  Textarea,
  Select,
  FormControl,
  FormLabel,
  FormHelperText,
  Switch,
  Checkbox,
  Tooltip,
  IconButton,
  InputGroup,
  InputLeftElement,
  Alert,
  AlertIcon,
  Badge,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Icon,
} from '@chakra-ui/react';
import {
  FiChevronRight,
  FiArrowLeft,
  FiSearch,
  FiUserPlus,
} from 'react-icons/fi';
import { AddIcon, DeleteIcon, InfoOutlineIcon } from '@chakra-ui/icons';
import { utils } from 'ethers';
import { inputStyles } from '@/components/shared/glassStyles';

export const TITLE_PREFIX = 'Create role: ';
export const DESCRIPTION_PREFIX = 'New role ';

/**
 * Parse the auto-generated parent name from a createRole proposal title.
 * Auto-title format: "Create role: <name> (under <parentName>)".
 * Returns null when the title doesn't match (manually edited, or no parent yet).
 */
export function parseAutoTitle(title) {
  if (typeof title !== 'string' || !title.startsWith(TITLE_PREFIX)) return null;
  const m = title.slice(TITLE_PREFIX.length).match(/^(.+?) \(under (.+?)\)$/);
  if (!m) return null;
  return { name: m[1], parentName: m[2] };
}

const SENTINEL_SELF_VOUCH = 'self';

const PERM_OPTIONS = [
  { value: 1, label: 'CREATE — Create new tasks' },
  { value: 2, label: 'CLAIM — Claim tasks' },
  { value: 4, label: 'REVIEW — Review completed tasks' },
  { value: 8, label: 'ASSIGN — Assign tasks to others' },
  { value: 16, label: 'SELF_REVIEW — Claimer can complete their own task' },
  { value: 32, label: 'BUDGET — Edit project budgets (PT cap & bounty caps)' },
];

export const defaultRoleConfig = {
  parentHatId: '',
  name: '',
  description: '',
  imageURI: '',
  maxSupply: 100,
  mutable: true,
  defaultEligible: true,
  defaultStanding: true,
  canVote: false,
  vouching: {
    enabled: false,
    quorum: 1,
    voucherHatId: '',
    selfVouch: false,
    combineWithHierarchy: false,
  },
  initialWearers: [],   // [{ address, name, eligible, standing }]
  projectPerms: [],     // [{ projectId, projectName, mask }]
};

/**
 * Build the auto-generated proposal description from the role config.
 * Auto-detection in useProposalForm clears this when the user switches type
 * away from createRole; preserved if the user edited it manually.
 */
function buildRoleDescription(rc) {
  if (!rc?.name) return '';
  const bits = [];
  if (rc.vouching?.enabled) {
    const q = Number(rc.vouching.quorum) || 1;
    bits.push(`vouching required (${q})`);
  } else {
    bits.push('no vouching');
  }
  if (rc.canVote) bits.push('can create proposals');
  const wearerCount = (rc.initialWearers || []).length;
  if (wearerCount > 0) {
    bits.push(`${wearerCount} initial wearer${wearerCount > 1 ? 's' : ''}`);
  }
  return `${DESCRIPTION_PREFIX}"${rc.name}" — ${bits.join(', ')}.`;
}

/**
 * True if the current description is empty or matches our auto-generated
 * prefix. Used to avoid clobbering user-edited descriptions.
 */
function isAutoDescription(description) {
  return !description || description.startsWith(DESCRIPTION_PREFIX);
}

/**
 * Small dashed-box wrapper used for the empty-list states.
 */
const EmptyBox = ({ children }) => (
  <Box
    p={4}
    borderRadius="md"
    border="1px dashed rgba(148, 115, 220, 0.3)"
    bg="whiteAlpha.30"
  >
    <Text fontSize="sm" color="gray.400" textAlign="center">
      {children}
    </Text>
  </Box>
);

const StepHeader = ({ step, title, subtitle, onBack }) => (
  <HStack justify="space-between" align="center">
    <VStack align="start" spacing={0}>
      <Text fontSize="xs" color="purple.300" textTransform="uppercase" letterSpacing="wide">
        Step {step} of 3
      </Text>
      <Text fontSize="md" fontWeight="bold" color="white">{title}</Text>
      {subtitle ? (
        <Text fontSize="xs" color="gray.400">{subtitle}</Text>
      ) : null}
    </VStack>
    {onBack ? (
      <Button
        size="sm"
        variant="ghost"
        leftIcon={<FiArrowLeft />}
        color="gray.300"
        _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
        onClick={onBack}
      >
        Back
      </Button>
    ) : null}
  </HStack>
);

const RoleConfigurator = ({
  proposal,
  onChange,
  allRoles = [],
  allProjects = [],
  leaderboardData = [],
  activeCreateRoleProposals = [],   // optional: [{ parentHatId, name }] from voting page
}) => {
  const rc = proposal.roleConfig || defaultRoleConfig;
  const [step, setStep] = useState(rc.parentHatId ? 2 : 1);
  const [memberSearch, setMemberSearch] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);

  // Merge updates into proposal.roleConfig via the shared setter handler.
  const update = useCallback(
    (changes) => {
      const nextRc = { ...rc, ...changes };
      const updates = { roleConfig: nextRc };

      // Auto-title format: "Create role: <name> (under <parentName>)".
      // The "(under …)" tail is load-bearing: CreateVoteModal parses it to
      // detect concurrent createRole proposals targeting the same parent.
      // Never overwrite a custom-named title (user edits win).
      const parentForTitle = (() => {
        if (!nextRc.parentHatId) return '';
        const r = allRoles.find(x => String(x.hatId) === String(nextRc.parentHatId));
        return r?.name || '';
      })();
      const autoTitle = nextRc.name
        ? (parentForTitle
            ? `${TITLE_PREFIX}${nextRc.name} (under ${parentForTitle})`
            : `${TITLE_PREFIX}${nextRc.name}`)
        : '';
      if (!proposal.name || proposal.name.startsWith(TITLE_PREFIX)) {
        updates.name = autoTitle;
      }
      // Auto-description: same rule.
      if (isAutoDescription(proposal.description)) {
        updates.description = buildRoleDescription(nextRc);
      }
      onChange(updates);
    },
    [rc, proposal.name, proposal.description, onChange, allRoles]
  );

  const updateVouching = useCallback(
    (changes) => update({ vouching: { ...rc.vouching, ...changes } }),
    [update, rc.vouching]
  );

  // Parent-role options. Exclude the top hat (it isn't admin-reachable by the
  // EligibilityModule — see Deployer.sol:421-448). Every other role lives
  // under eligibilityAdminHat, which EligibilityModule wears.
  const parentRoleOptions = useMemo(() => allRoles, [allRoles]);

  const parentRoleName = useMemo(() => {
    if (!rc.parentHatId) return '';
    const r = parentRoleOptions.find(x => String(x.hatId) === String(rc.parentHatId));
    return r?.name || '';
  }, [rc.parentHatId, parentRoleOptions]);

  const voucherRoleName = useMemo(() => {
    if (rc.vouching?.selfVouch) return rc.name || 'this role';
    if (!rc.vouching?.voucherHatId) return '';
    const r = allRoles.find(x => String(x.hatId) === String(rc.vouching.voucherHatId));
    return r?.name || '';
  }, [rc.vouching, rc.name, allRoles]);

  const concurrentProposalForParent = useMemo(() => {
    if (!rc.parentHatId) return null;
    return (activeCreateRoleProposals || []).find(
      p => String(p.parentHatId) === String(rc.parentHatId)
    );
  }, [activeCreateRoleProposals, rc.parentHatId]);

  // Members eligible to be added as initial wearers
  const availableMembers = useMemo(() => {
    const addedAddresses = new Set(
      (rc.initialWearers || []).map(w => w.address.toLowerCase())
    );
    let members = (leaderboardData || []).filter(
      u => u.hasUsername && !addedAddresses.has(u.address.toLowerCase())
    );
    if (memberSearch.trim()) {
      const q = memberSearch.toLowerCase();
      members = members.filter(
        u => u.name.toLowerCase().includes(q) || u.address.toLowerCase().includes(q)
      );
    }
    return members.slice(0, 30);  // cap the list — full list is overwhelming
  }, [leaderboardData, rc.initialWearers, memberSearch]);

  const handleAddMember = useCallback((member) => {
    const lower = member.address.toLowerCase();
    if ((rc.initialWearers || []).some(w => w.address.toLowerCase() === lower)) return;
    update({
      initialWearers: [
        ...(rc.initialWearers || []),
        { address: member.address, name: member.name, eligible: rc.defaultEligible, standing: rc.defaultStanding },
      ],
    });
    setMemberSearch('');
  }, [rc, update]);

  const handleAddManualWearer = useCallback(() => {
    const addr = manualAddress.trim();
    if (!utils.isAddress(addr)) return;
    const lower = addr.toLowerCase();
    if ((rc.initialWearers || []).some(w => w.address.toLowerCase() === lower)) return;
    update({
      initialWearers: [
        ...(rc.initialWearers || []),
        { address: addr, name: manualName.trim() || '', eligible: rc.defaultEligible, standing: rc.defaultStanding },
      ],
    });
    setManualName('');
    setManualAddress('');
    setShowManualEntry(false);
  }, [manualAddress, manualName, rc, update]);

  const handleRemoveWearer = useCallback((idx) => {
    update({ initialWearers: (rc.initialWearers || []).filter((_, i) => i !== idx) });
  }, [rc.initialWearers, update]);

  const handleAddProjectPerm = useCallback(() => {
    update({ projectPerms: [...(rc.projectPerms || []), { projectId: '', projectName: '', mask: 0 }] });
  }, [rc.projectPerms, update]);

  const handleRemoveProjectPerm = useCallback((idx) => {
    update({ projectPerms: (rc.projectPerms || []).filter((_, i) => i !== idx) });
  }, [rc.projectPerms, update]);

  const handleProjectPickerChange = useCallback((idx, projectId) => {
    const project = (allProjects || []).find(p => p.id === projectId);
    const next = [...(rc.projectPerms || [])];
    next[idx] = { ...next[idx], projectId, projectName: project?.name || project?.title || '' };
    update({ projectPerms: next });
  }, [allProjects, rc.projectPerms, update]);

  const handlePermMaskToggle = useCallback((idx, permValue) => {
    const next = [...(rc.projectPerms || [])];
    const current = Number(next[idx]?.mask || 0);
    const flipped = (current & permValue) ? current & ~permValue : current | permValue;
    next[idx] = { ...next[idx], mask: flipped };
    update({ projectPerms: next });
  }, [rc.projectPerms, update]);

  /*════════════════════════════ STEP 1 ════════════════════════════*/
  const renderStep1 = () => (
    <VStack align="stretch" spacing={4}>
      <StepHeader step={1} title="Role basics" subtitle="Name and place in the hierarchy" />

      <FormControl isRequired>
        <FormLabel color="gray.200" fontSize="sm">Role Name</FormLabel>
        <Input
          placeholder="e.g. Treasurer"
          value={rc.name}
          onChange={(e) => update({ name: e.target.value })}
          {...inputStyles}
        />
      </FormControl>

      <FormControl>
        <FormLabel color="gray.200" fontSize="sm">Description (optional)</FormLabel>
        <Textarea
          placeholder="What does this role do?"
          value={rc.description}
          onChange={(e) => update({ description: e.target.value })}
          {...inputStyles}
        />
      </FormControl>

      <FormControl isRequired>
        <FormLabel color="gray.200" fontSize="sm">
          Parent Role
          <Tooltip
            label="Members of the parent role become admins of the new role's wearers — they can revoke or transfer the hat."
            placement="top"
            hasArrow
          >
            <Icon as={InfoOutlineIcon} color="gray.400" boxSize={3} ml={1} mb={0.5} />
          </Tooltip>
        </FormLabel>
        <Select
          placeholder="Select parent role"
          value={rc.parentHatId || ''}
          onChange={(e) => update({ parentHatId: e.target.value })}
          {...inputStyles}
        >
          {parentRoleOptions.map(role => (
            <option key={role.hatId} value={role.hatId} style={{ background: '#1a1a2e' }}>
              {role.name}
            </option>
          ))}
        </Select>
        <FormHelperText color="gray.500">
          The new role becomes a child hat in the Hats tree under this role.
        </FormHelperText>
      </FormControl>

      <HStack spacing={4}>
        <FormControl>
          <FormLabel color="gray.200" fontSize="sm">Max Wearers</FormLabel>
          <NumberInput
            min={1}
            max={4294967295}
            value={rc.maxSupply}
            onChange={(_, value) => update({ maxSupply: Number.isFinite(value) ? value : rc.maxSupply })}
          >
            <NumberInputField {...inputStyles} />
            <NumberInputStepper>
              <NumberIncrementStepper color="gray.300" />
              <NumberDecrementStepper color="gray.300" />
            </NumberInputStepper>
          </NumberInput>
        </FormControl>

        <FormControl>
          <FormLabel color="gray.200" fontSize="sm">Image URL (optional)</FormLabel>
          <Input
            placeholder="https://…"
            value={rc.imageURI}
            onChange={(e) => update({ imageURI: e.target.value })}
            {...inputStyles}
          />
        </FormControl>
      </HStack>

      <HStack justify="space-between">
        <Box>
          <Text color="gray.200" fontSize="sm" fontWeight="medium">Mutable hat</Text>
          <Text color="gray.500" fontSize="xs">Can the hat's details / supply be changed after creation?</Text>
        </Box>
        <Switch
          colorScheme="purple"
          isChecked={Boolean(rc.mutable)}
          onChange={(e) => update({ mutable: e.target.checked })}
        />
      </HStack>

      {concurrentProposalForParent ? (
        <Alert status="warning" borderRadius="md" variant="left-accent">
          <AlertIcon />
          <Box>
            <Text fontSize="sm" fontWeight="bold">
              Concurrent role-creation under the same parent
            </Text>
            <Text fontSize="xs">
              "{concurrentProposalForParent.name || 'Another'}" is already pending under{' '}
              <b>{parentRoleName}</b>. If both votes pass, this proposal may misconfigure the
              new role. Wait for that one to resolve, or pick a different parent.
            </Text>
          </Box>
        </Alert>
      ) : null}

      <HStack justify="flex-end">
        <Button
          rightIcon={<FiChevronRight />}
          colorScheme="purple"
          size="sm"
          isDisabled={!rc.parentHatId || !rc.name?.trim() || Number(rc.maxSupply) < 1}
          onClick={() => setStep(2)}
        >
          Next: Permissions
        </Button>
      </HStack>
    </VStack>
  );

  /*════════════════════════════ STEP 2 ════════════════════════════*/
  const renderStep2 = () => (
    <VStack align="stretch" spacing={4}>
      <StepHeader
        step={2}
        title="Permissions & vouching"
        subtitle="Who can hold the role and what they can do"
        onBack={() => setStep(1)}
      />

      <Box
        p={4}
        borderRadius="md"
        bg="whiteAlpha.50"
        border="1px solid rgba(148, 115, 220, 0.2)"
      >
        <HStack justify="space-between">
          <Box>
            <Text color="gray.200" fontSize="sm" fontWeight="medium">
              Members can create governance proposals
            </Text>
            <Text color="gray.500" fontSize="xs">
              Adds the new role to HybridVoting's creator-hat allowlist.
            </Text>
          </Box>
          <Switch
            colorScheme="purple"
            isChecked={Boolean(rc.canVote)}
            onChange={(e) => update({ canVote: e.target.checked })}
          />
        </HStack>
      </Box>

      <Box
        p={4}
        borderRadius="md"
        bg="whiteAlpha.50"
        border="1px solid rgba(148, 115, 220, 0.2)"
      >
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between">
            <Box>
              <Text color="gray.200" fontSize="sm" fontWeight="medium">Default eligible</Text>
              <Text color="gray.500" fontSize="xs">Wearers start eligible to hold the hat.</Text>
            </Box>
            <Switch
              colorScheme="purple"
              isChecked={Boolean(rc.defaultEligible)}
              onChange={(e) => update({ defaultEligible: e.target.checked })}
            />
          </HStack>
          <HStack justify="space-between">
            <Box>
              <Text color="gray.200" fontSize="sm" fontWeight="medium">Default in good standing</Text>
              <Text color="gray.500" fontSize="xs">Wearers start with good standing flag set.</Text>
            </Box>
            <Switch
              colorScheme="purple"
              isChecked={Boolean(rc.defaultStanding)}
              onChange={(e) => update({ defaultStanding: e.target.checked })}
            />
          </HStack>
        </VStack>
      </Box>

      <Box
        p={4}
        borderRadius="md"
        bg="whiteAlpha.50"
        border="1px solid rgba(148, 115, 220, 0.2)"
      >
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between">
            <Box>
              <Text color="gray.200" fontSize="sm" fontWeight="medium">Enable vouching</Text>
              <Text color="gray.500" fontSize="xs">
                New wearers must collect vouches from a chosen role before claiming.
              </Text>
            </Box>
            <Switch
              colorScheme="purple"
              isChecked={Boolean(rc.vouching?.enabled)}
              onChange={(e) => updateVouching({ enabled: e.target.checked })}
            />
          </HStack>

          {rc.vouching?.enabled ? (
            <VStack align="stretch" spacing={3} pt={2}>
              <FormControl>
                <FormLabel color="gray.200" fontSize="sm">Vouches required (quorum)</FormLabel>
                <NumberInput
                  min={1}
                  max={1000}
                  value={rc.vouching.quorum}
                  onChange={(_, value) => updateVouching({ quorum: Number.isFinite(value) ? value : rc.vouching.quorum })}
                >
                  <NumberInputField {...inputStyles} />
                  <NumberInputStepper>
                    <NumberIncrementStepper color="gray.300" />
                    <NumberDecrementStepper color="gray.300" />
                  </NumberInputStepper>
                </NumberInput>
              </FormControl>

              <FormControl>
                <FormLabel color="gray.200" fontSize="sm">Voucher role</FormLabel>
                <Select
                  value={rc.vouching.selfVouch ? SENTINEL_SELF_VOUCH : (rc.vouching.voucherHatId || '')}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === SENTINEL_SELF_VOUCH) {
                      updateVouching({ selfVouch: true, voucherHatId: '' });
                    } else {
                      updateVouching({ selfVouch: false, voucherHatId: v });
                    }
                  }}
                  placeholder="Select voucher role"
                  {...inputStyles}
                >
                  <option value={SENTINEL_SELF_VOUCH} style={{ background: '#1a1a2e' }}>
                    This role vouches for itself
                  </option>
                  {allRoles.map(role => (
                    <option key={role.hatId} value={role.hatId} style={{ background: '#1a1a2e' }}>
                      {role.name}
                    </option>
                  ))}
                </Select>
                <FormHelperText color="gray.500">
                  Whose vouches count toward the quorum. Self-vouch means existing wearers vouch.
                </FormHelperText>
              </FormControl>

              <HStack justify="space-between">
                <Box>
                  <Text color="gray.200" fontSize="sm" fontWeight="medium">Combine with hierarchy</Text>
                  <Text color="gray.500" fontSize="xs">
                    OR vouching with the existing hat-admin chain (recommended off).
                  </Text>
                </Box>
                <Switch
                  colorScheme="purple"
                  isChecked={Boolean(rc.vouching.combineWithHierarchy)}
                  onChange={(e) => updateVouching({ combineWithHierarchy: e.target.checked })}
                />
              </HStack>
            </VStack>
          ) : null}
        </VStack>
      </Box>

      <Box
        p={4}
        borderRadius="md"
        bg="whiteAlpha.50"
        border="1px solid rgba(148, 115, 220, 0.2)"
      >
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between" align="center">
            <Box>
              <Text color="gray.200" fontSize="sm" fontWeight="medium">Project permissions (optional)</Text>
              <Text color="gray.500" fontSize="xs">
                Grant per-project task permissions to the new role.
              </Text>
            </Box>
            <Button
              size="xs"
              leftIcon={<AddIcon boxSize={2.5} />}
              variant="ghost"
              color="purple.300"
              onClick={handleAddProjectPerm}
              isDisabled={(allProjects || []).length === 0}
            >
              Add project
            </Button>
          </HStack>

          {(rc.projectPerms || []).length === 0 ? (
            <EmptyBox>
              No project permissions configured. Add one to grant task access on a specific project.
            </EmptyBox>
          ) : (
            <VStack align="stretch" spacing={3}>
              {(rc.projectPerms || []).map((p, idx) => (
                <Box
                  key={idx}
                  p={3}
                  borderRadius="md"
                  bg="whiteAlpha.50"
                  border="1px solid rgba(148, 115, 220, 0.15)"
                >
                  <VStack align="stretch" spacing={2}>
                    <HStack>
                      <Select
                        size="sm"
                        value={p.projectId || ''}
                        onChange={(e) => handleProjectPickerChange(idx, e.target.value)}
                        placeholder="Select project"
                        {...inputStyles}
                      >
                        {(allProjects || []).map(proj => (
                          <option key={proj.id} value={proj.id} style={{ background: '#1a1a2e' }}>
                            {proj.name || proj.title || proj.id.slice(0, 10)}
                          </option>
                        ))}
                      </Select>
                      <IconButton
                        aria-label="Remove project permission"
                        icon={<DeleteIcon boxSize={3} />}
                        size="sm"
                        variant="ghost"
                        color="gray.400"
                        _hover={{ color: 'red.300', bg: 'whiteAlpha.100' }}
                        onClick={() => handleRemoveProjectPerm(idx)}
                      />
                    </HStack>
                    <VStack align="stretch" spacing={1} pl={1}>
                      {PERM_OPTIONS.map(opt => {
                        const checked = (Number(p.mask) & opt.value) === opt.value;
                        return (
                          <Checkbox
                            key={opt.value}
                            isChecked={checked}
                            colorScheme="purple"
                            size="sm"
                            onChange={() => handlePermMaskToggle(idx, opt.value)}
                          >
                            <Text fontSize="xs" color="gray.200">{opt.label}</Text>
                          </Checkbox>
                        );
                      })}
                    </VStack>
                  </VStack>
                </Box>
              ))}
            </VStack>
          )}
        </VStack>
      </Box>

      <HStack justify="space-between">
        <Button size="sm" variant="ghost" color="gray.300" onClick={() => setStep(1)}>
          Back
        </Button>
        <Button
          rightIcon={<FiChevronRight />}
          colorScheme="purple"
          size="sm"
          onClick={() => setStep(3)}
        >
          Next: Initial wearers
        </Button>
      </HStack>
    </VStack>
  );

  /*════════════════════════════ STEP 3 ════════════════════════════*/
  const renderStep3 = () => (
    <VStack align="stretch" spacing={4}>
      <StepHeader
        step={3}
        title="Initial wearers"
        subtitle="People who get the role immediately (optional)"
        onBack={() => setStep(2)}
      />

      <InputGroup>
        <InputLeftElement pointerEvents="none">
          <Icon as={FiSearch} color="gray.400" />
        </InputLeftElement>
        <Input
          placeholder="Search members by name or address"
          value={memberSearch}
          onChange={(e) => setMemberSearch(e.target.value)}
          {...inputStyles}
        />
      </InputGroup>

      {availableMembers.length === 0 ? (
        <EmptyBox>
          {memberSearch
            ? 'No members match this search.'
            : 'No members available — try the manual entry option below.'}
        </EmptyBox>
      ) : (
        <VStack align="stretch" spacing={1} maxH="200px" overflowY="auto">
          {availableMembers.map(member => (
            <HStack
              key={member.address}
              p={2}
              borderRadius="md"
              bg="whiteAlpha.50"
              border="1px solid rgba(148, 115, 220, 0.15)"
              justify="space-between"
              cursor="pointer"
              _hover={{ bg: 'whiteAlpha.100', borderColor: 'purple.400' }}
              onClick={() => handleAddMember(member)}
            >
              <VStack align="start" spacing={0}>
                <Text fontSize="sm" color="white" fontWeight="medium">{member.name}</Text>
                <Text fontSize="xs" color="gray.400" fontFamily="mono">
                  {member.address.slice(0, 6)}…{member.address.slice(-4)}
                </Text>
              </VStack>
              <Icon as={FiUserPlus} color="purple.300" />
            </HStack>
          ))}
        </VStack>
      )}

      <Box>
        {showManualEntry ? (
          <VStack
            align="stretch"
            spacing={2}
            p={3}
            borderRadius="md"
            bg="whiteAlpha.50"
            border="1px solid rgba(148, 115, 220, 0.2)"
          >
            <Text fontSize="xs" color="gray.300" fontWeight="medium">Add by address</Text>
            <HStack>
              <Input
                placeholder="Display name (optional)"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                {...inputStyles}
              />
              <Input
                placeholder="0x…"
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                {...inputStyles}
              />
            </HStack>
            <HStack justify="flex-end">
              <Button size="xs" variant="ghost" color="gray.300" onClick={() => {
                setShowManualEntry(false);
                setManualName('');
                setManualAddress('');
              }}>
                Cancel
              </Button>
              <Button
                size="xs"
                colorScheme="purple"
                onClick={handleAddManualWearer}
                isDisabled={!utils.isAddress(manualAddress.trim())}
              >
                Add wearer
              </Button>
            </HStack>
          </VStack>
        ) : (
          <Button
            size="xs"
            leftIcon={<AddIcon boxSize={2.5} />}
            variant="ghost"
            color="purple.300"
            onClick={() => setShowManualEntry(true)}
          >
            Add by address
          </Button>
        )}
      </Box>

      <Box>
        <Text fontSize="xs" color="gray.400" mb={2} textTransform="uppercase" letterSpacing="wide">
          Initial wearers ({(rc.initialWearers || []).length})
        </Text>
        {(rc.initialWearers || []).length === 0 ? (
          <EmptyBox>
            No initial wearers. The role will be created empty — members can be added later via mint proposals or by claiming if vouching is configured.
          </EmptyBox>
        ) : (
          <VStack align="stretch" spacing={1}>
            {(rc.initialWearers || []).map((w, idx) => (
              <HStack
                key={`${w.address}-${idx}`}
                p={2}
                borderRadius="md"
                bg="whiteAlpha.50"
                border="1px solid rgba(148, 115, 220, 0.2)"
                justify="space-between"
              >
                <VStack align="start" spacing={0}>
                  <Text fontSize="sm" color="white" fontWeight="medium">
                    {w.name || 'Unnamed'}
                    <Badge ml={2} colorScheme="purple" fontSize="2xs">wearer</Badge>
                  </Text>
                  <Text fontSize="xs" color="gray.400" fontFamily="mono">
                    {w.address.slice(0, 6)}…{w.address.slice(-4)}
                  </Text>
                </VStack>
                <IconButton
                  aria-label="Remove wearer"
                  icon={<DeleteIcon boxSize={3} />}
                  size="sm"
                  variant="ghost"
                  color="gray.400"
                  _hover={{ color: 'red.300', bg: 'whiteAlpha.100' }}
                  onClick={() => handleRemoveWearer(idx)}
                />
              </HStack>
            ))}
          </VStack>
        )}
      </Box>

      <HStack justify="space-between">
        <Button size="sm" variant="ghost" color="gray.300" onClick={() => setStep(2)}>
          Back
        </Button>
      </HStack>
    </VStack>
  );

  /*════════════════════════════ LIVE PREVIEW ════════════════════════════*/
  const renderPreview = () => {
    if (!rc.name || !rc.parentHatId) return null;
    const lines = [];
    lines.push(
      <Text key="create" fontSize="sm" color="green.300">
        ✓ Create role <b>{rc.name}</b> under <b>{parentRoleName || `hat ${rc.parentHatId.slice?.(0, 8) || rc.parentHatId}`}</b> (max {rc.maxSupply})
      </Text>
    );
    if (rc.vouching?.enabled) {
      const q = Number(rc.vouching.quorum) || 1;
      lines.push(
        <Text key="vouch" fontSize="sm" color="green.300">
          ✓ Require <b>{q}</b> vouch{q > 1 ? 'es' : ''} from <b>{voucherRoleName || 'selected role'}</b> to claim
        </Text>
      );
    }
    if (rc.canVote) {
      lines.push(
        <Text key="canvote" fontSize="sm" color="green.300">
          ✓ Members of <b>{rc.name}</b> can create governance proposals
        </Text>
      );
    }
    const wearerCount = (rc.initialWearers || []).length;
    if (wearerCount > 0) {
      lines.push(
        <Text key="mint" fontSize="sm" color="green.300">
          ✓ Mint to <b>{wearerCount}</b> initial wearer{wearerCount > 1 ? 's' : ''}
        </Text>
      );
    }
    const projectPerms = rc.projectPerms || [];
    if (projectPerms.length > 0) {
      projectPerms.forEach((p, i) => {
        const labels = PERM_OPTIONS
          .filter(opt => (Number(p.mask) & opt.value) === opt.value)
          .map(opt => opt.label.split(' ')[0]);
        if (labels.length > 0) {
          lines.push(
            <Text key={`proj-${i}`} fontSize="sm" color="green.300">
              ✓ Grant <b>{labels.join(', ')}</b> on project <b>{p.projectName || p.projectId?.slice(0, 10)}</b>
            </Text>
          );
        }
      });
    }

    return (
      <Box
        p={4}
        borderRadius="md"
        bg="whiteAlpha.50"
        border="1px solid rgba(56, 178, 172, 0.4)"
      >
        <Text fontSize="xs" color="teal.300" fontWeight="bold" textTransform="uppercase" letterSpacing="wide" mb={2}>
          If this vote passes:
        </Text>
        <VStack align="stretch" spacing={1}>
          {lines}
        </VStack>
      </Box>
    );
  };

  /*════════════════════════════ RENDER ════════════════════════════*/
  return (
    <VStack align="stretch" spacing={5}>
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {renderPreview()}
    </VStack>
  );
};

export default RoleConfigurator;
