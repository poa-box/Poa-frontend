import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Flex, Box, Heading, useMediaQuery, Select, Text, Button, VStack, HStack, IconButton, useDisclosure, Input, FormControl, FormLabel, Tooltip, Badge } from '@chakra-ui/react';
import { AddIcon, InfoIcon, ChevronDownIcon, ChevronRightIcon, ChevronLeftIcon } from '@chakra-ui/icons';
import ProjectSidebar from './ProjectSidebar';
import TaskBoard from './TaskBoard';
import CreateProjectModal from './CreateProjectModal';
import { TaskBoardProvider } from '../../context/TaskBoardContext';
import { useDataBaseContext} from '../../context/dataBaseContext';
import { useIPFScontext } from '../../context/ipfsContext';
import { useAuth } from '../../context/AuthContext';
import { useWeb3 } from '../../hooks';
import { usePOContext } from '@/context/POContext';
import { useOrgName } from '@/hooks/useOrgName';
import { useRouter } from 'next/router';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { SimpleGrid, Avatar } from '@chakra-ui/react';
import { StarIcon, TimeIcon } from '@chakra-ui/icons';
import { Modal, ModalOverlay, ModalContent, ModalCloseButton, ModalBody, ModalFooter, Spacer } from '@chakra-ui/react';
import { useTour } from '@/features/tour';
import { glassLayerStyle as boardGlassStyle } from './styles/taskBoardStyles';

// --- Example task board shown during tour when no real projects exist ---

const DIFF_COLORS = { easy: '#68D391', medium: '#F6E05E', hard: '#F6AD55' };
const DIFF_DOTS = { easy: 1, medium: 2, hard: 3 };

const EXAMPLE_COLUMNS = [
  { id: 'open', title: 'Open', tasks: [
    { title: 'Design the org logo', desc: 'Create a logo that represents the organization', difficulty: 'easy', payout: '10', hours: 2 },
    { title: 'Write a welcome post', desc: 'Draft a welcome message for new members joining', difficulty: 'medium', payout: '25', hours: 3 },
  ]},
  { id: 'inProgress', title: 'In Progress', tasks: [
    { title: 'Set up social accounts', desc: 'Create Twitter and Discord for the org', difficulty: 'medium', payout: '15', hours: 2, assignee: 'alice' },
  ]},
  { id: 'inReview', title: 'In Review', tasks: [
    { title: 'Draft governance rules', desc: 'Write the initial proposal and voting rules', difficulty: 'hard', payout: '40', hours: 5, assignee: 'bob' },
  ]},
  { id: 'completed', title: 'Completed', tasks: [
    { title: 'Deploy the organization', desc: 'Set up the on-chain org contracts', difficulty: 'hard', payout: '50', hours: 1, assignee: 'you' },
  ]},
];

function ExampleTaskCard({ title, desc, difficulty, payout, hours, assignee }) {
  const color = DIFF_COLORS[difficulty] || '#CBD5E0';
  const dots = DIFF_DOTS[difficulty] || 1;

  return (
    <Box
      data-tour="task-card"
      bg="ghostwhite"
      borderRadius="md"
      boxShadow="sm"
      p="8px"
      mb="16px"
      borderLeft={`3px solid ${color}`}
      cursor="default"
      _hover={{ boxShadow: 'md' }}
      transition="box-shadow 0.2s ease"
    >
      <Text fontWeight="700" fontSize="0.85rem" color="#2D3748" mb={1.5} noOfLines={2} lineHeight="tight" letterSpacing="tight">
        {title}
      </Text>
      <Text fontSize="0.75rem" color="#4A5568" mb={2} noOfLines={2} lineHeight="1.4">
        {desc}
      </Text>
      <Flex direction="column" gap={1.5}>
        <Flex justify="space-between" align="center">
          <HStack spacing={1}>
            {Array.from({ length: dots }).map((_, i) => (
              <Box key={i} w="6px" h="6px" borderRadius="full" bg={color} />
            ))}
            <Text fontSize="xs" color="gray.500" ml={1} fontWeight="medium">{difficulty}</Text>
          </HStack>
          <HStack spacing={1}>
            <TimeIcon boxSize={3} color="gray.400" />
            <Text fontSize="xs" color="gray.500" fontWeight="medium">{hours} hr{hours !== 1 ? 's' : ''}</Text>
          </HStack>
        </Flex>
        <Flex justify="space-between" align="center">
          <HStack spacing={1}>
            <Box bg="purple.50" px={2} py={0.5} borderRadius="full" display="flex" alignItems="center" gap="4px">
              <StarIcon boxSize={3} color="purple.500" />
              <Text fontWeight="bold" color="purple.700" fontSize="xs">{payout} PT</Text>
            </Box>
          </HStack>
          {assignee && (
            <Avatar size="xs" name={assignee} bg="purple.500" color="white" />
          )}
        </Flex>
      </Flex>
    </Box>
  );
}

