/**
 * TaskBoardContext
 * Manages task board state with optimistic updates and web3 operations.
 * Uses the new service layer for blockchain interactions.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDataBaseContext } from './dataBaseContext';
import { useProjectContext } from './ProjectContext';
import { usePOContext } from './POContext';
import { useIPFScontext } from './ipfsContext';
import { useRefreshEmit, RefreshEvent } from './RefreshContext';
import { useNotification } from './NotificationContext';
import { useWeb3Services } from '../hooks/useWeb3Services';
import { calculatePayout } from '../util/taskUtils';

const TaskBoardContext = createContext();

export const useTaskBoard = () => {
  return useContext(TaskBoardContext);
};

/**
 * Merge server columns with optimistic columns, preserving task metadata
 * that the subgraph may not have re-indexed yet after a status change.
 *
 * When a task is claimed/submitted/completed, The Graph updates the entity
 * but may temporarily return null metadata while re-resolving the IPFS link.
 * This manifests as description='', difficulty='medium', estHours=1 (the
 * defaults in ProjectContext). We detect this pattern and keep the richer
 * optimistic data for those fields until the server catches up.
 */
function mergeColumnsPreservingMetadata(serverColumns, optimisticColumns) {
  // Build a lookup of task data from the optimistic (current) state
  const optimisticTaskMap = new Map();
  for (const col of optimisticColumns) {
    for (const task of col.tasks) {
      optimisticTaskMap.set(task.id, task);
    }
  }

  return serverColumns.map(col => ({
    ...col,
    tasks: col.tasks.map(task => {
      const optimistic = optimisticTaskMap.get(task.id);
      if (!optimistic) return task;

      // Server has all-default metadata but optimistic has real data →
      // the subgraph hasn't re-indexed the IPFS metadata yet.
      const serverHasDefaults =
        task.description === '' &&
        task.difficulty === 'medium' &&
        task.estHours === 1;
      const optimisticHasReal =
        optimistic.description !== '' ||
        optimistic.difficulty !== 'medium' ||
        optimistic.estHours !== 1;

      if (serverHasDefaults && optimisticHasReal) {
        return {
          ...task,
          description: optimistic.description,
          difficulty: optimistic.difficulty,
          estHours: optimistic.estHours,
          name: optimistic.name || task.name,
          title: optimistic.title || task.title,
        };
      }

      return task;
    }),
  }));
}

