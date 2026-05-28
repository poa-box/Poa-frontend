/**
 * TaskBoardMobile
 *
 * Mobile view for the Task Board. Phase 2: a fixed bottom ColumnTabBar
 * is the primary nav across the four columns, replacing the older
 * top-of-screen "column title + count + progress" stack. Swipe
 * (`useSwipeNavigation`) remains as a power-user shortcut alongside tap.
 *
 * The FAB sits above the tab bar with safe-area-aware offset so it
 * never overlaps the iPhone home indicator nor the bar itself.
 */

import { useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Box, VStack, IconButton } from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';
import TaskColumn from './TaskColumn';
import ColumnTabBar from './ColumnTabBar';
import { useSwipeNavigation } from '../../hooks/useSwipeNavigation';
import { mobileGlassStyle, TAB_BAR_HEIGHT_PX } from './styles/taskBoardStyles';
import { useUserContext } from '@/context/UserContext';
import { useProjectContext } from '@/context/ProjectContext';
import { usePOContext } from '@/context/POContext';
import { userCanCreateTask, ROLE_INDICES } from '@/util/permissions';

const normalizeHatId = (id) => String(id).trim();

// Vertical reserve consumed by the fixed ColumnTabBar (its 56px height
// plus the iOS safe-area inset it absorbs). The board's outermost Box
// shrinks its height by this amount so the column never renders behind
// the tab bar.
const TAB_BAR_RESERVE = `calc(${TAB_BAR_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px))`;

// FAB sits ~16px above the bar, again accounting for the inset so it
// clears both the bar and the home indicator.
const FAB_BOTTOM = `calc(${TAB_BAR_HEIGHT_PX}px + env(safe-area-inset-bottom, 0px) + 16px)`;

const TaskBoardMobile = forwardRef(({
  taskColumns,
  projectName,
}, ref) => {
  const taskColumnsRef = useRef([]);

  const {
    activeIndex,
    setActiveIndex,
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

  useImperativeHandle(ref, () => ({
    getActiveIndex: () => activeIndex,
    getColumnRef: (index) => taskColumnsRef.current[index],
  }), [activeIndex]);

  const currentColumn = taskColumns && taskColumns[activeIndex];
  const columnTitle = currentColumn?.title || '';
  const columnId = currentColumn?.id || '';

  const handleAddTask = () => {
    const columnRef = taskColumnsRef.current[activeIndex];
    if (columnRef && columnRef.handleOpenAddTaskModal) {
      columnRef.handleOpenAddTaskModal();
    }
  };

  const showFab = columnTitle === 'Open' && canCreateTask;

  return (
    <Box
      w="100%"
      h={`calc(100% - ${TAB_BAR_RESERVE})`}
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
        {/* Column content — title now lives in the bottom ColumnTabBar.
            The outermost Box's height is the viewport minus the tab bar
            reserve, so the column always stops above the bar (and the
            iOS home indicator). */}
        <Box
          px={2}
          pt={1}
          position="relative"
          flex="1"
          minH={0}
          display="flex"
          flexDirection="column"
        >
          <Box
            position="relative"
            zIndex={1}
            borderRadius="md"
            display="flex"
            flexDirection="column"
            flex="1"
            minH={0}
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

      {/* Add Task FAB — sits above the tab bar; only on Open column */}
      {showFab && (
        <IconButton
          icon={<AddIcon color="white" boxSize="1.25em" />}
          aria-label="Add task"
          onClick={handleAddTask}
          position="fixed"
          bottom={FAB_BOTTOM}
          right={4}
          boxSize="56px"
          borderRadius="full"
          bg="purple.500"
          _hover={{ bg: 'purple.600' }}
          _active={{ bg: 'purple.700' }}
          boxShadow="0 6px 16px rgba(0,0,0,0.4)"
          zIndex={21}
        />
      )}

      {/* Fixed bottom tab bar — column navigation primary affordance */}
      <ColumnTabBar
        taskColumns={taskColumns || []}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
      />
    </Box>
  );
});

TaskBoardMobile.displayName = 'TaskBoardMobile';

export default TaskBoardMobile;