function ExampleTaskBoard() {
  return (
    <Box width="100%" height="100%" pt={3} pb={0} mt={0} overflow="hidden">
      <SimpleGrid
        data-tour="task-board"
        columns={{ base: 1, md: 2, lg: 4 }}
        spacing={2}
        width="100%"
        height="100%"
        mb={0}
      >
        {EXAMPLE_COLUMNS.map(col => (
          <Box
            key={col.id}
            height={{ base: 'auto', md: '78vh' }}
            minH="400px"
            borderRadius="xl"
            position="relative"
            sx={boardGlassStyle}
            display="flex"
            flexDirection="column"
            alignItems="center"
            p={2}
            overflow="hidden"
          >
            <Box w="100%" h="100%">
              <Heading size="md" mb={3} mt={0} ml={3} color="white">
                {col.title}
              </Heading>
              <Box h="calc(100% - 3rem)" borderRadius="md" p={2} overflowY="auto"
                sx={{ '&::-webkit-scrollbar': { width: '4px' }, '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.2)', borderRadius: '24px' } }}
              >
                {col.tasks.length > 0 ? (
                  col.tasks.map((t, i) => <ExampleTaskCard key={i} {...t} />)
                ) : (
                  <Flex w="100%" minH="200px" direction="column" align="center" justify="center" p={4} textAlign="center"
                    bg="rgba(255,255,255,0.05)" borderRadius="8px" border="1px dashed rgba(255,255,255,0.2)"
                  >
                    <Text fontSize="sm" color="white" fontWeight="medium">{col.title}</Text>
                    <Text fontSize="xs" color="whiteAlpha.700">No tasks yet</Text>
                  </Flex>
                )}
              </Box>
            </Box>
          </Box>
        ))}
      </SimpleGrid>
    </Box>
  );
}

// --- Example task detail modal shown during tour ---

const modalGlassStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backgroundColor: 'rgba(33, 33, 33, 0.97)',
};

