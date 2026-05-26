import React, { useMemo, useCallback } from 'react';
import { useToast } from '@chakra-ui/react';
import { TaskBoardContext } from '../../context/TaskBoardContext';
import { aggregateAllTasksColumns } from './views/allTasks';

// Cross-project read-only provider. Satisfies the same useTaskBoard() surface
// as TaskBoardProvider but with synthetic taskColumns aggregated across every
// project, and mutators that no-op + toast (the All Tasks view is for browsing;
// to make changes, switch into the specific project).
//
// Mounted in place of TaskBoardProvider when the selected project is the
// ALL_PROJECTS_ID sentinel — keeps TaskBoardProvider's optimistic-update
// machinery out of cross-project territory where it doesn't make sense.
export function AllTasksProvider({ projects, children }) {
  const toast = useToast();

  const taskColumns = useMemo(
    () => aggregateAllTasksColumns(projects),
    [projects],
  );

  const showReadOnlyToast = useCallback(
    (action) => {
      toast({
        title: `Open a project to ${action}`,
        description:
          'Switch from All Tasks to a specific project to make changes.',
        status: 'info',
        duration: 3500,
        isClosable: true,
        position: 'top',
      });
    },
    [toast],
  );

  const value = useMemo(() => {
    const noop = (action) => async () => {
      showReadOnlyToast(action);
      return { success: false };
    };
    return {
      taskColumns,
      isAllTasks: true,
      setTaskColumns: () => {},
      addTask: noop('add a task'),
      addTaskBatch: noop('add tasks'),
      moveTask: noop('move this task'),
      editTask: noop('edit this task'),
      deleteTask: noop('delete this task'),
      applyForTask: noop('apply for this task'),
      approveApplication: noop('approve this task'),
      assignTask: noop('assign this task'),
      rejectTask: noop('reject this task'),
    };
  }, [taskColumns, showReadOnlyToast]);

  return (
    <TaskBoardContext.Provider value={value}>
      {children}
    </TaskBoardContext.Provider>
  );
}