export const TaskBoardProvider = ({
  children,
  initialColumns,
  onUpdateColumns,
}) => {
  const [taskColumns, setTaskColumns] = useState(initialColumns);
  const { selectedProject } = useDataBaseContext();
  const { nextTaskId } = useProjectContext();
  const { taskManagerContractAddress } = usePOContext();
  const { addToIpfs } = useIPFScontext();
  const { emit } = useRefreshEmit();
  const { addNotification, updateNotification } = useNotification();

  // Get services from the new hook
  const { task: taskService, isReady } = useWeb3Services({
    ipfsService: { addToIpfs },
  });

  // Optimistic lock: prevents poll-interval from overwriting local optimistic state.
  // After an optimistic update, server data is suppressed until it catches up or
  // the grace period expires (safety valve).
  const optimisticLockRef = useRef(null);
  const OPTIMISTIC_GRACE_PERIOD = 65000; // 65s — covers 2+ poll-interval cycles (30s each)
  const lockClearTimerRef = useRef(null);
  const latestInitialColumnsRef = useRef(initialColumns);

  // Keep ref in sync so scheduleLockClear can apply the latest server data
  latestInitialColumnsRef.current = initialColumns;

  // Clear optimistic lock after a delay, giving the subgraph refetch time to arrive.
  // Timestamp-guarded: if a newer operation sets a fresh lock, this timer won't clobber it.
  const scheduleLockClear = useCallback(() => {
    if (lockClearTimerRef.current) {
      clearTimeout(lockClearTimerRef.current);
    }
    const lockTimestamp = optimisticLockRef.current;
    lockClearTimerRef.current = setTimeout(() => {
      if (optimisticLockRef.current === lockTimestamp) {
        optimisticLockRef.current = null;
        // Apply the latest server data, but merge with optimistic state to
        // preserve task metadata that the subgraph may not have re-indexed yet.
        setTaskColumns(prev =>
          mergeColumnsPreservingMetadata(latestInitialColumnsRef.current, prev)
        );
      }
      lockClearTimerRef.current = null;
    }, 11000);
  }, []);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (lockClearTimerRef.current) {
        clearTimeout(lockClearTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (optimisticLockRef.current) {
      const elapsed = Date.now() - optimisticLockRef.current;
      if (elapsed < OPTIMISTIC_GRACE_PERIOD) {
        // Lock is active — keep optimistic state, ignore server data.
        // scheduleLockClear will apply latest server data when the lock expires.
        return;
      }
      // Grace period expired — merge to preserve any metadata the subgraph
      // still hasn't re-indexed (same protection as scheduleLockClear).
      optimisticLockRef.current = null;
      setTaskColumns(prev => mergeColumnsPreservingMetadata(initialColumns, prev));
      return;
    }
    setTaskColumns(initialColumns);
  }, [initialColumns]);

  /**
   * Helper to create task IPFS metadata
   */
  const createTaskMetadata = useCallback(async (taskName, taskDescription, location, difficulty, estHours, submission) => {
    const data = {
      name: taskName,
      description: taskDescription,
      location: location,
      difficulty: difficulty,
      estHours: estHours,
      submission: submission,
    };
    const result = await addToIpfs(JSON.stringify(data));
    return result;
  }, [addToIpfs]);

  /**
   * Move a task between columns (claim, submit, complete)
   */
  const moveTask = useCallback(async (
    draggedTask,
    sourceColumnId,
    destColumnId,
    newIndex,
    submissionData,
    claimedBy
  ) => {
    if (!isReady || !taskService) {
      addNotification('Web3 not ready. Please connect your wallet.', 'error');
      return;
    }

    // Validate transition: only allow forward moves
    const validDest = { open: 'inProgress', inProgress: 'inReview', inReview: 'completed' };
    if (validDest[sourceColumnId] !== destColumnId) {
      addNotification('Invalid task transition.', 'error');
      return;
    }

    // Save previous state to revert in case of error
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumns));

    // Lock to prevent poll-interval from overwriting this optimistic update
    optimisticLockRef.current = Date.now();

    // Prepare the updated task
    const updatedTask = {
      ...draggedTask,
      submission:
        destColumnId === 'inReview' ? submissionData : draggedTask.submission,
      claimedBy:
        destColumnId === 'inProgress'
          ? claimedBy
          : destColumnId === 'open'
          ? ''
          : draggedTask.claimedBy,
    };

    // Optimistically update the UI — immutable update (no mutation of existing state)
    const newTaskColumns = taskColumns.map(col => {
      if (col.id === sourceColumnId) {
        return { ...col, tasks: col.tasks.filter(t => t.id !== draggedTask.id) };
      }
      if (col.id === destColumnId) {
        const tasks = [...col.tasks];
        tasks.splice(newIndex, 0, updatedTask);
        return { ...col, tasks };
      }
      return col;
    });

    setTaskColumns(newTaskColumns);

    let notifId = null;

    // Perform the Web3 operations asynchronously
    try {
      if (destColumnId === 'inProgress') {
        notifId = addNotification('Claiming task...', 'loading');
        const result = await taskService.claimTask(taskManagerContractAddress, draggedTask.id);
        if (result.success) {
          updateNotification(notifId, 'Task claimed successfully!', 'success');
          emit(RefreshEvent.TASK_CLAIMED, { taskId: draggedTask.id });
        } else {
          throw new Error(result.error?.userMessage || 'Failed to claim task');
        }
      } else if (destColumnId === 'inReview') {
        if (!submissionData) {
          throw new Error('Please enter a submission.');
        }
        notifId = addNotification('Submitting task...', 'loading');

        const ipfsHash = await createTaskMetadata(
          draggedTask.name,
          draggedTask.description,
          'In Review',
          draggedTask.difficulty,
          draggedTask.estHours,
          submissionData
        );

        const result = await taskService.submitTask(
          taskManagerContractAddress,
          draggedTask.id,
          ipfsHash.path
        );
        if (result.success) {
          updateNotification(notifId, 'Task submitted successfully!', 'success');
          emit(RefreshEvent.TASK_SUBMITTED, { taskId: draggedTask.id });
        } else {
          throw new Error(result.error?.userMessage || 'Failed to submit task');
        }
      } else if (destColumnId === 'completed') {
        notifId = addNotification('Completing task...', 'loading');
        const result = await taskService.completeTask(taskManagerContractAddress, draggedTask.id);
        if (result.success) {
          updateNotification(notifId, 'Task completed successfully!', 'success');
          emit(RefreshEvent.TASK_COMPLETED, { taskId: draggedTask.id });
        } else {
          throw new Error(result.error?.userMessage || 'Failed to complete task');
        }
      }

      // Use functional updater to get the latest state (consistent with addTask).
      // This avoids stale closure over newTaskColumns from before the await.
      let confirmedColumns;
      setTaskColumns(prev => {
        confirmedColumns = prev;
        return prev;
      });

      if (onUpdateColumns && confirmedColumns) {
        onUpdateColumns(confirmedColumns, selectedProject?.id);
      }
      scheduleLockClear();
    } catch (error) {
      // Revert the UI changes if there is an error
      console.error('Error moving task:', error);
      if (notifId) {
        updateNotification(notifId, error.message || 'Error moving task', 'error');
      } else {
        addNotification(error.message || 'Error moving task', 'error');
      }
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
    }
  }, [
    taskColumns,
    taskService,
    taskManagerContractAddress,
    isReady,
    addNotification,
    updateNotification,
    emit,
    createTaskMetadata,
    onUpdateColumns,
    scheduleLockClear,
  ]);

  /**
   * Add a new task
   */
  const addTask = useCallback(async (task, destColumnId) => {
    if (!isReady || !taskService) {
      addNotification('Web3 not ready. Please connect your wallet.', 'error');
      return;
    }

    const kubixPayout = calculatePayout(task.difficulty, task.estHours);

    // Save previous state
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumns));

    // Lock to prevent poll-interval from overwriting this optimistic update
    optimisticLockRef.current = Date.now();

    const predictedId = `${taskManagerContractAddress}-${nextTaskId}`.toLowerCase();
    const newTask = {
      ...task,
      id: task.id || predictedId,
      taskId: String(nextTaskId),
      projectId: selectedProject.id,
      kubixPayout: kubixPayout,
      isIndexing: true,
    };

    // Optimistically update the UI — immutable
    const newTaskColumns = taskColumns.map(col => {
      if (col.id !== destColumnId) return col;
      return { ...col, tasks: [...col.tasks, newTask] };
    });

    setTaskColumns(newTaskColumns);

    const notifId = addNotification('Creating task...', 'loading');

    try {
      const taskData = {
        payout: kubixPayout,
        name: task.name,
        description: task.description,
        projectId: selectedProject.id,
        location: 'Open',
        difficulty: task.difficulty,
        estHours: task.estHours,
        bountyToken: task.bountyToken,
        bountyPayout: task.bountyAmount,
        requiresApplication: task.requiresApplication || false,
      };

      let result;
      if (task.assignTo) {
        // Create and assign task in one transaction
        result = await taskService.createAndAssignTask(
          taskManagerContractAddress,
          taskData,
          task.assignTo
        );
      } else {
        // Create task normally
        result = await taskService.createTask(taskManagerContractAddress, taskData);
      }

      if (result.success) {
        updateNotification(notifId, task.assignTo ? 'Task created and assigned!' : 'Task created successfully!', 'success');

        // Task is now on-chain — mark it as no longer indexing so action buttons enable.
        // Use functional updater to avoid stale closure over taskColumns.
        let confirmedColumns;
        setTaskColumns(prev => {
          confirmedColumns = prev.map(col => ({
            ...col,
            tasks: col.tasks.map(t => t.id === newTask.id ? { ...t, isIndexing: false } : t),
          }));
          return confirmedColumns;
        });

        emit(RefreshEvent.TASK_CREATED, { task: newTask });

        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, selectedProject?.id);
        }
        scheduleLockClear();
      } else {
        throw new Error(result.error?.userMessage || 'Failed to create task');
      }
    } catch (error) {
      console.error('Error adding task:', error);
      updateNotification(notifId, error.message || 'Error creating task', 'error');
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
    }
  }, [
    taskColumns,
    taskService,
    taskManagerContractAddress,
    selectedProject,
    nextTaskId,
    isReady,
    addNotification,
    updateNotification,
    emit,
    onUpdateColumns,
    scheduleLockClear,
  ]);

  /**
   * Edit an existing task
   */
  const editTask = useCallback(async (updatedTask, destColumnId, destTaskIndex, projectName) => {
    if (!isReady || !taskService) {
      addNotification('Web3 not ready. Please connect your wallet.', 'error');
      return;
    }

    // Save previous state
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumns));

    // Lock to prevent poll-interval from overwriting this optimistic update
    optimisticLockRef.current = Date.now();

    const payout = calculatePayout(updatedTask.difficulty, updatedTask.estHours);

    const newTask = {
      ...updatedTask,
      Payout: payout,
    };

    // Optimistically update the UI — immutable
    const newTaskColumns = taskColumns.map(col => {
      if (col.id !== destColumnId) return col;
      return {
        ...col,
        tasks: col.tasks.map((t, i) => i === destTaskIndex ? newTask : t),
      };
    });

    setTaskColumns(newTaskColumns);

    const notifId = addNotification('Updating task...', 'loading');

    try {
      const result = await taskService.editTask(taskManagerContractAddress, updatedTask.id, {
        payout,
        name: updatedTask.name,
        description: updatedTask.description,
        location: 'Open',
        difficulty: updatedTask.difficulty,
        estHours: updatedTask.estHours,
        bountyToken: updatedTask.bountyToken,
        bountyPayout: updatedTask.bountyAmount,
      });

      if (result.success) {
        updateNotification(notifId, 'Task updated successfully!', 'success');
        emit(RefreshEvent.TASK_UPDATED, { taskId: updatedTask.id });

        let confirmedColumns;
        setTaskColumns(prev => { confirmedColumns = prev; return prev; });
        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, selectedProject?.id);
        }
        scheduleLockClear();
      } else {
        throw new Error(result.error?.userMessage || 'Failed to update task');
      }
    } catch (error) {
      console.error('Error editing task:', error);
      updateNotification(notifId, error.message || 'Error updating task', 'error');
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
    }
  }, [
    taskColumns,
    taskService,
    taskManagerContractAddress,
    isReady,
    addNotification,
    updateNotification,
    emit,
    onUpdateColumns,
    scheduleLockClear,
  ]);

  /**
   * Delete a task
   */
  const deleteTask = useCallback(async (taskId, columnId) => {
    if (!isReady || !taskService) {
      addNotification('Web3 not ready. Please connect your wallet.', 'error');
      return;
    }

    // Save previous state
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumns));

    // Lock to prevent poll-interval from overwriting this optimistic update
    optimisticLockRef.current = Date.now();

    // Optimistically update the UI — immutable
    const newTaskColumns = taskColumns.map(col => {
      if (col.id !== columnId) return col;
      return { ...col, tasks: col.tasks.filter(t => t.id !== taskId) };
    });

    setTaskColumns(newTaskColumns);

    const notifId = addNotification('Deleting task...', 'loading');

    try {
      const result = await taskService.cancelTask(taskManagerContractAddress, taskId);

      if (result.success) {
        updateNotification(notifId, 'Task deleted successfully!', 'success');
        emit(RefreshEvent.TASK_CANCELLED, { taskId });

        let confirmedColumns;
        setTaskColumns(prev => { confirmedColumns = prev; return prev; });
        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, selectedProject?.id);
        }
        scheduleLockClear();
      } else {
        throw new Error(result.error?.userMessage || 'Failed to delete task');
      }
    } catch (error) {
      console.error('Error deleting task:', error);
      updateNotification(notifId, error.message || 'Error deleting task', 'error');
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
    }
  }, [
    taskColumns,
    taskService,
    taskManagerContractAddress,
    isReady,
    addNotification,
    updateNotification,
    emit,
    onUpdateColumns,
    scheduleLockClear,
  ]);

  /**
   * Apply for a task that requires application
   */
  const applyForTask = useCallback(async (taskId, applicationData, applicantAddress) => {
    if (!isReady || !taskService) {
      addNotification('Web3 not ready. Please connect your wallet.', 'error');
      return { success: false };
    }

    // Save previous state for rollback
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumns));

    // Optimistically add applicant to the task so UI reflects immediately
    let newTaskColumns;
    if (applicantAddress) {
      newTaskColumns = taskColumns.map(col => ({
        ...col,
        tasks: col.tasks.map(t =>
          t.id === taskId
            ? {
                ...t,
                applicants: [
                  ...(t.applicants || []),
                  { address: applicantAddress, username: '', appliedAt: Math.floor(Date.now() / 1000), approved: false },
                ],
              }
            : t
        ),
      }));
      optimisticLockRef.current = Date.now();
      setTaskColumns(newTaskColumns);
    }

    const notifId = addNotification('Submitting application...', 'loading');

    try {
      const result = await taskService.applyForTask(
        taskManagerContractAddress,
        taskId,
        applicationData
      );

      if (result.success) {
        updateNotification(notifId, 'Application submitted successfully!', 'success');
        emit(RefreshEvent.TASK_APPLICATION_SUBMITTED, { taskId });
        if (applicantAddress) {
          if (onUpdateColumns) onUpdateColumns(newTaskColumns, selectedProject?.id);
          scheduleLockClear();
        }
        return { success: true };
      } else {
        throw new Error(result.error?.userMessage || 'Failed to submit application');
      }
    } catch (error) {
      console.error('Error applying for task:', error);
      updateNotification(notifId, error.message || 'Error submitting application', 'error');
      if (applicantAddress) {
        optimisticLockRef.current = null;
        setTaskColumns(previousTaskColumns);
      }
      return { success: false, error };
    }
  }, [taskColumns, taskService, taskManagerContractAddress, selectedProject, isReady, addNotification, updateNotification, emit, onUpdateColumns, scheduleLockClear]);

  /**
   * Approve an application for a task
   */
  const approveApplication = useCallback(async (taskId, applicantAddress, applicantUsername) => {
    if (!isReady || !taskService) {
      addNotification('Web3 not ready. Please connect your wallet.', 'error');
      return { success: false };
    }

    // Save previous state for rollback
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumns));

    // Lock to prevent poll-interval from overwriting this optimistic update
    optimisticLockRef.current = Date.now();

    // Optimistically move task from open to inProgress — immutable
    let movedTask = null;
    const newTaskColumns = taskColumns.map(col => {
      if (col.id === 'open') {
        const task = col.tasks.find(t => t.id === taskId);
        if (task) {
          movedTask = {
            ...task,
            claimedBy: applicantAddress,
            claimerUsername: applicantUsername || '',
            status: 'Assigned',
          };
        }
        return { ...col, tasks: col.tasks.filter(t => t.id !== taskId) };
      }
      if (col.id === 'inProgress' && movedTask) {
        return { ...col, tasks: [...col.tasks, movedTask] };
      }
      return col;
    });

    setTaskColumns(newTaskColumns);

    const notifId = addNotification('Approving application...', 'loading');

    try {
      const result = await taskService.approveApplication(
        taskManagerContractAddress,
        taskId,
        applicantAddress
      );

      if (result.success) {
        updateNotification(notifId, 'Application approved successfully!', 'success');
        emit(RefreshEvent.TASK_APPLICATION_APPROVED, { taskId, applicantAddress });

        let confirmedColumns;
        setTaskColumns(prev => { confirmedColumns = prev; return prev; });
        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, selectedProject?.id);
        }
        scheduleLockClear();

        return { success: true };
      } else {
        throw new Error(result.error?.userMessage || 'Failed to approve application');
      }
    } catch (error) {
      console.error('Error approving application:', error);
      updateNotification(notifId, error.message || 'Error approving application', 'error');
      // Rollback optimistic update on failure
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
      return { success: false, error };
    }
  }, [taskColumns, taskService, taskManagerContractAddress, isReady, addNotification, updateNotification, emit, onUpdateColumns, scheduleLockClear]);

  /**
   * Assign a task to a specific user
   */
  const assignTask = useCallback(async (taskId, assigneeAddress, assigneeUsername) => {
    if (!isReady || !taskService) {
      addNotification('Web3 not ready. Please connect your wallet.', 'error');
      return { success: false };
    }

    // Save previous state for rollback
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumns));

    // Lock to prevent poll-interval from overwriting this optimistic update
    optimisticLockRef.current = Date.now();

    // Optimistically move task from open to inProgress — immutable
    let movedTask = null;
    const newTaskColumns = taskColumns.map(col => {
      if (col.id === 'open') {
        const task = col.tasks.find(t => t.id === taskId);
        if (task) {
          movedTask = {
            ...task,
            claimedBy: assigneeAddress,
            claimerUsername: assigneeUsername || '',
            status: 'Assigned',
          };
        }
        return { ...col, tasks: col.tasks.filter(t => t.id !== taskId) };
      }
      if (col.id === 'inProgress' && movedTask) {
        return { ...col, tasks: [...col.tasks, movedTask] };
      }
      return col;
    });

    setTaskColumns(newTaskColumns);

    const notifId = addNotification('Assigning task...', 'loading');

    try {
      const result = await taskService.assignTask(
        taskManagerContractAddress,
        taskId,
        assigneeAddress
      );

      if (result.success) {
        updateNotification(notifId, 'Task assigned successfully!', 'success');
        emit(RefreshEvent.TASK_ASSIGNED, { taskId, assigneeAddress });

        let confirmedColumns;
        setTaskColumns(prev => { confirmedColumns = prev; return prev; });
        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, selectedProject?.id);
        }
        scheduleLockClear();

        return { success: true };
      } else {
        throw new Error(result.error?.userMessage || 'Failed to assign task');
      }
    } catch (error) {
      console.error('Error assigning task:', error);
      updateNotification(notifId, error.message || 'Error assigning task', 'error');
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
      return { success: false, error };
    }
  }, [taskColumns, taskService, taskManagerContractAddress, isReady, addNotification, updateNotification, emit, onUpdateColumns, scheduleLockClear]);

  /**
   * Reject a submitted task, moving it back to inProgress
   */
  const rejectTask = useCallback(async (task, rejectionReason) => {
    if (!isReady || !taskService) {
      addNotification('Web3 not ready. Please connect your wallet.', 'error');
      return { success: false };
    }

    if (!rejectionReason || rejectionReason.trim() === '') {
      addNotification('Please provide a rejection reason.', 'error');
      return { success: false };
    }

    // Save previous state for rollback
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumns));

    // Lock to prevent poll-interval from overwriting this optimistic update
    optimisticLockRef.current = Date.now();

    // Optimistically move task from inReview to inProgress — immutable
    const newTaskColumns = taskColumns.map(col => {
      if (col.id === 'inReview') {
        return { ...col, tasks: col.tasks.filter(t => t.id !== task.id) };
      }
      if (col.id === 'inProgress') {
        return { ...col, tasks: [...col.tasks, { ...task }] };
      }
      return col;
    });

    setTaskColumns(newTaskColumns);

    const notifId = addNotification('Rejecting task...', 'loading');

    try {
      // Upload rejection reason to IPFS
      const rejectionMetadata = JSON.stringify({ rejection: rejectionReason.trim() });
      const ipfsResult = await addToIpfs(rejectionMetadata);

      const result = await taskService.rejectTask(
        taskManagerContractAddress,
        task.id,
        ipfsResult.path
      );

      if (result.success) {
        updateNotification(notifId, 'Task rejected successfully!', 'success');
        emit(RefreshEvent.TASK_REJECTED, { taskId: task.id });

        let confirmedColumns;
        setTaskColumns(prev => { confirmedColumns = prev; return prev; });
        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, selectedProject?.id);
        }
        scheduleLockClear();

        return { success: true };
      } else {
        throw new Error(result.error?.userMessage || 'Failed to reject task');
      }
    } catch (error) {
      console.error('Error rejecting task:', error);
      updateNotification(notifId, error.message || 'Error rejecting task', 'error');
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
      return { success: false, error };
    }
  }, [
    taskColumns,
    taskService,
    taskManagerContractAddress,
    isReady,
    addNotification,
    updateNotification,
    emit,
    addToIpfs,
    onUpdateColumns,
    scheduleLockClear,
  ]);

  const value = useMemo(() => ({
    taskColumns,
    moveTask,
    addTask,
    editTask,
    deleteTask,
    applyForTask,
    approveApplication,
    assignTask,
    rejectTask,
  }), [taskColumns, moveTask, addTask, editTask, deleteTask, applyForTask, approveApplication, assignTask, rejectTask]);

  return (
    <TaskBoardContext.Provider value={value}>
      {children}
    </TaskBoardContext.Provider>
  );
};
