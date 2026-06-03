/**
 * ProjectHeader
 * Header bar showing project name with sidebar toggle and project info
 */

import {
  Box,
  Flex,
  Text,
  IconButton,
  Tooltip,
  useDisclosure,
} from '@chakra-ui/react';
import { InfoIcon } from '@chakra-ui/icons';
import { FaProjectDiagram } from 'react-icons/fa';
import { useDataBaseContext } from '@/context/dataBaseContext';
import { usePOContext } from '@/context/POContext';
import { useUserContext } from '@/context/UserContext';
import { userCanBudgetProject } from '@/util/permissions';
import EditBudgetModal from './EditBudgetModal';
import ProjectInfoModal from './ProjectInfoModal';
import ViewSwitcher from './ViewSwitcher';

const ProjectHeader = ({ projectName, sidebarVisible, toggleSidebar }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isBudgetOpen, onOpen: onBudgetOpen, onClose: onBudgetClose } = useDisclosure();
  const { selectedProject } = useDataBaseContext();
  const { tokenLabel = 'Shares' } = usePOContext() || {};
  const { userData } = useUserContext() || {};

  const userHatIds = userData?.hatIds || [];
  // Pass global grants too so hats granted BUDGET only org-wide (via setConfig ROLE_PERM)
  // still unlock the edit affordance, matching the contract's _permMask fallback.
  const canEditBudget = userCanBudgetProject(
    userHatIds,
    selectedProject?.rolePermissions,
    selectedProject?.globalRolePermissions,
  );

  return (
    <>
      <Box
        bg="purple.300"
        w="100%"
        p={2}
        height="auto"
      >
        <Flex align="center" justify="space-between" h="100%">
          <Flex align="center" h="100%">
            {!sidebarVisible && (
              <Tooltip label="Show projects sidebar" placement="right" hasArrow>
                <IconButton
                  aria-label="Show projects sidebar"
                  icon={<FaProjectDiagram size="16px" />}
                  size="sm"
                  variant="ghost"
                  colorScheme="blackAlpha"
                  mr={2}
                  onClick={toggleSidebar}
                  _hover={{
                    bg: "blackAlpha.200",
                    transform: "scale(1.1)"
                  }}
                  transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
                />
              </Tooltip>
            )}
            <Text
              fontSize="2xl"
              fontWeight="bold"
              color="black"
              lineHeight="normal"
            >
              {projectName}
            </Text>
            <Tooltip label="View project info" placement="right" hasArrow>
              <IconButton
                aria-label="View project info"
                icon={<InfoIcon />}
                size="sm"
                variant="ghost"
                colorScheme="blackAlpha"
                ml={2}
                onClick={onOpen}
                _hover={{
                  bg: "blackAlpha.200",
                  transform: "scale(1.1)"
                }}
                transition="transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s"
              />
            </Tooltip>
          </Flex>
          <ViewSwitcher isMobile={false} />
        </Flex>
      </Box>

      {/* Mounted only when open so useOrgStructure's query is deferred until first use */}
      {isOpen && (
        <ProjectInfoModal
          isOpen={isOpen}
          onClose={onClose}
          project={selectedProject}
          projectName={projectName}
          tokenLabel={tokenLabel}
          canEditBudget={canEditBudget}
          onEditBudget={() => {
            onClose();
            onBudgetOpen();
          }}
        />
      )}

      <EditBudgetModal
        isOpen={isBudgetOpen}
        onClose={onBudgetClose}
        project={selectedProject}
      />
    </>
  );
};

export default ProjectHeader;