function ExampleTaskModal({ isOpen, onClose }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="3xl" isCentered zIndex={10001}>
      <ModalOverlay bg="transparent" />
      <ModalContent bg="transparent" textColor="white" data-tour="example-task-modal">
        <div style={modalGlassStyle} />
        <ModalCloseButton zIndex={1} />
        <Box pt={4} borderTopRadius="2xl" bg="transparent" boxShadow="lg" position="relative">
          <div style={modalGlassStyle} />
          <Text ml="6" fontSize="2xl" fontWeight="bold">Design the org logo</Text>
        </Box>
        <ModalBody>
          <VStack spacing={4} align="start">
            <Box>
              <Text mb="4" mt="4" lineHeight="6" fontSize="md" fontWeight="bold" style={{ whiteSpace: 'pre-wrap' }}>
                Create a logo that represents the organization. It should be clean, modern, and work well at small sizes. Consider the org&apos;s mission and values when designing.
              </Text>
            </Box>
            <HStack width="100%">
              <Badge colorScheme="green">Easy</Badge>
              <Badge colorScheme="blue">2 hrs</Badge>
              <Spacer />
            </HStack>
          </VStack>
        </ModalBody>
        <ModalFooter borderTop="1.5px solid" borderColor="gray.200" py={2}>
          <Box flexGrow={1}>
            <VStack align="start" spacing={0}>
              <Text fontWeight="bold" fontSize="m">Reward: 10 PT</Text>
            </VStack>
          </Box>
          <Box>
            <Button textColor="white" variant="outline" mr={2} isDisabled>Share</Button>
            <Button colorScheme="teal" isDisabled>Claim Task</Button>
          </Box>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// Enhanced styles for mobile project selector
const mobileHeaderStyle = {
  background: 'linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(20,20,20,0.75) 100%)',
  borderRadius: '8px',
  padding: '8px 12px',
  boxShadow: '0 3px 10px rgba(0, 0, 0, 0.2)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  marginBottom: '3px',
  marginTop: '64px',
};

const MainLayout = () => {
  const {
    projects,
    selectedProject,
    setSelectedProject,
    handleUpdateColumns,
  } = useDataBaseContext();

  const { accountAddress: account } = useAuth();
  const { task: taskService, executeWithNotification } = useWeb3();
  const { taskManagerContractAddress, roleHatIds, roleNames, creatorHatIds } = usePOContext();
  const { addToIpfs } = useIPFScontext();
  const router = useRouter();
  const userDAO = useOrgName();

  // Use useMediaQuery for more stable breakpoint detection
  // Returns [isMatch] where isMatch is false by default on SSR to prevent flash
  // Chakra's md breakpoint is 48em (768px)
  const [isMobileQuery] = useMediaQuery('(max-width: 47.99em)', { ssr: false, fallback: false });

  // Use stable state to prevent flash during re-renders
  // Only update when genuinely changing (prevents flicker from brief query glitches)
  const [isMobile, setIsMobile] = useState(false);
  const isInitializedRef = useRef(false);

  useEffect(() => {
    // On first load, set the value
    if (!isInitializedRef.current) {
      setIsMobile(isMobileQuery);
      isInitializedRef.current = true;
    } else if (isMobile !== isMobileQuery) {
      // Only update if genuinely different (debounce rapid changes)
      const timeoutId = setTimeout(() => {
        setIsMobile(isMobileQuery);
      }, 50); // Small delay to filter out render glitches
      return () => clearTimeout(timeoutId);
    }
  }, [isMobileQuery, isMobile]);

  const [showMobileProjectCreator, setShowMobileProjectCreator] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isProjectModalOpen, onOpen: onProjectModalOpen, onClose: onProjectModalClose } = useDisclosure();
  const [showHelp, setShowHelp] = useState(true);
  const { pendingAction, isActive: isTourActive, currentStepDef } = useTour();
  const currentStepId = currentStepDef?.id;
  const [tourDefaultProjectName, setTourDefaultProjectName] = useState('');
  const [tourDefaultProjectDesc, setTourDefaultProjectDesc] = useState('');

  // Pre-fill defaults when modal opens during tour's create-project step
  useEffect(() => {
    if (isProjectModalOpen && isTourActive && pendingAction === 'create-project') {
      setTourDefaultProjectName('My First Project');
      setTourDefaultProjectDesc('A place to organize tasks for your team.');
    }
  }, [isProjectModalOpen, isTourActive, pendingAction]);

  // State to track sidebar visibility
  const [sidebarVisible, setSidebarVisible] = useState(true);

  const handleSelectProject = (projectId) => {
     // Decode first to handle any prior encoding, then encode properly
     const safeProjectId = encodeURIComponent(decodeURIComponent(projectId));

    router.push(`/tasks?projectId=${safeProjectId}&org=${userDAO}`);
    const selected = projects.find((project) => project.id === projectId);
    setSelectedProject(selected);
  };

  // Create project using the new service
  const handleCreateProject = useCallback(async (projectData) => {
    if (!taskService) return;

    // Handle both simple string (for backwards compat) and full object
    const isSimpleCreate = typeof projectData === 'string';
    const projectName = isSimpleCreate ? projectData : projectData.name;

    // Upload description to IPFS if provided
    let metadataHash = '';
    if (!isSimpleCreate && projectData.description && addToIpfs) {
      try {
        const result = await addToIpfs(JSON.stringify({ description: projectData.description }));
        metadataHash = result.path;
      } catch (error) {
        console.warn('Failed to upload project metadata to IPFS:', error);
      }
    }

    // Build default permissions using creatorHatIds (roles trusted to manage tasks)
    // For the simple-create path (quick project creation without the modal)
    if (!roleHatIds || roleHatIds.length === 0) {
      console.error('Cannot create project: roleHatIds not loaded yet');
      throw new Error('Organization roles are still loading. Please wait a moment and try again.');
    }

    const creatorSet = new Set((creatorHatIds || []).map(String));
    const adminRoles = creatorSet.size > 0
      ? roleHatIds.filter(id => creatorSet.has(String(id)))
      : roleHatIds.slice(1);
    // If no admin roles resolved, give all roles full permissions
    const effectiveAdminRoles = adminRoles.length > 0 ? adminRoles : roleHatIds;

    const defaultCreateHats = effectiveAdminRoles;
    const defaultClaimHats = roleHatIds; // all roles can claim
    const defaultReviewHats = effectiveAdminRoles;
    const defaultAssignHats = effectiveAdminRoles;

    const createProjectData = {
      name: projectName,
      metadataHash,
      cap: isSimpleCreate ? 0 : (projectData.cap || 0),
      managers: isSimpleCreate ? [] : (projectData.managers || []),
      createHats: isSimpleCreate ? defaultCreateHats : (projectData.createHats?.length > 0 ? projectData.createHats : defaultCreateHats),
      claimHats: isSimpleCreate ? defaultClaimHats : (projectData.claimHats?.length > 0 ? projectData.claimHats : defaultClaimHats),
      reviewHats: isSimpleCreate ? defaultReviewHats : (projectData.reviewHats?.length > 0 ? projectData.reviewHats : defaultReviewHats),
      assignHats: isSimpleCreate ? defaultAssignHats : (projectData.assignHats?.length > 0 ? projectData.assignHats : defaultAssignHats),
      bountyTokens: isSimpleCreate ? [] : (projectData.bountyTokens || []),
      bountyCaps: isSimpleCreate ? [] : (projectData.bountyCaps || []),
    };

    await executeWithNotification(
      () => taskService.createProject(taskManagerContractAddress, createProjectData),
      {
        pendingMessage: 'Creating project...',
        successMessage: 'Project created successfully!',
        refreshEvent: 'project:created',
      }
    );
  }, [taskService, executeWithNotification, taskManagerContractAddress, addToIpfs, roleHatIds, creatorHatIds]);

  const handleCreateNewProject = () => {
    if (newProjectName.trim()) {
      handleCreateProject(newProjectName.trim());
      setNewProjectName('');
      setShowMobileProjectCreator(false);
      setShowHelp(false);
    }
  };

  // Toggle sidebar visibility
  const toggleSidebar = () => {
    setSidebarVisible(!sidebarVisible);
  };

  // Mobile project selection via dropdown with enhanced UX
  const renderMobileProjectSelector = () => {
    const hasProjects = projects && projects.length > 0;
    
    return (
      <Box w="100%" mb={1} py={0}>
        <VStack spacing={1} align="stretch">
          {/* Project Selection Header */}
          <Box style={mobileHeaderStyle}>
            <Flex justify="space-between" align="center" mb={1}>
              <Heading 
                size="sm" 
                color="white" 
                fontWeight="600"
                letterSpacing="wide"
              >
                {hasProjects ? 'Select Project' : 'Create Your First Project'}
              </Heading>

              {hasProjects && (
                <IconButton
                  size="sm"
                  icon={<AddIcon boxSize="14px" />}
                  colorScheme="purple"
                  variant="ghost"
                  onClick={() => setShowMobileProjectCreator(prev => !prev)}
                  aria-label="Create new project"
                  p={1}
                />
              )}
            </Flex>

            {hasProjects && !showMobileProjectCreator && (
              <Flex 
                bg="whiteAlpha.100" 
                p={1.5} 
                borderRadius="md" 
                align="center"
                border="1px solid rgba(255,255,255,0.1)"
                onClick={onOpen}
                cursor="pointer"
                _hover={{ bg: "whiteAlpha.200" }}
                mt={1}
                height="32px"
              >
                <Text color="white" fontWeight="medium" fontSize="sm" flex={1} noOfLines={1}>
                  {selectedProject?.name || "Select a project"}
                </Text>
                <ChevronDownIcon color="white" ml={1} boxSize="16px" />
              </Flex>
            )}

            {/* Show mobile project creator */}
            {showMobileProjectCreator && (
              <Flex mt={1} direction="column">
                <Input
                  placeholder="Project name"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  bg="whiteAlpha.100"
                  color="white"
                  size="sm"
                  height="32px"
                  _placeholder={{ color: "whiteAlpha.500" }}
                  mb={1}
                />
                <Button
                  colorScheme="purple"
                  onClick={handleCreateNewProject}
                  isDisabled={!newProjectName.trim()}
                  size="sm"
                  height="28px"
                >
                  Create Project
                </Button>
              </Flex>
            )}
          </Box>

          {/* First time help - only show when necessary and in very compact form */}
          {projects.length === 0 && showHelp && (
            <Box
              p={2}
              borderRadius="md"
              bg="rgba(0, 0, 0, 0.4)"
              borderWidth="1px"
              borderColor="purple.500"
              mt={1}
            >
              <Flex align="center" mb={0.5}>
                <InfoIcon color="purple.300" mr={1} boxSize="10px" />
                <Text color="white" fontWeight="medium" fontSize="xs">Getting Started</Text>
              </Flex>
              <Text color="whiteAlpha.800" fontSize="2xs">
                Create your first project to start organizing tasks for your team.
              </Text>
            </Box>
          )}

          {/* Project selection modal */}
          {isOpen && (
            <Box 
              position="fixed" 
              top="0" 
              left="0" 
              w="100%" 
              h="100%" 
              bg="rgba(0,0,0,0.7)" 
              zIndex={100}
              p={4}
              onClick={onClose}
            >
              <Box
                maxW="90%"
                maxH="80vh"
                mx="auto"
                mt="15vh"
                bg="rgba(30,30,40,0.95)"
                borderRadius="lg"
                p={3}
                boxShadow="0 10px 30px rgba(0,0,0,0.4)"
                border="1px solid rgba(255,255,255,0.1)"
                onClick={(e) => e.stopPropagation()}
                overflowY="auto"
              >
                <Heading size="sm" color="white" mb={2} textAlign="center">
                  Select Project
                </Heading>
                <VStack spacing={1}>
                  {projects.map(project => (
                    <Box
                      key={project.id}
                      w="100%"
                      p={2}
                      bg={selectedProject?.id === project.id 
                        ? "rgba(128, 90, 213, 0.2)" 
                        : "whiteAlpha.100"}
                      borderRadius="md"
                      cursor="pointer"
                      onClick={() => {
                        handleSelectProject(project.id);
                        onClose();
                      }}
                      _hover={{ bg: "whiteAlpha.200" }}
                      borderLeft={selectedProject?.id === project.id 
                        ? "3px solid" 
                        : "1px solid"}
                      borderColor={selectedProject?.id === project.id 
                        ? "purple.400" 
                        : "transparent"}
                    >
                      <Text color="white" fontSize="xs">{project.name}</Text>
                    </Box>
                  ))}
                  
                  <Button 
                    colorScheme="purple" 
                    variant="outline" 
                    size="xs" 
                    mt={1} 
                    leftIcon={<AddIcon boxSize={3} />}
                    onClick={() => {
                      setShowMobileProjectCreator(true);
                      onClose();
                    }}
                  >
                    Create New Project
                  </Button>
                </VStack>
              </Box>
            </Box>
          )}
        </VStack>
      </Box>
    );
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <Flex 
        height="calc(100vh - 80px)"
        direction={{ base: "column", md: "row" }} 
        position="relative"
        overflow="hidden"
        mb={0}
      >
        {/* Only show the sidebar on desktop and when visible */}
        {!isMobile && sidebarVisible && (
          <Box position="relative">
            <ProjectSidebar
              projects={projects}
              selectedProject={selectedProject}
              onSelectProject={handleSelectProject}
              onOpenCreateModal={onProjectModalOpen}
              onToggleSidebar={toggleSidebar}
            />
          </Box>
        )}
        
        {/* Main content area */}
        <Box 
          flex="1"
          position="relative"
          overflow={isMobile ? "auto" : "hidden"} // Keep this scrollable on mobile
          height={isMobile ? "100%" : "auto"}
          width="100%"
          zIndex={2}
          transition="transform 0.3s ease, box-shadow 0.3s ease, background 0.3s ease, border-color 0.3s ease"
          display="flex"
          flexDirection="column"
          pb={isMobile ? "1px" : undefined} // Add extra padding at bottom for mobile
        >
          {/* Place mobile project selector inside the scrollable area */}
          {isMobile && (
            <Box width="100%" pt={2} px={2}>
              {renderMobileProjectSelector()}
            </Box>
          )}
          
          {selectedProject ? (
            <Box flex="1" width="100%" overflow={isMobile ? "visible" : "auto"}>
              <TaskBoardProvider
                key={selectedProject.id}
                projectId={selectedProject.id}
                initialColumns={selectedProject.columns}
                onUpdateColumns={handleUpdateColumns}
                account={account}
              >
                <TaskBoard
                  projectName={selectedProject.name}
                  hideTitleBar={isMobile}
                  sidebarVisible={sidebarVisible}
                  toggleSidebar={toggleSidebar}
                  isDesktop={!isMobile}
                >
                </TaskBoard>
              </TaskBoardProvider>
            </Box>
          ) : projects.length > 0 ? (
            <Box flex="1" width="100%">
              <Flex 
                flexDirection="column"
                justifyContent="center"
                alignItems="center"
                height="100%"
                color="white"
                px={4}
                py={8}
                textAlign="center"
              >
                <Heading size="md" mb={2}>Select a Project</Heading>
                <Text fontSize="md" mb={4}>Choose a project from the dropdown above to view tasks</Text>
              </Flex>
            </Box>
          ) : isTourActive && pendingAction !== 'create-project' && pendingAction !== 'create-task' ? (
            /* Tour is active with no projects — show example board */
            <Box flex="1" width="100%">
              <ExampleTaskBoard />
              <ExampleTaskModal
                isOpen={isTourActive && pendingAction === null && currentStepId === 'task-detail'}
                onClose={() => {}}
              />
            </Box>
          ) : (
            <Box flex="1" width="100%">
              <Flex
                flexDirection="column"
                justifyContent="center"
                alignItems="center"
                height="100%"
                color="white"
                px={4}
                py={8}
                textAlign="center"
              >
                <Heading size="md" mb={2}>Create Your First Project</Heading>
                <Text fontSize="md" mb={4}>Get started by creating a project</Text>
                <Button
                  data-tour="create-project-mobile-btn"
                  colorScheme="purple"
                  onClick={onProjectModalOpen}
                  leftIcon={<AddIcon />}
                >
                  Create Project
                </Button>
              </Flex>
            </Box>
          )}
        </Box>
      </Flex>

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => {
          setTourDefaultProjectName('');
          setTourDefaultProjectDesc('');
          onProjectModalClose();
        }}
        onCreateProject={handleCreateProject}
        roleHatIds={roleHatIds || []}
        roleNames={roleNames || {}}
        creatorHatIds={creatorHatIds || []}
        defaultName={tourDefaultProjectName}
        defaultDescription={tourDefaultProjectDesc}
      />
    </DndProvider>
  );
};

export default MainLayout;

