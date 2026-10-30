/**
 * PermissionsMatrix - Polished table showing role permissions
 */

import React, { useState } from 'react';
import { usePOContext } from '@/context/POContext';
import { DEFAULT_TOKEN_LABEL } from '@/util/tokenLabel';
import {
  Box,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Text,
  Icon,
  Tooltip,
  Skeleton,
  HStack,
  VStack,
  Divider,
  Collapse,
} from '@chakra-ui/react';
import {
  FiCheck,
  FiHelpCircle,
  FiMinus,
  FiUserPlus,
  FiDollarSign,
  FiCheckCircle,
  FiBook,
  FiBookOpen,
  FiFileText,
  FiThumbsUp,
  FiPlusSquare,
  FiChevronDown,
  FiClipboard,
  FiTarget,
  FiEye,
  FiUserCheck,
  FiRotateCw,
  FiEdit2,
  FiEdit3,
  FiBriefcase,
  FiFolderPlus,
} from 'react-icons/fi';

/**
 * Icon mapping for permission types
 */
const PERMISSION_ICONS = {
  QuickJoin_Member: FiUserPlus,
  ParticipationToken_Member: FiDollarSign,
  ParticipationToken_Approver: FiCheckCircle,
  EducationHub_Creator: FiBook,
  EducationHub_Member: FiBookOpen,
  HybridVoting_Creator: FiFileText,
  HybridVoting_Voter: FiThumbsUp,
  DirectDemocracyVoting_Creator: FiPlusSquare,
  DirectDemocracyVoting_Voter: FiThumbsUp,
  Executor_Voter: FiThumbsUp,
  // TaskManager project-creator hats (taskManager.creatorHatIds) — distinct from TaskPerm bits
  TaskManager_CreateProject: FiFolderPlus,
  // TaskManager TaskPerm bits (v4 added Budget, v5 added EditMeta + EditFull)
  TaskManager_Create: FiClipboard,
  TaskManager_Claim: FiTarget,
  TaskManager_Review: FiEye,
  TaskManager_Assign: FiUserCheck,
  TaskManager_SelfReview: FiRotateCw,
  TaskManager_Budget: FiBriefcase,
  TaskManager_EditMeta: FiEdit3,
  TaskManager_EditFull: FiEdit2,
};

/**
 * Short labels for column headers
 */
const SHORT_LABELS = {
  QuickJoin_Member: 'Join',
  ParticipationToken_Approver: 'Approve',
  EducationHub_Creator: 'Edu Create',
  EducationHub_Member: 'Edu Access',
  HybridVoting_Creator: 'Proposal',
  HybridVoting_Voter: 'Vote',
  DirectDemocracyVoting_Creator: 'Poll Create',
  DirectDemocracyVoting_Voter: 'Poll Vote',
  Executor_Voter: 'Execute',
  TaskManager_CreateProject: 'Create Project',
  TaskManager_Create: 'Task Create',
  TaskManager_Claim: 'Task Claim',
  TaskManager_Review: 'Task Review',
  TaskManager_Assign: 'Task Assign',
  TaskManager_SelfReview: 'Self-Review',
  TaskManager_Budget: 'Task Budget',
  TaskManager_EditMeta: 'Edit Meta',
  TaskManager_EditFull: 'Edit Full',
};

/**
 * Full descriptions for tooltips
 */
const FULL_DESCRIPTIONS = {
  QuickJoin_Member: 'Receive this role when joining the organization, subject to its joining requirements.',
  HybridVoting_Creator: 'Submit binding governance proposals: change org rules, transfer treasury, assign roles, etc.',
  DirectDemocracyVoting_Creator: 'Start a non-binding community poll — one member, one vote — for sentiment decisions.',
  Executor_Voter: 'Carry out proposals that have passed voting, such as payments or role changes.',
  TaskManager_CreateProject: 'Create new projects in the task manager. Project creators automatically become a manager of the projects they create, which lets them run tasks inside those projects regardless of the per-task grants below.',
  TaskManager_Create: 'Create new tasks. Individual projects may have different permissions.',
  TaskManager_Claim: 'Claim or apply for tasks (org-wide).',
  TaskManager_Review: 'Approve or reject submitted tasks.',
  TaskManager_Assign: 'Assign tasks to a member or approve task applications.',
  TaskManager_SelfReview: 'Allow the claimer to complete their own task (bypasses the standard "no self-review" rule).',
  TaskManager_Budget: 'Edit a project’s rewards and payment budgets.',
  TaskManager_EditMeta: 'Edit a task’s title and details after it has been claimed or submitted.',
  TaskManager_EditFull: 'Edit a task’s details and rewards, including after it has been claimed or submitted.',
};

