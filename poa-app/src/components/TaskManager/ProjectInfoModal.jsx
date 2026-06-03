/**
 * ProjectInfoModal
 *
 * The project "info" view opened from the ⓘ button in ProjectHeader. A light, tabbed
 * overview of the selected project:
 *   - Overview   : activity stats, completion progress, status breakdown, description
 *   - Permissions: per-role task permissions (reuses the /team PermissionsMatrix)
 *   - Budget     : share cap + bounty token budgets + permission-gated "Edit budget"
 *
 * All data comes from `project` (the transformed selectedProject) plus the org `roles`
 * from useOrgStructure — no extra subgraph query is issued just to open this modal.
 */

import { useMemo } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Box,
  Flex,
  HStack,
  VStack,
  Text,
  SimpleGrid,
  Icon,
  Button,
  Image,
  Link,
  Progress,
  Divider,
} from '@chakra-ui/react';
import { ExternalLinkIcon, EditIcon } from '@chakra-ui/icons';
import { FiClipboard, FiCheckCircle, FiUsers, FiAward, FiCalendar } from 'react-icons/fi';

import { PermissionsMatrix } from '@/components/orgStructure';
import { useOrgStructure } from '@/hooks';
import { lightCardStyle } from '@/components/shared/glassStyles';
import { formatTokenAmount } from '@/util/formatToken';
import { getTokenByAddress } from '@/util/tokens';
import {
  buildProjectPermissionColumns,
  buildProjectPermissionsMatrix,
  deriveProjectStats,
} from '@/util/projectPermissions';

const norm = (h) => String(h ?? '').trim();

// Status columns surfaced as pills on the Overview tab, in board order.
const STATUS_PILLS = [
  { id: 'open', label: 'Open', color: 'coral' },
  { id: 'inProgress', label: 'In Progress', color: 'amethyst' },
  { id: 'inReview', label: 'In Review', color: 'rose' },
  { id: 'completed', label: 'Completed', color: 'green' },
];

/** Light stat card: icon + label over a large value, optional helptext. */
function StatCard({ icon, label, value, helpText, accent = 'amethyst.500' }) {
  return (
    <Box {...lightCardStyle} p={4}>
      <HStack spacing={2} mb={1} color="warmGray.500">
        <Icon as={icon} boxSize={4} color={accent} />
        <Text fontSize="xs" fontWeight="semibold" textTransform="uppercase" letterSpacing="wide" noOfLines={1}>
          {label}
        </Text>
      </HStack>
      <Text fontSize="2xl" fontWeight="bold" color="warmGray.900" lineHeight="1.1">
        {value}
      </Text>
      {helpText && (
        <Text fontSize="xs" color="warmGray.500" mt={1}>
          {helpText}
        </Text>
      )}
    </Box>
  );
}

/** Rounded count pill with a colored status dot. */
function StatusPill({ label, count, color }) {
  return (
    <HStack
      spacing={2}
      px={3}
      py={1.5}
      borderRadius="full"
      bg={`${color}.50`}
      border="1px solid"
      borderColor={`${color}.100`}
    >
      <Box w={2} h={2} borderRadius="full" bg={`${color}.400`} />
      <Text fontSize="sm" color="warmGray.700">
        {label}
      </Text>
      <Text fontSize="sm" fontWeight="bold" color="warmGray.900">
        {count}
      </Text>
    </HStack>
  );
}

/** Circular fallback when a bounty token has no logo. */
function TokenDot({ symbol }) {
  return (
    <Box
      w="22px"
      h="22px"
      borderRadius="full"
      bg="warmGray.200"
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      <Text fontSize="xs" fontWeight="bold" color="warmGray.600">
        {(symbol || '?').charAt(0)}
      </Text>
    </Box>
  );
}

const sectionLabelProps = {
  fontSize: 'xs',
  fontWeight: 'semibold',
  textTransform: 'uppercase',
  letterSpacing: 'wide',
  color: 'warmGray.500',
};

