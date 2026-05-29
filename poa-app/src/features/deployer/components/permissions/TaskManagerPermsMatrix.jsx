/**
 * TaskManagerPermsMatrix - Org-wide TaskManager ROLE_PERM grants
 *
 * Lets the deployer grant each role org-wide TaskManager permissions that are
 * baked into the deploy via OrgDeployer's `taskManagerPerms` field
 * (TaskManager.bootstrapGlobalPerms). Rows = the 8 TaskPerm bits, columns = roles.
 *
 * Notes / contract semantics this UI encodes:
 * - CREATE is granted to every role by default (the deploy uses
 *   roleAssignments.taskCreatorRolesBitmap = all roles), so its checkbox is shown
 *   checked + disabled. buildTaskManagerPerms() re-adds CREATE to every emitted
 *   mask because bootstrapGlobalPerms OVERWRITES the global mask.
 * - EDIT_FULL is a strict superset of EDIT_META: selecting EDIT_FULL implies
 *   EDIT_META (shown checked + disabled); clearing EDIT_META also clears EDIT_FULL.
 * - CLAIM / REVIEW / ASSIGN / SELF_REVIEW / BUDGET / EDIT_* have NO other config
 *   path in the wizard — this matrix is the only way to grant them org-wide.
 */

import React from 'react';
import {
  Box,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Checkbox,
  Text,
  Tooltip,
  Icon,
  HStack,
  VStack,
  Badge,
  useColorModeValue,
} from '@chakra-ui/react';
import { InfoIcon } from '@chakra-ui/icons';
import { useDeployer } from '../../context/DeployerContext';
import { TaskPermission, hasPermission } from '@/util/permissions';

// Column metadata for the 8 TaskPerm bits (matches src/util/permissions.js).
const TASK_PERM_COLUMNS = [
  { key: 'CREATE', bit: TaskPermission.CREATE, label: 'Create', alwaysOn: true,
    description: 'Create tasks. Granted to every role by default.' },
  { key: 'CLAIM', bit: TaskPermission.CLAIM, label: 'Claim',
    description: 'Claim / apply for tasks across the org.' },
  { key: 'REVIEW', bit: TaskPermission.REVIEW, label: 'Review',
    description: 'Complete / review submitted tasks.' },
  { key: 'ASSIGN', bit: TaskPermission.ASSIGN, label: 'Assign',
    description: 'Assign tasks and approve applications.' },
  { key: 'SELF_REVIEW', bit: TaskPermission.SELF_REVIEW, label: 'Self-Review',
    description: 'Allow the claimer to complete their own task.' },
  { key: 'BUDGET', bit: TaskPermission.BUDGET, label: 'Budget',
    description: 'Edit project participation-token cap and bounty caps.' },
  { key: 'EDIT_META', bit: TaskPermission.EDIT_META, label: 'Edit Meta',
    description: 'Edit title / metadata on claimed or submitted tasks.' },
  { key: 'EDIT_FULL', bit: TaskPermission.EDIT_FULL, label: 'Edit Full',
    description: 'Edit everything (payout + bounty + meta) on claimed or submitted tasks. Includes Edit Meta.' },
];

// Bits the user can actually toggle here (everything except always-on CREATE).
const GRANTABLE_BITS = TASK_PERM_COLUMNS.filter((c) => !c.alwaysOn).map((c) => c.bit);

/**
 * Apply a single bit toggle to a mask, honoring EDIT_FULL ⊇ EDIT_META.
 */
function computeNewMask(currentMask, bit, checked) {
  let mask = currentMask & 0xff;
  if (bit === TaskPermission.EDIT_FULL) {
    if (checked) mask |= TaskPermission.EDIT_FULL | TaskPermission.EDIT_META;
    else mask &= ~TaskPermission.EDIT_FULL;
  } else if (bit === TaskPermission.EDIT_META) {
    if (checked) mask |= TaskPermission.EDIT_META;
    else mask &= ~(TaskPermission.EDIT_META | TaskPermission.EDIT_FULL);
  } else if (checked) {
    mask |= bit;
  } else {
    mask &= ~bit;
  }
  // CREATE is always-on at deploy and re-added by buildTaskManagerPerms; never
  // store it here so the map stays minimal.
  mask &= ~TaskPermission.CREATE;
  return mask & 0xff;
}