const permissionState = allowed => allowed === 'inherited' ? 'Inherited from a group'
  : allowed === true ? 'Allowed' : allowed === false ? 'Not allowed' : 'Permission unavailable';

function columnLabel(col, tokenLabel) {
  return col.key === 'ParticipationToken_Member' ? tokenLabel : SHORT_LABELS[col.key] || col.permissionRole;
}

function columnDescription(col, tokenLabel) {
  if (col.key === 'ParticipationToken_Member') return `Request and hold ${tokenLabel} for tasks and contributions.`;
  if (col.key === 'ParticipationToken_Approver') return `Review and approve member requests for ${tokenLabel}.`;
  if (col.key === 'EducationHub_Creator') return `Publish learning modules with rewards in ${tokenLabel}.`;
  if (col.key === 'EducationHub_Member') return `Complete learning modules and earn rewards in ${tokenLabel}.`;
  if (col.key === 'HybridVoting_Voter') return `Vote on binding decisions. Voting power combines member voice with ${tokenLabel}.`;
  if (col.key === 'DirectDemocracyVoting_Voter') return `Vote in community polls. Each member has one vote, regardless of ${tokenLabel} held.`;
  return FULL_DESCRIPTIONS[col.key] || col.label;
}

function PermissionIndicator({ allowed }) {
  const label = permissionState(allowed);
  const unknown = allowed !== true && allowed !== false && allowed !== 'inherited';
  return (
    <Tooltip label={label} shouldWrapChildren>
      <Icon as={unknown ? FiHelpCircle : allowed === false ? FiMinus : FiCheck}
        aria-label={label} color={unknown ? 'warmGray.500' : allowed === 'inherited' ? 'purple.300' : allowed ? 'green.500' : 'warmGray.300'}
        boxSize={5} />
    </Tooltip>
  );
}

function PermissionCell({ allowed }) {
  return <Td textAlign="center" py={3}><PermissionIndicator allowed={allowed} /></Td>;
}

function MobilePermissionRow({ col, allowed, isOpen, onToggle, tokenLabel }) {
  const IconComponent = PERMISSION_ICONS[col.key] || FiCheck;
  const shortLabel = columnLabel(col, tokenLabel);
  const description = columnDescription(col, tokenLabel);

  return (
    <Box>
      <Box
        as="button"
        type="button"
        w="100%"
        py={3}
        px={3}
        textAlign="left"
        _hover={{ bg: 'warmGray.50' }}
        _active={{ bg: 'warmGray.100' }}
        transition="background-color 0.15s"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={`${shortLabel}: ${permissionState(allowed)}`}
      >
        <HStack justify="space-between" spacing={3}>
          <HStack spacing={3} minW={0}>
            <Icon as={IconComponent} boxSize={4} color="amethyst.500" flexShrink={0} />
            <Text fontSize="sm" color="warmGray.800" noOfLines={1}>
              {shortLabel}
            </Text>
          </HStack>
          <HStack spacing={2} flexShrink={0}>
            <PermissionIndicator allowed={allowed} />
            <Icon
              as={FiChevronDown}
              boxSize={4}
              color="warmGray.400"
              transform={isOpen ? 'rotate(180deg)' : 'rotate(0deg)'}
              transition="transform 0.2s"
            />
          </HStack>
        </HStack>
      </Box>
      <Collapse in={isOpen} animateOpacity>
        <Box pl={10} pr={3} pb={3}>
          <Text fontSize="xs" color="warmGray.600">
            {description}
          </Text>
        </Box>
      </Collapse>
    </Box>
  );
}

function MobileRoleCard({ role, permissionColumns, rolePermissions, tokenLabel }) {
  const [openKey, setOpenKey] = useState(null);

  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor="warmGray.100"
      borderRadius="xl"
      overflow="hidden"
      boxShadow="0 2px 4px rgba(0, 0, 0, 0.04)"
    >
      <HStack
        px={4}
        py={3}
        bg="warmGray.50"
        borderBottom="1px solid"
        borderColor="warmGray.100"
        spacing={2}
      >
        <Text fontWeight="semibold" color="warmGray.900">
          {role.name}
        </Text>
        <Text color="warmGray.400" fontSize="xs">
          ({role.memberCount ?? '—'})
        </Text>
      </HStack>
      <VStack
        spacing={0}
        align="stretch"
        py={1}
        px={1}
        divider={<Divider borderColor="warmGray.100" />}
      >
        {permissionColumns.map((col) => (
          <MobilePermissionRow
            key={col.key}
            col={col}
            tokenLabel={tokenLabel}
            allowed={rolePermissions[col.key]}
            isOpen={openKey === col.key}
            onToggle={() =>
              setOpenKey((prev) => (prev === col.key ? null : col.key))
            }
          />
        ))}
      </VStack>
    </Box>
  );
}