const ProjectInfoModal = ({
  isOpen,
  onClose,
  project,
  projectName,
  tokenLabel = 'Shares',
  canEditBudget = false,
  onEditBudget,
}) => {
  // Org roles supply hatId -> name for the permissions matrix. cache-first query, so it's
  // cheap on repeat; only runs because this modal is conditionally mounted when opened.
  const { roles = [], loading: orgLoading } = useOrgStructure();

  const stats = useMemo(() => deriveProjectStats(project, { tokenLabel }), [project, tokenLabel]);
  const permissionColumns = useMemo(() => buildProjectPermissionColumns(), []);
  const { permissionsMatrix, rolesWithGrants, hasAnyGrant, overrideHatIds } = useMemo(
    () =>
      buildProjectPermissionsMatrix({
        roles,
        rolePermissions: project?.rolePermissions,
        globalRolePermissions: project?.globalRolePermissions,
      }),
    [roles, project?.rolePermissions, project?.globalRolePermissions],
  );

  const overrideNote = useMemo(() => {
    if (!overrideHatIds || overrideHatIds.size === 0) return '';
    return roles
      .filter((r) => overrideHatIds.has(norm(r.hatId)))
      .map((r) => r.name)
      .join(', ');
  }, [overrideHatIds, roles]);

  const createdLabel = useMemo(() => {
    const ts = parseInt(stats.createdAt, 10);
    if (!Number.isFinite(ts) || ts <= 0) return '';
    return new Date(ts * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, [stats.createdAt]);

  const description = project?.description || '';
  const projectBudget = formatTokenAmount(project?.cap || '0');
  const bountyCaps = project?.bountyCaps || [];
  const hasNoBudget = projectBudget === '0' && bountyCaps.length === 0;

  const tabProps = {
    fontWeight: '600',
    color: 'warmGray.500',
    _selected: { color: 'coral.600', borderColor: 'coral.500' },
    _hover: { color: 'warmGray.700' },
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size={{ base: 'full', md: '4xl' }} isCentered scrollBehavior="inside">
      <ModalOverlay bg="blackAlpha.600" />
      <ModalContent
        bg="white"
        color="warmGray.900"
        borderRadius={{ base: 0, md: '2xl' }}
        border="1px solid"
        borderColor="warmGray.100"
        boxShadow="0 12px 48px rgba(0, 0, 0, 0.18)"
        overflow="hidden"
      >
        <ModalHeader pb={2}>
          <VStack align="start" spacing={0}>
            <Text fontSize="xl" fontWeight="bold" color="warmGray.900" noOfLines={2}>
              {projectName}
            </Text>
            <Text fontSize="sm" color="warmGray.500">
              Project overview
            </Text>
          </VStack>
        </ModalHeader>
        <ModalCloseButton color="warmGray.500" />

        <ModalBody pb={6} pt={0}>
          <Tabs variant="line" colorScheme="coral" isFitted>
            <TabList borderColor="warmGray.200" mb={5}>
              <Tab {...tabProps}>Overview</Tab>
              <Tab {...tabProps}>Permissions</Tab>
              <Tab {...tabProps}>Budget</Tab>
            </TabList>

            <TabPanels>
              {/* ---------------- Overview ---------------- */}
              <TabPanel px={0} pt={0} minH={{ base: 'auto', md: '440px' }}>
                <VStack align="stretch" spacing={5}>
                  <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
                    <StatCard
                      icon={FiClipboard}
                      label="Tasks"
                      value={stats.totalTasks}
                      accent="amethyst.500"
                      helpText={stats.totalTasks === 0 ? 'No tasks yet' : undefined}
                    />
                    <StatCard
                      icon={FiCheckCircle}
                      label="Completed"
                      value={stats.completed}
                      accent="green.500"
                      helpText={`of ${stats.totalTasks} · ${stats.completionPct}%`}
                    />
                    <StatCard icon={FiUsers} label="Contributors" value={stats.contributors} accent="coral.500" />
                    <StatCard
                      icon={FiAward}
                      label={`${tokenLabel} paid`}
                      value={stats.ptPaidOut}
                      accent="rose.500"
                    />
                  </SimpleGrid>

                  <Box>
                    <HStack justify="space-between" mb={1.5}>
                      <Text {...sectionLabelProps}>Completion</Text>
                      <Text fontSize="xs" color="warmGray.500">
                        {stats.completed}/{stats.totalTasks}
                      </Text>
                    </HStack>
                    <Progress
                      value={stats.completionPct}
                      size="sm"
                      borderRadius="full"
                      colorScheme="amethyst"
                      bg="warmGray.100"
                    />
                  </Box>

                  <Flex wrap="wrap" gap={2}>
                    {STATUS_PILLS.map((p) => (
                      <StatusPill key={p.id} label={p.label} count={stats[p.id]} color={p.color} />
                    ))}
                  </Flex>

                  {createdLabel && (
                    <HStack spacing={2} color="warmGray.500">
                      <Icon as={FiCalendar} boxSize={4} />
                      <Text fontSize="sm">Created {createdLabel}</Text>
                    </HStack>
                  )}

                  <Divider borderColor="warmGray.100" />

                  <Box>
                    <Text {...sectionLabelProps} mb={2}>
                      Description
                    </Text>
                    {description ? (
                      <Text color="warmGray.700" whiteSpace="pre-wrap" lineHeight="1.6">
                        {description}
                      </Text>
                    ) : (
                      <Text color="warmGray.400" fontStyle="italic">
                        No description available for this project.
                      </Text>
                    )}
                  </Box>
                </VStack>
              </TabPanel>

              {/* ---------------- Permissions ---------------- */}
              <TabPanel px={0} pt={0} minH={{ base: 'auto', md: '440px' }}>
                <VStack align="stretch" spacing={3}>
                  <Text fontSize="sm" color="warmGray.600">
                    What each role can do in this project. Roles with no grants are hidden.
                  </Text>

                  {orgLoading ? (
                    <PermissionsMatrix loading />
                  ) : hasAnyGrant ? (
                    <>
                      <PermissionsMatrix
                        roles={rolesWithGrants}
                        permissionsMatrix={permissionsMatrix}
                        permissionColumns={permissionColumns}
                        loading={false}
                      />
                      {overrideNote && (
                        <HStack spacing={2} align="start" color="warmGray.500" fontSize="xs">
                          <Box mt="3px" w={2} h={2} borderRadius="full" bg="amethyst.400" flexShrink={0} />
                          <Text>
                            Project-specific overrides: {overrideNote}. Other roles inherit the
                            organization&apos;s global grants.
                          </Text>
                        </HStack>
                      )}
                    </>
                  ) : (
                    <Box {...lightCardStyle} p={6} textAlign="center">
                      <Text color="warmGray.500">
                        No role permissions are configured for this project yet. Task actions fall
                        back to the organization&apos;s global grants.
                      </Text>
                    </Box>
                  )}
                </VStack>
              </TabPanel>

              {/* ---------------- Budget ---------------- */}
              <TabPanel px={0} pt={0} minH={{ base: 'auto', md: '440px' }}>
                <VStack align="stretch" spacing={4}>
                  <Box {...lightCardStyle} p={4}>
                    <Flex justify="space-between" align="start" gap={3}>
                      <Box>
                        <Text {...sectionLabelProps} mb={1}>
                          Share budget
                        </Text>
                        {projectBudget !== '0' ? (
                          <Text fontSize="lg" fontWeight="bold" color="warmGray.900">
                            {projectBudget} {tokenLabel.toLowerCase()}
                          </Text>
                        ) : (
                          <Text color="warmGray.400" fontStyle="italic">
                            No share budget
                          </Text>
                        )}
                        {projectBudget !== '0' && stats.ptPaidOutNum > 0 && (
                          <Text fontSize="xs" color="warmGray.500" mt={1}>
                            {stats.ptPaidOut} {tokenLabel.toLowerCase()} paid out so far
                          </Text>
                        )}
                      </Box>
                      {canEditBudget && (
                        <Button size="sm" leftIcon={<EditIcon />} variant="primary" onClick={onEditBudget} flexShrink={0}>
                          Edit budget
                        </Button>
                      )}
                    </Flex>
                  </Box>

                  {bountyCaps.length > 0 && (
                    <Box {...lightCardStyle} p={4}>
                      <Text {...sectionLabelProps} mb={3}>
                        Bounty token budgets
                      </Text>
                      <VStack align="stretch" spacing={3}>
                        {bountyCaps.map((bc) => {
                          const tokenInfo = getTokenByAddress(bc.token);
                          // Caps at/above 10^30 are effectively unlimited (contract uses 2^128-1).
                          const isUnlimited = bc.cap && bc.cap.length > 30;
                          const formattedCap = isUnlimited
                            ? 'Unlimited'
                            : formatTokenAmount(bc.cap || '0', tokenInfo.decimals, 2);
                          return (
                            <HStack key={bc.token} justify="space-between">
                              <HStack spacing={2}>
                                {tokenInfo.logo ? (
                                  <Image
                                    src={tokenInfo.logo}
                                    alt={tokenInfo.symbol}
                                    boxSize="22px"
                                    borderRadius="full"
                                    fallback={<TokenDot symbol={tokenInfo.symbol} />}
                                  />
                                ) : (
                                  <TokenDot symbol={tokenInfo.symbol} />
                                )}
                                <Text fontSize="sm" color="warmGray.700" fontWeight="medium">
                                  {tokenInfo.symbol}
                                </Text>
                                {tokenInfo.projectUrl && (
                                  <Link href={tokenInfo.projectUrl} isExternal onClick={(e) => e.stopPropagation()}>
                                    <ExternalLinkIcon boxSize={3} color="warmGray.400" _hover={{ color: 'warmGray.600' }} />
                                  </Link>
                                )}
                              </HStack>
                              <Text fontSize="sm" color="warmGray.900" fontWeight="semibold">
                                {formattedCap}
                              </Text>
                            </HStack>
                          );
                        })}
                      </VStack>
                    </Box>
                  )}

                  {hasNoBudget && (
                    <Text color="warmGray.400" fontStyle="italic">
                      This project has no budget configured.
                    </Text>
                  )}

                  {!canEditBudget && (
                    <Text fontSize="xs" color="warmGray.400">
                      Editing budgets requires a role with the Budget permission.
                    </Text>
                  )}
                </VStack>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default ProjectInfoModal;
