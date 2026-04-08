/**
 * PermissionsMatrix - Polished table showing role permissions
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
  Text,
  Icon,
  Tooltip,
  Skeleton,
  HStack,
} from '@chakra-ui/react';
import {
  FiCheck,
  FiMinus,
  FiUserPlus,
  FiDollarSign,
  FiCheckCircle,
  FiBook,
  FiBookOpen,
  FiFileText,
  FiThumbsUp,
  FiPlusSquare,
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
};

/**
 * Short labels for column headers
 */
const SHORT_LABELS = {
  QuickJoin_Member: 'Join',
  ParticipationToken_Member: 'Shares',
  ParticipationToken_Approver: 'Approve',
  EducationHub_Creator: 'Edu Create',
  EducationHub_Member: 'Edu Access',
  HybridVoting_Creator: 'Proposal',
  HybridVoting_Voter: 'Vote',
  DirectDemocracyVoting_Creator: 'Poll Create',
  DirectDemocracyVoting_Voter: 'Poll Vote',
  Executor_Voter: 'Execute',
};

/**
 * Full descriptions for tooltips
 */
const FULL_DESCRIPTIONS = {
  QuickJoin_Member: 'Can quick join the organization',
  ParticipationToken_Member: 'Can earn and hold shares',
  ParticipationToken_Approver: 'Can approve share requests',
  EducationHub_Creator: 'Can create education modules',
  EducationHub_Member: 'Can access education content',
  HybridVoting_Creator: 'Can create hybrid voting proposals',
  HybridVoting_Voter: 'Can vote on hybrid proposals',
  DirectDemocracyVoting_Creator: 'Can create direct democracy polls',
  DirectDemocracyVoting_Voter: 'Can vote on direct democracy polls',
  Executor_Voter: 'Can execute approved proposals',
};

function PermissionCell({ allowed }) {
  return (
    <Td textAlign="center" py={3}>
      {allowed ? (
        <Icon
          as={FiCheck}
          color="green.500"
          boxSize={5}
          bg="green.50"
          p={1}
          borderRadius="md"
        />
      ) : (
        <Icon
          as={FiMinus}
          color="warmGray.300"
          boxSize={5}
        />
      )}
    </Td>
  );
}

export function PermissionsMatrix({
  roles = [],
  permissionsMatrix = {},
  permissionColumns = [],
  loading = false,
}) {
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
        <Text color="warmGray.500">No permissions configured</Text>
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
      <Box overflowX="auto">
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
                const shortLabel = SHORT_LABELS[col.key] || col.permissionRole;
                const description = FULL_DESCRIPTIONS[col.key] || col.label;

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
                        ({role.memberCount})
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