export function PermissionsMatrix({
  roles = [],
  permissionsMatrix = {},
  permissionColumns = [],
  loading = false,
}) {
  const { tokenLabel = DEFAULT_TOKEN_LABEL } = usePOContext();
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
        <Skeleton height="200px" borderRadius="xl" />
      </Box>
    );
  }

  if (roles.length === 0 || permissionColumns.length === 0) {
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
        <Text color="warmGray.500">No permission details to show</Text>
      </Box>
    );
  }

  return (
    <Box
      bg="rgba(255, 255, 255, 0.8)"
      border="1px solid"
      borderColor="warmGray.200"
      borderRadius="2xl"
      overflow="hidden"
      boxShadow="0 4px 24px rgba(0, 0, 0, 0.06)"
    >
      <Box display={{ base: 'block', md: 'none' }} p={3}>
        <VStack spacing={3} align="stretch">
          {roles.map((role) => (
            <MobileRoleCard
              key={role.id || role.hatId}
              role={role}
              tokenLabel={tokenLabel}
              permissionColumns={permissionColumns}
              rolePermissions={permissionsMatrix[role.hatId] || {}}
            />
          ))}
        </VStack>
      </Box>
      <Box display={{ base: 'none', md: 'block' }} overflowX="auto">
        <Table
          variant="unstyled"
          size="sm"
          sx={{
            'th, td': {
              borderBottom: '1px solid var(--chakra-colors-warmGray-100)',
            },
            'tbody tr:nth-of-type(even)': {
              backgroundColor: 'var(--chakra-colors-warmGray-50)',
            },
            'tbody tr': {
              transition: 'background-color 0.2s',
              _hover: {
                backgroundColor: 'var(--chakra-colors-amethyst-50)',
              },
            },
          }}
        >
          <Thead>
            <Tr>
              <Th
                color="warmGray.600"
                textTransform="none"
                fontSize="sm"
                fontWeight="semibold"
                py={4}
                px={4}
                position="sticky"
                left={0}
                bg="rgba(255, 255, 255, 0.95)"
                zIndex={1}
                minW="150px"
              >
                Role
              </Th>
              {permissionColumns.map((col) => {
                const IconComponent = PERMISSION_ICONS[col.key] || FiCheck;
                const shortLabel = columnLabel(col, tokenLabel);
                const description = columnDescription(col, tokenLabel);

                return (
                  <Th
                    key={col.key}
                    textAlign="center"
                    color="warmGray.600"
                    textTransform="none"
                    fontSize="xs"
                    fontWeight="semibold"
                    py={4}
                    px={3}
                    minW="80px"
                  >
                    <Tooltip label={description} placement="top">
                      <HStack justify="center" spacing={1}>
                        <Icon as={IconComponent} boxSize={4} color="amethyst.500" />
                        <Text display={{ base: 'none', md: 'block' }}>
                          {shortLabel}
                        </Text>
                      </HStack>
                    </Tooltip>
                  </Th>
                );
              })}
            </Tr>
          </Thead>

          <Tbody>
            {roles.map((role) => {
              const rolePermissions = permissionsMatrix[role.hatId] || {};

              return (
                <Tr key={role.id || role.hatId}>
                  <Td
                    fontWeight="medium"
                    color="warmGray.900"
                    py={3}
                    px={4}
                    position="sticky"
                    left={0}
                    bg="rgba(255, 255, 255, 0.95)"
                    zIndex={1}
                  >
                    <HStack spacing={2}>
                      <Text>{role.name}</Text>
                      <Text color="warmGray.400" fontSize="xs">
                        ({role.memberCount ?? '—'})
                      </Text>
                    </HStack>
                  </Td>
                  {permissionColumns.map((col) => (
                    <PermissionCell
                      key={col.key}
                      allowed={rolePermissions[col.key]}
                    />
                  ))}
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </Box>
    </Box>
  );
}

export default PermissionsMatrix;