export function TaskManagerPermsMatrix() {
  const { state, actions } = useDeployer();
  const { roles, taskManagerPerms } = state;

  const headerBg = useColorModeValue('warmGray.50', 'warmGray.700');
  const stickyBg = useColorModeValue('white', 'warmGray.800');
  const hoverBg = useColorModeValue('warmGray.50', 'warmGray.600');

  const maskFor = (roleIdx) => (taskManagerPerms || {})[roleIdx] || 0;

  // Is a perm bit checked for a role (accounting for EDIT_FULL ⊇ EDIT_META)?
  const isChecked = (col, roleIdx) => {
    if (col.alwaysOn) return true; // CREATE
    const mask = maskFor(roleIdx);
    if (col.bit === TaskPermission.EDIT_META) {
      return hasPermission(mask, TaskPermission.EDIT_META) || hasPermission(mask, TaskPermission.EDIT_FULL);
    }
    return hasPermission(mask, col.bit);
  };

  // Disabled cells: CREATE (always on) and EDIT_META when EDIT_FULL implies it.
  const isDisabled = (col, roleIdx) => {
    if (col.alwaysOn) return true;
    if (col.bit === TaskPermission.EDIT_META) {
      return hasPermission(maskFor(roleIdx), TaskPermission.EDIT_FULL);
    }
    return false;
  };

  const handleToggle = (col, roleIdx, checked) => {
    if (col.alwaysOn || isDisabled(col, roleIdx)) return;
    const newMask = computeNewMask(maskFor(roleIdx), col.bit, checked);
    actions.setTaskManagerPerm(roleIdx, newMask);
  };

  // Count of grantable bits set for a role (for the summary badges).
  const grantCount = (roleIdx) => {
    const mask = maskFor(roleIdx);
    return GRANTABLE_BITS.filter((bit) => hasPermission(mask, bit)).length;
  };

  if (!roles || roles.length === 0) {
    return (
      <Box p={6} textAlign="center" borderWidth="2px" borderStyle="dashed" borderColor="warmGray.200" borderRadius="lg">
        <Text color="warmGray.500">No roles defined yet — add roles above first.</Text>
      </Box>
    );
  }

  return (
    <Box overflowX="auto">
      <Table size="sm" variant="simple">
        <Thead>
          <Tr bg={headerBg}>
            <Th position="sticky" left={0} bg={headerBg} zIndex={1}>
              Permission
            </Th>
            {roles.map((role, idx) => (
              <Th key={role.id || idx} textAlign="center" minW="92px">
                <Text fontSize="xs" fontWeight="bold" noOfLines={1}>
                  {role.name || `Role ${idx + 1}`}
                </Text>
              </Th>
            ))}
          </Tr>
        </Thead>
        <Tbody>
          {TASK_PERM_COLUMNS.map((col) => (
            <Tr key={col.key} _hover={{ bg: hoverBg }}>
              <Td position="sticky" left={0} bg={stickyBg} zIndex={1}>
                <HStack spacing={1}>
                  <Text fontSize="sm" fontWeight="medium">{col.label}</Text>
                  <Tooltip label={col.description} hasArrow>
                    <Icon as={InfoIcon} color="warmGray.400" boxSize={3} />
                  </Tooltip>
                  {col.alwaysOn && (
                    <Badge ml={1} fontSize="0.6rem" colorScheme="green" variant="subtle">default</Badge>
                  )}
                </HStack>
              </Td>
              {roles.map((role, roleIdx) => (
                <Td key={role.id || roleIdx} textAlign="center">
                  <Tooltip
                    label={col.alwaysOn ? 'All roles can create tasks by default' :
                      (isDisabled(col, roleIdx) ? 'Included by Edit Full' : undefined)}
                    hasArrow
                    isDisabled={!col.alwaysOn && !isDisabled(col, roleIdx)}
                  >
                    <span>
                      <Checkbox
                        isChecked={isChecked(col, roleIdx)}
                        isDisabled={isDisabled(col, roleIdx)}
                        onChange={(e) => handleToggle(col, roleIdx, e.target.checked)}
                        colorScheme="purple"
                      />
                    </span>
                  </Tooltip>
                </Td>
              ))}
            </Tr>
          ))}
        </Tbody>
      </Table>

      {/* Summary */}
      <Box mt={4} p={3} bg="warmGray.50" borderRadius="md">
        <Text fontSize="sm" fontWeight="medium" mb={2}>Org-wide grants</Text>
        <HStack spacing={3} flexWrap="wrap">
          {roles.map((role, idx) => {
            const count = grantCount(idx);
            return (
              <Badge key={role.id || idx} colorScheme={count === 0 ? 'gray' : 'purple'} px={2} py={1}>
                {role.name || `Role ${idx + 1}`}: {count === 0 ? 'Create only' : `+${count}`}
              </Badge>
            );
          })}
        </HStack>
      </Box>
    </Box>
  );
}

export default TaskManagerPermsMatrix;
