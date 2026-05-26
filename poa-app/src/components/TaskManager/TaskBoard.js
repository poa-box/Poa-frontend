/**
 * TaskBoard
 * Main component for displaying and managing project tasks
 * Renders mobile or desktop view based on screen size
 */

import { useRef } from 'react';
import { VStack, Box, Flex } from '@chakra-ui/react';
import { useTaskBoard } from '../../context/TaskBoardContext';
import TaskBoardMobile from './TaskBoardMobile';
import TaskBoardDesktop from './TaskBoardDesktop';
import ProjectHeader from './ProjectHeader';
import ViewSwitcher from './ViewSwitcher';
import { useViewMode } from './views/useViewMode';
import ListView from './views/list/ListView';
import GanttView from './views/gantt/GanttView';
import TaskModalMount from './views/TaskModalMount';

const TaskBoard = ({
  projectName,
  hideTitleBar,
  sidebarVisible,
  toggleSidebar,
  isDesktop = true, // Default to desktop to prevent flash
}) => {
  const { taskColumns } = useTaskBoard();
  // Use the stable isDesktop prop from MainLayout instead of our own breakpoint detection
  // This prevents flash when component remounts during project switches
  const isMobile = !isDesktop;
  const { viewMode } = useViewMode({ allowGantt: !isMobile });
  const mobileRef = useRef(null);
  const desktopRef = useRef(null);

  const renderBoard = () =>
    isMobile ? (
      <TaskBoardMobile
        ref={mobileRef}
        taskColumns={taskColumns}
        projectName={projectName}
      />
    ) : (
      <TaskBoardDesktop
        ref={desktopRef}
        taskColumns={taskColumns}
        projectName={projectName}
      />
    );

  const renderView = () => {
    if (viewMode === 'list') return <ListView projectName={projectName} />;
    if (viewMode === 'gantt' && !isMobile) return <GanttView projectName={projectName} />;
    return renderBoard();
  };

  return (
    <VStack w="100%" align="stretch" h="100%" spacing={0}>
      {/* Project header - only show in desktop view */}
      {isDesktop && (
        <ProjectHeader
          projectName={projectName}
          sidebarVisible={sidebarVisible}
          toggleSidebar={toggleSidebar}
        />
      )}

      {/* Mobile-only view switcher row (desktop switcher lives in ProjectHeader) */}
      {isMobile && (
        <Flex w="100%" justify="center" px={2} pt={0} pb={2}>
          <ViewSwitcher isMobile size="sm" />
        </Flex>
      )}

      {/* Task board content */}
      <Box
        flex="1"
        width="100%"
        height={{ base: "auto", md: "calc(100vh - 120px)" }}
        overflow={{ base: "visible", md: "hidden" }}
        mb={0}
      >
        {renderView()}
      </Box>

      {/* List/Gantt don't render TaskCard, so the modal needs its own mount */}
      {viewMode !== 'board' && <TaskModalMount />}
    </VStack>
  );
};

export default TaskBoard;
