import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  VStack,
  Heading,
  Button,
  Input,
  Flex,
  Text,
  Divider,
  InputGroup,
  InputRightElement,
  Tooltip,
  IconButton,
  useToast,
} from '@chakra-ui/react';
import { useWeb3 } from '../../hooks';
import { useDataBaseContext } from '@/context/dataBaseContext';
import DraggableProject from './DraggableProject';
import FolderedProjectList from './FolderedProjectList';
import PulseLoader from '@/components/shared/PulseLoader';
import TrashBin from './TrashBin';
import { usePOContext } from '@/context/POContext';
import { useUserContext } from '@/context/UserContext';
import { useProjectContext } from '@/context/ProjectContext';
import { AddIcon, SearchIcon, ChevronLeftIcon, EditIcon } from '@chakra-ui/icons';
import { PERMISSION_MESSAGES, ROLE_INDICES } from '../../util/permissions';

const glassLayerStyle = {
  position: 'absolute',
  width: '100%',
  height: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backgroundColor: 'rgba(0, 0, 0, .85)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
};

const ProjectSidebar = ({
  projects,
  selectedProject,
  onSelectProject,
  onOpenCreateModal,
  onToggleSidebar,
  folders = [],
  foldersReady = true,
  userIsOrganizer = false,
  onEditFolders,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const { userData } = useUserContext();
  const { projectsData } = useProjectContext();
  const { task: taskService, executeWithNotification } = useWeb3();
  const toast = useToast();

  const { taskManagerContractAddress, roleHatIds, creatorHatIds } = usePOContext();

  // Get user's current hat IDs for permission checking
  const userHatIds = userData?.hatIds || [];

  // Normalize hat IDs for comparison
  const normalizeHatId = (id) => String(id).trim();

  // Check if user can create projects
  // Project creation requires one of the creatorHatIds from the TaskManager
  const canManageProjects = useMemo(() => {
    if (!userHatIds.length) return false;

    const normalizedUserHats = userHatIds.map(normalizeHatId);

    // Check if user has one of the creatorHatIds from TaskManager
    if (creatorHatIds && creatorHatIds.length > 0) {
      const hasCreatorHat = creatorHatIds.some(creatorHatId =>
        normalizedUserHats.includes(normalizeHatId(creatorHatId))
      );
      if (hasCreatorHat) return true;
    }

    // Fallback: Check if user has a non-member role (executive or higher)
    if (roleHatIds && roleHatIds.length > 1 && (!creatorHatIds || creatorHatIds.length === 0)) {
      const nonMemberRoles = roleHatIds.slice(ROLE_INDICES.EXECUTIVE);
      if (nonMemberRoles.some(roleId => normalizedUserHats.includes(normalizeHatId(roleId)))) {
        return true;
      }
    }

    // If no creatorHatIds configured and no projects exist, allow members to create first project
    if ((!creatorHatIds || creatorHatIds.length === 0) && !projectsData?.length && userHatIds.length > 0) {
      return true;
    }

    return false;
  }, [userHatIds, projectsData, roleHatIds, creatorHatIds]);

  const handleCreateProject = () => {
    if (canManageProjects) {
      onOpenCreateModal();
    } else {
      toast({
        title: 'Permission Required',
        description: PERMISSION_MESSAGES.PROJECT_MANAGE_EXEC,
        status: 'warning',
        duration: 4000,
        isClosable: true,
        position: 'top',
      });
    }
  };

  // Delete project using the new service
  const onDeleteProject = useCallback(async (projectId) => {
    if (!canManageProjects) {
      toast({
        title: 'Permission Required',
        description: PERMISSION_MESSAGES.REQUIRE_CREATE,
        status: 'warning',
        duration: 4000,
        isClosable: true,
        position: 'top',
      });
      return;
    }

    if (!taskService) return;

    await executeWithNotification(
      () => taskService.deleteProject(taskManagerContractAddress, projectId),
      {
        pendingMessage: 'Deleting project...',
        successMessage: 'Project deleted successfully!',
        refreshEvent: 'project:deleted',
      }
    );
  }, [canManageProjects, taskService, executeWithNotification, taskManagerContractAddress, toast]);

  // Filter projects based on search term. Memoized so the array reference
  // stays stable between unrelated re-renders — without this, the child
  // FolderedProjectList sees a new `filteredProjects` prop on every parent
  // render and re-runs its visible-set memo unnecessarily.
  const filteredProjects = useMemo(() => {
    if (!searchTerm) return projects;
    const lower = searchTerm.toLowerCase();
    return projects.filter((project) => project.name.toLowerCase().includes(lower));
  }, [projects, searchTerm]);

  return (
    <Box
      w="220px"
      marginRight={0}
      display="flex"
      flexDirection="column"
      bg="transparent"
      position="relative"
      zIndex={1}
      h="calc(100vh - 80px)"
      overflowY="auto"
      overflowX="hidden"
      borderRight="1px solid rgba(255, 255, 255, 0.08)"
      css={{
        '&::-webkit-scrollbar': {
          width: '4px',
        },
        '&::-webkit-scrollbar-track': {
          width: '6px',
        },
        '&::-webkit-scrollbar-thumb': {
          background: 'rgba(255, 255, 255, 0.3)',
          borderRadius: '24px',
        },
      }}
      transition="width 0.3s ease, transform 0.3s ease"
    >
      <div className="glass" style={glassLayerStyle} />
      
      {/* Header with gradient effect */}
      <Flex 
        direction="column" 
        align="center" 
        pt={5} 
        pb={3} 
        background="linear-gradient(180deg, rgba(41, 65, 171, 0.4) 0%, rgba(0, 0, 0, 0) 100%)"
      >
        <Flex 
          width="95%" 
          align="center" 
          justify="space-between"
          mb={2}
        >
          <Heading
            textAlign="left"
            fontSize="22px"
            color="white"
            letterSpacing="wider"
            fontWeight="bold"
            textTransform="uppercase"
            textShadow="0 0 10px rgba(100, 149, 237, 0.5)"
            ml="10"
          >
            Projects
          </Heading>

          <Flex align="center" gap={1}>
            {userIsOrganizer && onEditFolders && (
              <Tooltip
                label={folders.length > 0 ? 'Edit folders' : 'Create folders to organize projects'}
                placement="bottom"
                hasArrow
              >
                <IconButton
                  aria-label="Edit folders"
                  icon={<EditIcon />}
                  size="sm"
                  variant="ghost"
                  colorScheme="purple"
                  onClick={onEditFolders}
                />
              </Tooltip>
            )}

            {/* Collapse sidebar button */}
            <IconButton
              aria-label="Collapse sidebar"
              icon={<ChevronLeftIcon />}
              size="sm"
              variant="ghost"
              colorScheme="blue"
              onClick={onToggleSidebar}
              title="Collapse sidebar"
            />
          </Flex>
        </Flex>
        
        {/* Search input */}
        <InputGroup size="sm" width="95%" mt={1}>
          <Input
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            bg="whiteAlpha.100"
            border="1px solid rgba(255, 255, 255, 0.15)"
            borderRadius="md"
            color="white"
            _placeholder={{ color: "whiteAlpha.500" }}
            _hover={{ borderColor: "blue.300" }}
            _focus={{ borderColor: "blue.400", boxShadow: "0 0 0 1px rgba(66, 153, 225, 0.6)" }}
          />
          <InputRightElement pointerEvents="none">
            <SearchIcon color="whiteAlpha.500" />
          </InputRightElement>
        </InputGroup>
      </Flex>
      
      <Divider borderColor="whiteAlpha.200" />
      
      {/* Projects list.
          - Until `foldersReady`, hold the layout with a small loader so we
            don't render the flat-list fallback and then snap into the
            folded view once the IPFS doc arrives.
          - No folders configured → flat list (matches pre-v4 sidebar).
          - Folders present → grouped via FolderedProjectList (existing
            DraggableProject component reused unchanged). */}
      <Box flexGrow={1} overflowY="auto" p={3}>
        {!foldersReady ? (
          <VStack spacing={3} width="100%" align="center" pt={6}>
            <PulseLoader size="sm" color="purple.400" />
          </VStack>
        ) : filteredProjects.length === 0 ? (
          <VStack spacing={3} width="100%" align="center">
            <Text color="whiteAlpha.600" fontSize="sm" pt={4}>
              {searchTerm ? 'No projects match your search' : 'No projects available'}
            </Text>
          </VStack>
        ) : folders.length > 0 ? (
          <FolderedProjectList
            folders={folders}
            projects={projects}
            filteredProjects={filteredProjects}
            selectedProject={selectedProject}
            onSelectProject={onSelectProject}
            onDeleteProject={onDeleteProject}
            searchTerm={searchTerm}
          />
        ) : (
          <VStack spacing={3} width="100%" align="center">
            {filteredProjects.map((project) => {
              const isSelected = selectedProject && project.id === selectedProject.id;
              return (
                <DraggableProject
                  key={project.id}
                  project={project}
                  isSelected={isSelected}
                  onSelectProject={onSelectProject}
                  onDeleteProject={onDeleteProject}
                />
              );
            })}
          </VStack>
        )}
      </Box>
      
      <Divider borderColor="whiteAlpha.200" mt={2} />
      
      {/* Trash bin section */}
      <Box mt={2} mb={2}>
        <TrashBin onDeleteProject={onDeleteProject} />
      </Box>
      
      {/* Create project section */}
      <Flex direction="column" p={3} bg="whiteAlpha.050">
        <Button
          data-tour="create-project-btn"
          onClick={handleCreateProject}
          width="100%"
          size="md"
          colorScheme="blue"
          variant="solid"
          _hover={{
            transform: "translateY(-2px)",
            boxShadow: "0 4px 12px rgba(45, 134, 255, 0.4)"
          }}
          leftIcon={<AddIcon />}
          transition="transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, border-color 0.2s ease"
        >
          Create Project
        </Button>
      </Flex>
    </Box>
  );
};

export default ProjectSidebar;
