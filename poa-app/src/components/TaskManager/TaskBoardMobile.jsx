/**
 * TaskBoardMobile
 * Mobile view for TaskBoard with swipe navigation
 */

import { useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Box, VStack, HStack, Text, IconButton, Badge, Progress } from '@chakra-ui/react';
import { AddIcon, InfoIcon } from '@chakra-ui/icons';
import TaskColumn from './TaskColumn';
import { useSwipeNavigation } from '../../hooks/useSwipeNavigation';
import { mobileGlassStyle, mobileNavGlassStyle, infoPopupStyle } from './styles/taskBoardStyles';
import { useUserContext } from '@/context/UserContext';
import { useProjectContext } from '@/context/ProjectContext';
import { usePOContext } from '@/context/POContext';
import { userCanCreateTask, ROLE_INDICES } from '@/util/permissions';

const normalizeHatId = (id) => String(id).trim();

const TaskBoardMobile = forwardRef(({
  taskColumns,
  projectName,
}, ref) => {
  const taskColumnsRef = useRef([]);

  const {
    activeIndex,
    showGuide,
    dismissGuide,
    touchHandlers,
    containerRef,
  } = useSwipeNavigation({
    itemCount: taskColumns?.length || 0,
    initialIndex: 0,
  });

  const { userData } = useUserContext();
  const { projectsData } = useProjectContext();
  const { roleHatIds } = usePOContext();

  const userHatIds = userData?.hatIds || [];

  const currentProject = useMemo(() => {
    return projectsData?.find(p => p.name === projectName || p.title === projectName);
  }, [projectsData, projectName]);

  const projectRolePermissions = currentProject?.rolePermissions || [];

  const hasNonMemberRole = useMemo(() => {
    if (!userHatIds.length || !roleHatIds?.length) return false;
    const normalizedUserHats = userHatIds.map(normalizeHatId);
    if (roleHatIds.length > 1) {
      const nonMemberRoles = roleHatIds.slice(ROLE_INDICES.EXECUTIVE);
      return nonMemberRoles.some(roleId =>
        normalizedUserHats.includes(normalizeHatId(roleId))
      );
    }
    return false;
  }, [userHatIds, roleHatIds]);

  const canCreateTask = useMemo(() => {
    if (userCanCreateTask(userHatIds, projectRolePermissions)) return true;
    if (!projectRolePermissions?.length && hasNonMemberRole) return true;
    return false;
  }, [userHatIds, projectRolePermissions, hasNonMemberRole]);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    getActiveIndex: () => activeIndex,
    getColumnRef: (index) => taskColumnsRef.current[index],
  }), [activeIndex]);

  const currentColumn = taskColumns && taskColumns[activeIndex];
  const columnTitle = currentColumn?.title || '';
  const columnId = currentColumn?.id || '';

  const getTaskCount = (colId) => {
    const column = taskColumns?.find(col => col.id === colId);
    return column?.tasks?.length || 0;
  };

  const handleAddTask = () => {
    const columnRef = taskColumnsRef.current[activeIndex];
    if (columnRef && columnRef.handleOpenAddTaskModal) {
      columnRef.handleOpenAddTaskModal();
    }
  };

  const showFab = columnTitle === 'Open' && canCreateTask && !showGuide;

  return (
    <Box
      w="100%"
      h="100%"
      position="relative"
      ref={containerRef}
      {...touchHandlers}
      style={{ touchAction: 'pan-y' }}
    >
      <VStack
        spacing={0}
        align="stretch"
        w="100%"
        h="100%"
      >
        {/* Navigation header */}
        <Box
          sx={mobileNavGlassStyle}
          mx={2}
          mb={2}
          mt={1}
          overflow="hidden"
        >
          <HStack spacing={2} py={2} px={3} w="100%" align="center" justify="center" overflow="visible">
            <Text
              fontSize="md"
              fontWeight="bold"
              textAlign="center"
              color="white"
              noOfLines={1}
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              {columnTitle}
              <Badge ml={2} colorScheme="purple" fontSize="0.7em">
                {getTaskCount(columnId)}
              </Badge>
            </Text>
          </HStack>
        </Box>

        {/* Progress indicator */}
        <Progress
          value={(activeIndex / (taskColumns.length - 1)) * 100}
          size="xs"
          colorScheme="purple"
          bg="whiteAlpha.100"
          mt={0}
          mb={1}
          mx={2}
          borderRadius="full"
        />

        {/* Column content */}
        <Box
          px={2}
          position="relative"
          flex="1"
          display="flex"
          flexDirection="column"
          h="100%"
          minH="calc(100vh - 200px)"
        >
          <Box
            position="relative"
            zIndex={1}
            borderRadius="md"
            display="flex"
            flexDirection="column"
            flex="1"
            h="100%"
            sx={mobileGlassStyle}
            p={2}
          >
            <TaskColumn
              ref={el => taskColumnsRef.current[activeIndex] = el}
              title={columnTitle}
              tasks={currentColumn?.tasks || []}
              columnId={columnId}
              projectName={projectName}
              zIndex={1}
              isMobile={true}
              hideTitleInMobile={true}
            />
          </Box>
        </Box>
      </VStack>

      {/* Add Task FAB */}
      {showFab && (
        <IconButton
          icon={<AddIcon color="white" boxSize="1.25em" />}
          aria-label="Add task"
          onClick={handleAddTask}
          position="fixed"
          bottom={4}
          right={4}
          boxSize="56px"
          borderRadius="full"
          bg="purple.500"
          _hover={{ bg: 'purple.600' }}
          _active={{ bg: 'purple.700' }}
          boxShadow="0 6px 16px rgba(0,0,0,0.4)"
          zIndex={9}
        />
      )}

      {/* Swipe guide overlay */}
      {showGuide && (
        <Box
          position="absolute"
          top="60%"
          left="50%"
          transform="translate(-50%, -50%)"
          zIndex={10}
          style={infoPopupStyle}
          onClick={dismissGuide}
        >
          <InfoIcon color="purple.300" mb={2} boxSize="16px" />
          <Text color="gray.800" fontSize="sm" fontWeight="medium">
            Swipe left or right to navigate between columns
          </Text>
          <Text color="gray.600" fontSize="2xs" mt={1}>
            This message will disappear shortly
          </Text>
        </Box>
      )}
    </Box>
  );
});

TaskBoardMobile.displayName = 'TaskBoardMobile';

export default TaskBoardMobile;
