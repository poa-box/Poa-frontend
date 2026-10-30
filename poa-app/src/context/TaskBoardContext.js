/**
 * TaskBoardContext
 * Manages task board state with optimistic updates and web3 operations.
 * Uses the new service layer for blockchain interactions.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDataBaseContext } from '@/context/dataBaseContext';
import { useProjectContext } from '@/context/ProjectContext';
import { usePOContext } from '@/context/POContext';
import { useIPFScontext } from '@/context/ipfsContext';
import { useRefreshEmit, RefreshEvent } from '@/context/RefreshContext';
import { useNotification } from '@/context/NotificationContext';
import { useWeb3Services } from '@/hooks/useWeb3Services';
import { calculatePayout } from '@/util/taskUtils';
import { useSubgraphClient } from '@/util/apolloClient';
import { fetchLatestRejectedSubmission } from '@/util/taskSubmissionHistory';
import { useAuth } from '@/context/authState';
import { createTaskMetadataStore } from '@/lib/tasks/metadataBase';
import { editTaskMetadata as mergeTaskMetadata } from '@/lib/tasks/metadata';
import { assertTaskHostScope, assertCurrentTask, taskHostScopeKey, TASK_OPTIMISTIC_GRACE_MS, remainingTaskLockDelay, memberTaskError } from '@/lib/tasks/hostScope';
import { pendingTaskId, reconcileCreatedTasks, indexedCreationContinuation } from '@/lib/tasks/creationReconciliation';
import { serializeTaskMetadata, buildTaskRejectionMetadata, serializeTaskRejectionMetadata } from '@poa-box/core/metadata/task';
import { nowMs } from '@/util/deadlineUtils';
import { taskReceiptBlock, indexedTaskProject, reconcileTaskHostColumns, reconcileIndexedCreation } from '@/lib/tasks/hostState';

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
          // metadata-borne due date lags re-indexing the same way
          dueDate: optimistic.dueDate ?? task.dueDate,
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
  const [taskColumns, setTaskColumnsState] = useState(initialColumns);
  const { selectedProject } = useDataBaseContext();
  const { projectsData, getTaskActions, refetchProjects } = useProjectContext();
  const { accountAddress, isAuthHydrated, isPasskeyUser, isAuthenticated } = useAuth();
  const { orgId, orgChainId, taskManagerContractAddress, taskPayoutHoursOnly, taskPayoutHourlyRate, subgraphUrl } = usePOContext();
  const { addToIpfs, safeFetchFromIpfs, fetchFromIpfs } = useIPFScontext();
  const { emit } = useRefreshEmit();
  const { addNotification, updateNotification } = useNotification();

  // Org-level payout config handed to calculatePayout(). Memoized on the raw
  // primitives so its identity is stable across unrelated re-renders (keeps the
  // tx callbacks below from being recreated needlessly).
  const payoutConfig = useMemo(
    () => ({ hoursOnly: taskPayoutHoursOnly, hourlyRate: taskPayoutHourlyRate }),
    [taskPayoutHoursOnly, taskPayoutHourlyRate]
  );

  // Get services from the new hook — do NOT pass { ipfsService: { addToIpfs } } here,
  // useWeb3Services already gets it from useIPFScontext(). Passing an inline object
  // creates a new reference every render, causing all services to be recreated.
  const { task: taskService, txManager, isReady, getNotReadyMessage } = useWeb3Services();
  const subgraphClient = useSubgraphClient(subgraphUrl);

  // Ref to access current taskColumns inside callbacks without adding taskColumns
  // to their dependency arrays (which would recreate every callback on each column change).
  const taskColumnsRef = useRef(taskColumns);
  taskColumnsRef.current = taskColumns;
  // Keep async callbacks and mounted modals on the same optimistic snapshot,
  // including writes which finish before React commits the next render.
  const setTaskColumns = useCallback(update => {
    const next = typeof update === 'function' ? update(taskColumnsRef.current) : update;
    taskColumnsRef.current = next;
    setTaskColumnsState(next);
  }, []);

  // Latest-ref for getNotReadyMessage. The action callbacks below key their deps on
  // `isReady` (a boolean), which stays false across the signed-out → initializing
  // transition even though getNotReadyMessage's identity changes with readyState.
  // Reading it through a stable ref avoids capturing a stale (e.g. "signed out")
  // message and keeps the callbacks from being recreated on every readiness change.
  const getNotReadyMessageRef = useRef(getNotReadyMessage);
  getNotReadyMessageRef.current = getNotReadyMessage;

  // Optimistic lock: prevents poll-interval from overwriting local optimistic state.
  // After an optimistic update, server data is suppressed until it catches up or
  // the grace period expires (safety valve).
  const optimisticLockRef = useRef(null);
  const lockClearTimerRef = useRef(null);
  const taskWritesRef = useRef(new Map());
  const pendingCreationsRef = useRef(new Map());
  const latestInitialColumnsRef = useRef(initialColumns);

  // Keep ref in sync so scheduleLockClear can apply the latest server data
  latestInitialColumnsRef.current = initialColumns;

  const scope = { chainId: orgChainId, orgId, contract: taskManagerContractAddress,
    endpoint: subgraphUrl, projectId: selectedProject?.id, account: accountAddress, hydrated: isAuthHydrated === true && isAuthenticated === true };
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const projectsRef = useRef(projectsData);
  projectsRef.current = projectsData;
  const getTaskActionsRef = useRef(getTaskActions);
  getTaskActionsRef.current = getTaskActions;
  const metadataStore = useRef(null);
  if (!metadataStore.current) metadataStore.current = createTaskMetadataStore();
  const boardScopeKey = taskHostScopeKey(scope);
  const previousScope = useRef(boardScopeKey);
  useEffect(() => {
    if (previousScope.current === boardScopeKey) return;
    previousScope.current = boardScopeKey;
    metadataStore.current.clear();
    taskWritesRef.current.clear();
    pendingCreationsRef.current.clear();
    optimisticLockRef.current = null;
    if (lockClearTimerRef.current) clearTimeout(lockClearTimerRef.current);
    setTaskColumns(initialColumns);
  }, [boardScopeKey, initialColumns, setTaskColumns]);

  const currentProject = useCallback(() => projectsRef.current?.find(project => project.id === scopeRef.current.projectId), []);
  const currentTask = useCallback(id => currentProject()?.columns?.flatMap(column => column.tasks).find(task => task.id === id), [currentProject]);
  const beginTaskAction = useCallback((action, task) => {
    const captured = { ...scopeRef.current };
    const project = currentProject();
    const savedTask = task ? currentTask(task.id) : null;
    if (savedTask && task && Object.prototype.hasOwnProperty.call(task, 'metadataHash')) {
      try { assertCurrentTask(savedTask, task); } catch {
        addNotification('The saved task details changed. Reopen the task before editing.', 'error');
        return null;
      }
    }
    const decisions = getTaskActionsRef.current?.(savedTask, project, nowMs());
    if (!mountedRef.current || !captured.hydrated || !captured.account || !project || (task && (!savedTask || savedTask.isIndexing))
        || decisions?.[action]?.state !== 'allowed') {
      addNotification('This action is unavailable while task details or your permissions are loading. Please try again.', 'error');
      return null;
    }
    const assertScope = () => {
      if (!mountedRef.current) throw memberTaskError('Reopen the task to see its current state.');
      assertTaskHostScope(scopeRef.current, captured);
    };
    const guard = () => {
      assertScope();
      const latestTask = savedTask ? currentTask(savedTask.id) : null;
      if (savedTask) assertCurrentTask(latestTask, savedTask);
      if (getTaskActionsRef.current?.(latestTask, currentProject(), nowMs())?.[action]?.state !== 'allowed') {
        throw memberTaskError('The task or your permissions changed. Reload the task and try again.');
      }
    };
    guard.assertScope = assertScope;
    guard.scope = captured;
    guard.task = savedTask;
    if (savedTask) taskWritesRef.current.set(savedTask.id, { guard, action, scopeKey: taskHostScopeKey(captured), block: null });
    guard.isCurrent = () => mountedRef.current && taskHostScopeKey(scopeRef.current) === taskHostScopeKey(captured);
    return guard;
  }, [currentProject, currentTask, addNotification]);

  const getTaskMetadata = useCallback(async (task, guard) => {
    const captured = guard?.scope || { ...scopeRef.current };
    return metadataStore.current.load({ task, scope: captured,
      currentScope: () => scopeRef.current, currentTask: () => currentTask(task.id), fetchFromIpfs });
  }, [currentTask, fetchFromIpfs]);

  const reconcileCreation = useCallback(async (result, drafts, prepared, guard) => {
    guard.assertScope();
    const { taskCreatedIdsFromResult } = await import('@/lib/tasks/receipts');
    guard.assertScope();
    const requiresOperationScope = isPasskeyUser || Boolean(txManager?.bundlerClient);
    const matched = prepared ? taskCreatedIdsFromResult(result, taskManagerContractAddress, prepared.creations,
      { requiresOperationScope, directCreationCall: !requiresOperationScope }) : { state: 'unknown' };
    let continuation;
    if (matched.state !== 'known') {
      try {
        continuation = await indexedCreationContinuation({ result, scope: guard.scope,
          refresh: refetchProjects, assertCurrent: guard.assertScope });
      } catch { guard.assertScope(); /* A confirmed write remains successful while indexing catches up. */ }
    }
    guard.assertScope();
    const confirmedColumns = continuation ? reconcileIndexedCreation(taskColumnsRef.current, continuation.columns,
      drafts.map(task => task.id), continuation.source, guard.scope, taskWritesRef.current) : reconcileCreatedTasks(taskColumnsRef.current,
      drafts.map(task => task.id), matched, taskManagerContractAddress);
    if (!continuation && matched.state !== 'known') pendingCreationsRef.current.set(guard,
      { scopeKey: taskHostScopeKey(guard.scope), block: taskReceiptBlock(result), pendingIds: drafts.map(task => task.id) });
    if (!continuation && matched.state === 'known') {
      for (const id of matched.value) taskWritesRef.current.set(`${taskManagerContractAddress.toLowerCase()}-${id}`,
        { guard, scopeKey: taskHostScopeKey(guard.scope), block: taskReceiptBlock(result) });
    }
    const settledColumns = reconcileTaskHostColumns(confirmedColumns, currentProject(), guard.scope, taskWritesRef.current, pendingCreationsRef.current);
    setTaskColumns(settledColumns);
    // Indexed continuation certifies the whole current project, never a guessed draft-to-ID match.
    const confirmedTasks = continuation ? [] : drafts.map((task, index) => matched.state === 'known'
      ? { ...task, id: `${taskManagerContractAddress.toLowerCase()}-${matched.value[index]}`,
        taskId: matched.value[index], isIndexing: false } : task);
    return { confirmedColumns: settledColumns, confirmedTasks, indexedSource: continuation?.source };
  }, [taskManagerContractAddress, isPasskeyUser, txManager, refetchProjects, currentProject, setTaskColumns]);

  // Clear optimistic lock after a delay, giving the subgraph refetch time to arrive.
  // Timestamp-guarded: if a newer operation sets a fresh lock, this timer won't clobber it.
  const scheduleLockClear = useCallback((result, guard) => {
    const write = guard?.task && taskWritesRef.current.get(guard.task.id);
    // Application lists are previews; their absence cannot settle local application optimism.
    if (write?.guard === guard && write.action !== 'apply') write.block = taskReceiptBlock(result);
    const settled = reconcileTaskHostColumns(taskColumnsRef.current, currentProject(), scopeRef.current, taskWritesRef.current, pendingCreationsRef.current);
    setTaskColumns(settled);
    if (lockClearTimerRef.current) {
      clearTimeout(lockClearTimerRef.current);
    }
    const lockTimestamp = optimisticLockRef.current;
    lockClearTimerRef.current = setTimeout(() => {
      if (optimisticLockRef.current === lockTimestamp) {
        optimisticLockRef.current = null;
        // Apply the latest server data, but merge with optimistic state to
        // preserve task metadata that the subgraph may not have re-indexed yet.
        const indexed = indexedTaskProject(currentProject(), scopeRef.current);
        setTaskColumns(prev => mergeColumnsPreservingMetadata(indexed?.columns || latestInitialColumnsRef.current, prev));
        taskWritesRef.current.clear();
        pendingCreationsRef.current.clear();
      }
      lockClearTimerRef.current = null;
    }, remainingTaskLockDelay(lockTimestamp));
  }, [currentProject, setTaskColumns]);

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
      if (elapsed < TASK_OPTIMISTIC_GRACE_MS) {
        // Confirmed, scoped indexed rows can settle without releasing the lock
        // protecting other writes. Pending writes and old snapshots stay untouched.
        setTaskColumns(prev => reconcileTaskHostColumns(prev, currentProject(), scopeRef.current, taskWritesRef.current, pendingCreationsRef.current));
        return;
      }
      // Grace period expired — merge to preserve any metadata the subgraph
      // still hasn't re-indexed (same protection as scheduleLockClear).
      optimisticLockRef.current = null;
      const indexed = indexedTaskProject(currentProject(), scopeRef.current);
      setTaskColumns(prev => mergeColumnsPreservingMetadata(indexed?.columns || initialColumns, prev));
      taskWritesRef.current.clear();
      pendingCreationsRef.current.clear();
      return;
    }
    setTaskColumns(initialColumns);
  }, [initialColumns, projectsData, boardScopeKey, currentProject, setTaskColumns]);

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
      addNotification(getNotReadyMessageRef.current(), 'error');
      return;
    }

    // Validate transition: only allow forward moves
    const validDest = { open: 'inProgress', inProgress: 'inReview', inReview: 'completed' };
    if (validDest[sourceColumnId] !== destColumnId) {
      addNotification('Invalid task transition.', 'error');
      return;
    }

    const guard = beginTaskAction(destColumnId === 'inProgress' ? 'claim' : destColumnId === 'inReview' ? 'submit' : 'complete', draggedTask);
    if (!guard) return { success: false };

    // Save previous state to revert in case of error
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumnsRef.current));

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
    const newTaskColumns = taskColumnsRef.current.map(col => {
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
    let result;

    // Perform the Web3 operations asynchronously
    try {
      if (destColumnId === 'inProgress') {
        notifId = addNotification('Claiming task...', 'loading');
        result = await taskService.claimTask(taskManagerContractAddress, draggedTask.id, { assertCurrent: guard });
        guard.assertScope();
        if (result.success) {
          updateNotification(notifId, 'Task claimed successfully!', 'success');
          emit(RefreshEvent.TASK_CLAIMED, { taskId: draggedTask.id });
        } else {
          throw memberTaskError(result.error?.userMessage || 'Failed to claim task');
        }
      } else if (destColumnId === 'inReview') {
        if (!submissionData) {
          throw memberTaskError('Please enter a submission.');
        }
        notifId = addNotification('Submitting task...', 'loading');

        const baseMetadata = await getTaskMetadata(guard.task, guard);
        guard();
        const document = mergeTaskMetadata({ baseMetadata, submission: submissionData, location: 'In Review' });
        const ipfsHash = await addToIpfs(serializeTaskMetadata(document));
        guard();

        result = await taskService.submitTask(
          taskManagerContractAddress,
          draggedTask.id,
          ipfsHash.path,
          { assertCurrent: guard }
        );
        guard.assertScope();
        if (result.success) {
          updateNotification(notifId, 'Task submitted successfully!', 'success');
          emit(RefreshEvent.TASK_SUBMITTED, { taskId: draggedTask.id });
        } else {
          throw memberTaskError(result.error?.userMessage || 'Failed to submit task');
        }
      } else if (destColumnId === 'completed') {
        notifId = addNotification('Completing task...', 'loading');
        result = await taskService.completeTask(taskManagerContractAddress, draggedTask.id, { assertCurrent: guard });
        guard.assertScope();
        if (result.success) {
          updateNotification(notifId, 'Task completed successfully!', 'success');
          emit(RefreshEvent.TASK_COMPLETED, { taskId: draggedTask.id });
        } else {
          throw memberTaskError(result.error?.userMessage || 'Failed to complete task');
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
      scheduleLockClear(result, guard);
    } catch (error) {
      // Revert the UI changes if there is an error
      if (!guard.isCurrent()) {
        if (typeof notifId !== 'undefined' && notifId) updateNotification(notifId, 'Your account or organization changed. Reopen the task to see its current state.', 'error');
        return { success: false };
      }
      if (notifId) {
        updateNotification(notifId, error.userMessage || 'Error moving task', 'error');
      } else {
        addNotification(error.userMessage || 'Error moving task', 'error');
      }
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
    }
  }, [beginTaskAction, getTaskMetadata,
    taskService,
    taskManagerContractAddress,
    isReady,
    addNotification,
    updateNotification,
    emit,
    addToIpfs,
    onUpdateColumns,
    scheduleLockClear,
    setTaskColumns,
    selectedProject?.id,
  ]);

  /**
   * Add a new task
   */
  const addTask = useCallback(async (task, destColumnId) => {
    if (!isReady || !taskService) {
      addNotification(getNotReadyMessageRef.current(), 'error');
      return;
    }

    const kubixPayout = calculatePayout(task.difficulty, task.estHours, payoutConfig);

    const guard = beginTaskAction(task.assignTo ? 'createAndAssign' : 'create', null);
    if (!guard) return { success: false };

    // Save previous state
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumnsRef.current));

    // Lock to prevent poll-interval from overwriting this optimistic update
    optimisticLockRef.current = Date.now();

    const predictedId = pendingTaskId();
    const newTask = {
      ...task,
      id: predictedId,
      taskId: undefined,
      projectId: selectedProject.id,
      kubixPayout: kubixPayout,
      isIndexing: true,
    };

    // Optimistically update the UI — immutable
    const newTaskColumns = taskColumnsRef.current.map(col => {
      if (col.id !== destColumnId) return col;
      return { ...col, tasks: [...col.tasks, newTask] };
    });

    taskColumnsRef.current = newTaskColumns;
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
        dueDate: task.dueDate ?? null,
        absoluteDeadline: task.absoluteDeadline || 0,
        completionWindow: task.completionWindow || 0,
      };

      let prepared;
      const options = { assertCurrent: guard, onPreparedCreation: value => { guard(); prepared = value; } };
      let result;
      if (task.assignTo) {
        // Create and assign task in one transaction
        result = await taskService.createAndAssignTask(
          taskManagerContractAddress,
          taskData,
          task.assignTo,
          options
        );
      } else {
        // Create task normally
        result = await taskService.createTask(taskManagerContractAddress, taskData, options);
      }

      guard.assertScope();
      if (result.success) {
        updateNotification(notifId, task.assignTo ? 'Task created and assigned!' : 'Task created successfully!', 'success');

        const { confirmedColumns, confirmedTasks, indexedSource } = await reconcileCreation(result, [newTask], prepared, guard);

        emit(RefreshEvent.TASK_CREATED, confirmedTasks.length ? { task: confirmedTasks[0] } : { source: indexedSource });

        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, selectedProject?.id);
        }
        scheduleLockClear(result, guard);
      } else {
        throw memberTaskError(result.error?.userMessage || 'Failed to create task');
      }
    } catch (error) {
      if (!guard.isCurrent()) {
        if (typeof notifId !== 'undefined' && notifId) updateNotification(notifId, 'Your account or organization changed. Reopen the task to see its current state.', 'error');
        return { success: false };
      }
      updateNotification(notifId, error.userMessage || 'Error creating task', 'error');
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
    }
  }, [beginTaskAction, reconcileCreation,
    taskService,
    taskManagerContractAddress,
    payoutConfig,
    selectedProject,
    isReady,
    addNotification,
    updateNotification,
    emit,
    onUpdateColumns,
    scheduleLockClear,
    setTaskColumns,
  ]);

  /**
   * Submit many drafted tasks in a single createTasksBatch transaction.
   * `drafts` are the same shape AddTaskModal emits (name, description, difficulty,
   * estHours, bountyToken, bountyAmount, requiresApplication). All drafts must
   * target the same `projectId`.
   */
  const addTaskBatch = useCallback(async (drafts, projectId, destColumnId) => {
    if (!isReady || !taskService) {
      addNotification(getNotReadyMessageRef.current(), 'error');
      return { success: false };
    }
    if (!Array.isArray(drafts) || drafts.length === 0) {
      addNotification('No drafts to submit.', 'error');
      return { success: false };
    }

    const guard = beginTaskAction('create', null);
    if (!guard) return { success: false };

    if (projectId !== guard.scope.projectId) return { success: false };

    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumnsRef.current));
    optimisticLockRef.current = Date.now();

    const optimisticTasks = drafts.map(d => {
      const kubixPayout = calculatePayout(d.difficulty, d.estHours, payoutConfig);
      const predictedId = pendingTaskId();
      return {
        id: predictedId,
        taskId: undefined,
        projectId,
        name: d.name,
        description: d.description,
        difficulty: d.difficulty,
        estHours: d.estHours,
        bountyToken: d.bountyToken,
        bountyAmount: d.bountyAmount,
        requiresApplication: !!d.requiresApplication,
        dueDate: d.dueDate ?? null,
        absoluteDeadline: d.absoluteDeadline || 0,
        completionWindow: d.completionWindow || 0,
        kubixPayout,
        isIndexing: true,
      };
    });

    const newTaskColumns = taskColumnsRef.current.map(col => {
      if (col.id !== destColumnId) return col;
      return { ...col, tasks: [...col.tasks, ...optimisticTasks] };
    });
    taskColumnsRef.current = newTaskColumns;
    setTaskColumns(newTaskColumns);

    const notifId = addNotification(`Creating ${drafts.length} tasks...`, 'loading');

    try {
      // NOTE: assignTo is intentionally omitted. createTasksBatch has no
      // per-item assignee parameter (tracked in poa-box/POP#152). The modal
      // also clears selectedUser when entering draft mode, so drafts should
      // never carry one — but we don't forward it even if a future code path
      // does, to keep the behaviour explicit at the boundary.
      const taskData = drafts.map(d => ({
        payout: calculatePayout(d.difficulty, d.estHours, payoutConfig),
        name: d.name,
        description: d.description,
        location: 'Open',
        difficulty: d.difficulty,
        estHours: d.estHours,
        bountyToken: d.bountyToken,
        bountyPayout: d.bountyAmount,
        requiresApplication: !!d.requiresApplication,
        dueDate: d.dueDate ?? null,
        absoluteDeadline: d.absoluteDeadline || 0,
        completionWindow: d.completionWindow || 0,
      }));

      let prepared;
      const result = await taskService.createTasksBatch(
        taskManagerContractAddress,
        projectId,
        taskData,
        { assertCurrent: guard, onPreparedCreation: value => { guard(); prepared = value; } }
      );

      guard.assertScope();
      if (result.success) {
        updateNotification(notifId, `${drafts.length} tasks created!`, 'success');

        const { confirmedColumns, confirmedTasks, indexedSource } = await reconcileCreation(result, optimisticTasks, prepared, guard);

        if (confirmedTasks.length) confirmedTasks.forEach(t => emit(RefreshEvent.TASK_CREATED, { task: t }));
        else emit(RefreshEvent.TASK_CREATED, { source: indexedSource });

        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, projectId);
        }
        scheduleLockClear(result, guard);
        return { success: true };
      }
      throw memberTaskError(result.error?.userMessage || 'Failed to create tasks');
    } catch (error) {
      if (!guard.isCurrent()) {
        if (typeof notifId !== 'undefined' && notifId) updateNotification(notifId, 'Your account or organization changed. Reopen the task to see its current state.', 'error');
        return { success: false };
      }
      updateNotification(notifId, error.userMessage || 'Error creating tasks', 'error');
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
      return { success: false, error };
    }
  }, [beginTaskAction, reconcileCreation,
    taskService,
    taskManagerContractAddress,
    payoutConfig,
    isReady,
    addNotification,
    updateNotification,
    emit,
    onUpdateColumns,
    scheduleLockClear,
    setTaskColumns,
  ]);

  /**
   * Edit an existing task
   */
  const editTask = useCallback(async (updatedTask, destColumnId, destTaskIndex, projectName) => {
    if (!isReady || !taskService) {
      addNotification(getNotReadyMessageRef.current(), 'error');
      return;
    }

    const guard = beginTaskAction('editFull', updatedTask);
    if (!guard) return { success: false };

    // Save previous state
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumnsRef.current));

    // Lock to prevent poll-interval from overwriting this optimistic update
    optimisticLockRef.current = Date.now();

    const payout = calculatePayout(updatedTask.difficulty, updatedTask.estHours, payoutConfig);

    const newTask = {
      ...updatedTask,
      Payout: payout,
    };

    // Optimistically update the UI — immutable
    const newTaskColumns = taskColumnsRef.current.map(col => {
      if (col.id !== destColumnId) return col;
      return {
        ...col,
        tasks: col.tasks.map((t, i) => i === destTaskIndex ? newTask : t),
      };
    });

    setTaskColumns(newTaskColumns);

    const notifId = addNotification('Updating task...', 'loading');

    try {
      if (!taskService.ipfs) throw memberTaskError('Task details are still loading. Please try again.');
      const baseMetadata = await getTaskMetadata(guard.task, guard);
      guard();
      if (guard.task.absoluteDeadline === undefined || guard.task.completionWindow === undefined) {
        throw memberTaskError('The saved task deadlines are unavailable. Reload the task and try again.');
      }
      const result = await taskService.editTask(taskManagerContractAddress, updatedTask.id, {
        payout,
        baseMetadata,
        name: updatedTask.name,
        description: updatedTask.description,
        location: baseMetadata.location,
        difficulty: updatedTask.difficulty,
        estHours: updatedTask.estHours,
        bountyToken: updatedTask.bountyToken,
        bountyPayout: updatedTask.bountyAmount,
        dueDate: updatedTask.dueDate,
        absoluteDeadline: updatedTask.absoluteDeadline ?? guard.task.absoluteDeadline,
        completionWindow: updatedTask.completionWindow ?? guard.task.completionWindow,
      }, { assertCurrent: guard });

      guard.assertScope();
      if (result.success) {
        updateNotification(notifId, 'Task updated successfully!', 'success');
        emit(RefreshEvent.TASK_UPDATED, { taskId: updatedTask.id });

        let confirmedColumns;
        setTaskColumns(prev => { confirmedColumns = prev; return prev; });
        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, selectedProject?.id);
        }
        scheduleLockClear(result, guard);
      } else {
        throw memberTaskError(result.error?.userMessage || 'Failed to update task');
      }
    } catch (error) {
      if (!guard.isCurrent()) {
        if (typeof notifId !== 'undefined' && notifId) updateNotification(notifId, 'Your account or organization changed. Reopen the task to see its current state.', 'error');
        return { success: false };
      }
      updateNotification(notifId, error.userMessage || 'Error updating task', 'error');
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
    }
  }, [beginTaskAction, getTaskMetadata,
    taskService,
    taskManagerContractAddress,
    payoutConfig,
    isReady,
    addNotification,
    updateNotification,
    emit,
    onUpdateColumns,
    scheduleLockClear,
    setTaskColumns,
    selectedProject?.id,
  ]);

  /**
   * Edit only a task's metadata (title + description + difficulty + estHours) via the
   * TaskManager v5 `updateTaskMetadata(uint256,bytes,bytes32)` selector. Used when the
   * caller has TaskPerm.EDIT_META but not EDIT_FULL — payout and bounty are preserved
   * on-chain regardless of what the modal sends.
   */
  const editTaskMetadata = useCallback(async (updatedTask, destColumnId, destTaskIndex, projectName) => {
    if (!isReady || !taskService) {
      addNotification(getNotReadyMessageRef.current(), 'error');
      return;
    }

    const guard = beginTaskAction('editMetadata', updatedTask);
    if (!guard) return { success: false };

    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumnsRef.current));
    optimisticLockRef.current = Date.now();

    // Optimistic update — only metadata changes locally; payout/bounty are not part of this path.
    const newTaskColumns = taskColumnsRef.current.map(col => {
      if (col.id !== destColumnId) return col;
      return {
        ...col,
        tasks: col.tasks.map((t, i) => i === destTaskIndex ? { ...t, ...updatedTask } : t),
      };
    });
    setTaskColumns(newTaskColumns);

    const notifId = addNotification('Updating task metadata...', 'loading');

    try {
      if (!taskService.ipfs) throw memberTaskError('Task details are still loading. Please try again.');
      const baseMetadata = await getTaskMetadata(guard.task, guard);
      guard();
      const result = await taskService.editTaskMetadata(taskManagerContractAddress, updatedTask.id, {
        baseMetadata,
        name: updatedTask.name,
        description: updatedTask.description,
        location: baseMetadata.location,
        difficulty: updatedTask.difficulty,
        estHours: updatedTask.estHours,
        dueDate: updatedTask.dueDate,
      }, { assertCurrent: guard });

      guard.assertScope();
      if (result.success) {
        updateNotification(notifId, 'Task metadata updated successfully!', 'success');
        emit(RefreshEvent.TASK_UPDATED, { taskId: updatedTask.id });

        let confirmedColumns;
        setTaskColumns(prev => { confirmedColumns = prev; return prev; });
        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, selectedProject?.id);
        }
        scheduleLockClear(result, guard);
      } else {
        throw memberTaskError(result.error?.userMessage || 'Failed to update task metadata');
      }
    } catch (error) {
      if (!guard.isCurrent()) {
        if (typeof notifId !== 'undefined' && notifId) updateNotification(notifId, 'Your account or organization changed. Reopen the task to see its current state.', 'error');
        return { success: false };
      }
      updateNotification(notifId, error.userMessage || 'Error updating task metadata', 'error');
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
    }
  }, [beginTaskAction, getTaskMetadata,
    taskService,
    taskManagerContractAddress,
    isReady,
    addNotification,
    updateNotification,
    emit,
    onUpdateColumns,
    scheduleLockClear,
    setTaskColumns,
    selectedProject?.id,
  ]);

  /**
   * Delete a task
   */
  const deleteTask = useCallback(async (taskId, columnId) => {
    if (!isReady || !taskService) {
      addNotification(getNotReadyMessageRef.current(), 'error');
      return;
    }

    const guard = beginTaskAction('cancel', { id: taskId });
    if (!guard) return { success: false };

    // Save previous state
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumnsRef.current));

    // Lock to prevent poll-interval from overwriting this optimistic update
    optimisticLockRef.current = Date.now();

    // Optimistically update the UI — immutable
    const newTaskColumns = taskColumnsRef.current.map(col => {
      if (col.id !== columnId) return col;
      return { ...col, tasks: col.tasks.filter(t => t.id !== taskId) };
    });

    setTaskColumns(newTaskColumns);

    const notifId = addNotification('Deleting task...', 'loading');

    try {
      const result = await taskService.cancelTask(taskManagerContractAddress, taskId, { assertCurrent: guard });

      guard.assertScope();
      if (result.success) {
        updateNotification(notifId, 'Task deleted successfully!', 'success');
        emit(RefreshEvent.TASK_CANCELLED, { taskId });

        let confirmedColumns;
        setTaskColumns(prev => { confirmedColumns = prev; return prev; });
        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, selectedProject?.id);
        }
        scheduleLockClear(result, guard);
      } else {
        throw memberTaskError(result.error?.userMessage || 'Failed to delete task');
      }
    } catch (error) {
      if (!guard.isCurrent()) {
        if (typeof notifId !== 'undefined' && notifId) updateNotification(notifId, 'Your account or organization changed. Reopen the task to see its current state.', 'error');
        return { success: false };
      }
      updateNotification(notifId, error.userMessage || 'Error deleting task', 'error');
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
    }
  }, [beginTaskAction,
    taskService,
    taskManagerContractAddress,
    isReady,
    addNotification,
    updateNotification,
    emit,
    onUpdateColumns,
    scheduleLockClear,
    setTaskColumns,
    selectedProject?.id,
  ]);

  /**
   * Apply for a task that requires application
   */
  const applyForTask = useCallback(async (taskId, applicationData, applicantAddress) => {
    if (!isReady || !taskService) {
      addNotification(getNotReadyMessageRef.current(), 'error');
      return { success: false };
    }

    const guard = beginTaskAction('apply', { id: taskId });
    if (!guard) return { success: false };

    // Save previous state for rollback
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumnsRef.current));

    // Optimistically add applicant to the task so UI reflects immediately
    let newTaskColumns;
    if (applicantAddress) {
      newTaskColumns = taskColumnsRef.current.map(col => ({
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
        applicationData,
        { assertCurrent: guard }
      );

      guard.assertScope();
      if (result.success) {
        updateNotification(notifId, 'Application submitted successfully!', 'success');
        emit(RefreshEvent.TASK_APPLICATION_SUBMITTED, { taskId });
        if (applicantAddress) {
          if (onUpdateColumns) onUpdateColumns(newTaskColumns, selectedProject?.id);
          scheduleLockClear(result, guard);
        }
        return { success: true };
      } else {
        throw memberTaskError(result.error?.userMessage || 'Failed to submit application');
      }
    } catch (error) {
      if (!guard.isCurrent()) {
        if (typeof notifId !== 'undefined' && notifId) updateNotification(notifId, 'Your account or organization changed. Reopen the task to see its current state.', 'error');
        return { success: false };
      }
      updateNotification(notifId, error.userMessage || 'Error submitting application', 'error');
      if (applicantAddress) {
        optimisticLockRef.current = null;
        setTaskColumns(previousTaskColumns);
      }
      return { success: false, error };
    }
  }, [beginTaskAction, taskService, taskManagerContractAddress, selectedProject, isReady, addNotification, updateNotification, emit, onUpdateColumns, setTaskColumns, scheduleLockClear]);

  /**
   * Approve an application for a task
   */
  const approveApplication = useCallback(async (taskId, applicantAddress, applicantUsername) => {
    if (!isReady || !taskService) {
      addNotification(getNotReadyMessageRef.current(), 'error');
      return { success: false };
    }

    const guard = beginTaskAction('assign', { id: taskId });
    if (!guard) return { success: false };

    // Save previous state for rollback
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumnsRef.current));

    // Lock to prevent poll-interval from overwriting this optimistic update
    optimisticLockRef.current = Date.now();

    // Optimistically move task from open to inProgress — immutable
    let movedTask = null;
    const newTaskColumns = taskColumnsRef.current.map(col => {
      if (col.id === 'open') {
        const task = col.tasks.find(t => t.id === taskId, { assertCurrent: guard });
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
        applicantAddress,
        { assertCurrent: guard }
      );

      guard.assertScope();
      if (result.success) {
        updateNotification(notifId, 'Application approved successfully!', 'success');
        emit(RefreshEvent.TASK_APPLICATION_APPROVED, { taskId, applicantAddress });

        let confirmedColumns;
        setTaskColumns(prev => { confirmedColumns = prev; return prev; });
        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, selectedProject?.id);
        }
        scheduleLockClear(result, guard);

        return { success: true };
      } else {
        throw memberTaskError(result.error?.userMessage || 'Failed to approve application');
      }
    } catch (error) {
      if (!guard.isCurrent()) {
        if (typeof notifId !== 'undefined' && notifId) updateNotification(notifId, 'Your account or organization changed. Reopen the task to see its current state.', 'error');
        return { success: false };
      }
      updateNotification(notifId, error.userMessage || 'Error approving application', 'error');
      // Rollback optimistic update on failure
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
      return { success: false, error };
    }
  }, [beginTaskAction, taskService, taskManagerContractAddress, isReady, addNotification, updateNotification, emit, onUpdateColumns, setTaskColumns, scheduleLockClear, selectedProject?.id]);

  /**
   * Assign a task to a specific user
   */
  const assignTask = useCallback(async (taskId, assigneeAddress, assigneeUsername) => {
    if (!isReady || !taskService) {
      addNotification(getNotReadyMessageRef.current(), 'error');
      return { success: false };
    }

    const guard = beginTaskAction('assign', { id: taskId });
    if (!guard) return { success: false };

    // Save previous state for rollback
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumnsRef.current));

    // Lock to prevent poll-interval from overwriting this optimistic update
    optimisticLockRef.current = Date.now();

    // Optimistically move task from open to inProgress — immutable. A v6 takeover
    // reassignment finds the task already IN inProgress: replace the assignee in
    // place (never splice, so the card can't duplicate) and restart the local window.
    const nowSec = Math.floor(Date.now() / 1000);
    let movedTask = null;
    const newTaskColumns = taskColumnsRef.current.map(col => {
      if (col.id === 'open') {
        const task = col.tasks.find(t => t.id === taskId, { assertCurrent: guard });
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
      if (col.id === 'inProgress') {
        const existing = col.tasks.some(t => t.id === taskId, { assertCurrent: guard });
        if (existing) {
          return {
            ...col,
            tasks: col.tasks.map(t => t.id !== taskId ? t : ({
              ...t,
              claimedBy: assigneeAddress,
              claimerUsername: assigneeUsername || '',
              assignedAt: String(nowSec),
              claimDeadline: Number(t.completionWindow) > 0
                ? String(nowSec + Number(t.completionWindow))
                : null,
            })),
          };
        }
        if (movedTask) {
          return { ...col, tasks: [...col.tasks, movedTask] };
        }
      }
      return col;
    });

    setTaskColumns(newTaskColumns);

    const notifId = addNotification('Assigning task...', 'loading');

    try {
      const result = await taskService.assignTask(
        taskManagerContractAddress,
        taskId,
        assigneeAddress,
        { assertCurrent: guard }
      );

      guard.assertScope();
      if (result.success) {
        updateNotification(notifId, 'Task assigned successfully!', 'success');
        emit(RefreshEvent.TASK_ASSIGNED, { taskId, assigneeAddress });

        let confirmedColumns;
        setTaskColumns(prev => { confirmedColumns = prev; return prev; });
        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, selectedProject?.id);
        }
        scheduleLockClear(result, guard);

        return { success: true };
      } else {
        throw memberTaskError(result.error?.userMessage || 'Failed to assign task');
      }
    } catch (error) {
      if (!guard.isCurrent()) {
        if (typeof notifId !== 'undefined' && notifId) updateNotification(notifId, 'Your account or organization changed. Reopen the task to see its current state.', 'error');
        return { success: false };
      }
      updateNotification(notifId, error.userMessage || 'Error assigning task', 'error');
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
      return { success: false, error };
    }
  }, [beginTaskAction, taskService, taskManagerContractAddress, isReady, addNotification, updateNotification, emit, onUpdateColumns, setTaskColumns, scheduleLockClear, selectedProject?.id]);


  /**
   * Take over an expired claim (TaskManager v6). The contract handles the takeover
   * inside claimTask itself — same call as a normal claim. Optimistically the
   * assignee is REPLACED in place in the inProgress column (never spliced, so the
   * card cannot duplicate) and the local claim window restarts; the subgraph
   * refetch then flips the assignee server-side, which removes the task from the
   * previous claimer's "in progress" everywhere.
   */
  const takeOverTask = useCallback(async (task, newAssigneeAddress, newAssigneeUsername) => {
    if (!isReady || !taskService) {
      addNotification(getNotReadyMessageRef.current(), 'error');
      return { success: false };
    }

    const guard = beginTaskAction('claim', task);
    if (!guard) return { success: false };

    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumnsRef.current));
    optimisticLockRef.current = Date.now();

    const nowSec = Math.floor(Date.now() / 1000);
    setTaskColumns(cols => cols.map(col => col.id !== 'inProgress' ? col : ({
      ...col,
      tasks: col.tasks.map(t => t.id !== task.id ? t : ({
        ...t,
        claimedBy: newAssigneeAddress,
        claimerUsername: newAssigneeUsername || '',
        assignedAt: String(nowSec), // restart the countdown locally
        claimDeadline: Number(t.completionWindow) > 0
          ? String(nowSec + Number(t.completionWindow))
          : null,
      })),
    })));

    const notifId = addNotification('Taking over task...', 'loading');

    try {
      const result = await taskService.claimTask(taskManagerContractAddress, task.id, { assertCurrent: guard });
      guard.assertScope();
      if (result.success) {
        updateNotification(notifId, "Task taken over — it's yours now!", 'success');
        emit(RefreshEvent.TASK_CLAIMED, { taskId: task.id });

        let confirmedColumns;
        setTaskColumns(prev => { confirmedColumns = prev; return prev; });
        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, selectedProject?.id);
        }
        scheduleLockClear(result, guard);
        return { success: true };
      }
      throw memberTaskError(result.error?.userMessage || 'Failed to take over task');
    } catch (error) {
      if (!guard.isCurrent()) {
        if (typeof notifId !== 'undefined' && notifId) updateNotification(notifId, 'Your account or organization changed. Reopen the task to see its current state.', 'error');
        return { success: false };
      }
      updateNotification(notifId, error.userMessage || 'Error taking over task', 'error');
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
      return { success: false, error };
    }
  }, [beginTaskAction, taskService, taskManagerContractAddress, isReady, addNotification, updateNotification, emit, onUpdateColumns, setTaskColumns, scheduleLockClear, selectedProject?.id]);

  /**
   * Release a claimed task back to the pool (TaskManager v7 `unclaimTask`).
   *
   * Unlike takeOverTask there is no replacement claimer, so the card MOVES
   * inProgress -> open and every claim-derived field has to be cleared with it:
   * a card left holding `claimDeadline` renders a countdown chip (and, once
   * past, an "expired" banner) while sitting in the Open column. `status` is
   * set to 'Open' too — mergeColumnsPreservingMetadata and the STATUS_TO_COLUMN
   * consumers would otherwise see a stale 'Assigned' and bounce it back.
   *
   * The expired-claim "ghost" that the boards mirror into Open for takeover is
   * derived from the inProgress column (TaskBoardDesktop/Mobile filter it by
   * isClaimExpired), so removing the task from inProgress is what retires the
   * ghost — not the field clearing. Both still have to happen: splice the task
   * out of inProgress AND clear the fields, or Open shows the ghost and the
   * released card side by side under the same task id.
   *
   * Permission is checked by the caller's scoped core task policy: the claimer may
   * always release, anyone else needs ASSIGN plus an expired claim.
   */
  const releaseTask = useCallback(async (task) => {
    if (!isReady || !taskService) {
      addNotification(getNotReadyMessageRef.current(), 'error');
      return { success: false };
    }

    const guard = beginTaskAction('release', task);
    if (!guard) return { success: false };

    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumnsRef.current));
    optimisticLockRef.current = Date.now();

    setTaskColumns(cols => {
      const released = cols
        .find(c => c.id === 'inProgress')?.tasks
        ?.find(t => t.id === task.id, { assertCurrent: guard });
      if (!released) return cols;
      const reopened = {
        ...released,
        status: 'Open',
        claimedBy: null,
        claimerUsername: '',
        assignedAt: null,
        claimDeadline: null,
      };
      return cols.map(col => {
        if (col.id === 'inProgress') {
          return { ...col, tasks: col.tasks.filter(t => t.id !== task.id) };
        }
        if (col.id === 'open') {
          // Filter first: the same id must never end up twice in one column.
          return { ...col, tasks: [reopened, ...col.tasks.filter(t => t.id !== task.id)] };
        }
        return col;
      });
    });

    const notifId = addNotification('Releasing task...', 'loading');

    try {
      const result = await taskService.unclaimTask(taskManagerContractAddress, task.id, { assertCurrent: guard });
      guard.assertScope();
      if (result.success) {
        updateNotification(notifId, 'Task released — it is open for anyone to claim.', 'success');
        emit(RefreshEvent.TASK_UNCLAIMED, { taskId: task.id });

        let confirmedColumns;
        setTaskColumns(prev => { confirmedColumns = prev; return prev; });
        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, selectedProject?.id);
        }
        scheduleLockClear(result, guard);
        return { success: true };
      }
      throw memberTaskError(result.error?.userMessage || 'Failed to release task');
    } catch (error) {
      if (!guard.isCurrent()) {
        if (typeof notifId !== 'undefined' && notifId) updateNotification(notifId, 'Your account or organization changed. Reopen the task to see its current state.', 'error');
        return { success: false };
      }
      updateNotification(notifId, error.userMessage || 'Error releasing task', 'error');
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
      return { success: false, error };
    }
  }, [beginTaskAction, taskService, taskManagerContractAddress, isReady, addNotification, updateNotification, emit, onUpdateColumns, setTaskColumns, scheduleLockClear, selectedProject?.id]);

  /**
   * Reject a submitted task, moving it back to inProgress
   */
  const rejectTask = useCallback(async (task, rejectionReason) => {
    if (!isReady || !taskService) {
      addNotification(getNotReadyMessageRef.current(), 'error');
      return { success: false };
    }

    if (!rejectionReason || rejectionReason.trim() === '') {
      addNotification('Please provide a rejection reason.', 'error');
      return { success: false };
    }

    const guard = beginTaskAction('reject', task);
    if (!guard) return { success: false };

    // Save previous state for rollback
    const previousTaskColumns = JSON.parse(JSON.stringify(taskColumnsRef.current));

    // Lock to prevent poll-interval from overwriting this optimistic update
    optimisticLockRef.current = Date.now();

    // Optimistically move task from inReview to inProgress — immutable
    const newTaskColumns = taskColumnsRef.current.map(col => {
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
      // Upload rejection reason to IPFS. The subgraph links TaskRejected to the
      // immutable TaskSubmission record; rejection metadata does not duplicate
      // the submitted work.
      guard();
      const rejectionMetadata = serializeTaskRejectionMetadata(buildTaskRejectionMetadata(rejectionReason.trim()));
      const ipfsResult = await addToIpfs(rejectionMetadata);
      guard();

      const result = await taskService.rejectTask(
        taskManagerContractAddress,
        task.id,
        ipfsResult.path,
        { assertCurrent: guard }
      );

      guard.assertScope();
      if (result.success) {
        updateNotification(notifId, 'Task rejected successfully!', 'success');
        emit(RefreshEvent.TASK_REJECTED, { taskId: task.id });

        let confirmedColumns;
        setTaskColumns(prev => { confirmedColumns = prev; return prev; });
        if (onUpdateColumns && confirmedColumns) {
          onUpdateColumns(confirmedColumns, selectedProject?.id);
        }
        scheduleLockClear(result, guard);

        return { success: true };
      } else {
        throw memberTaskError(result.error?.userMessage || 'Failed to reject task');
      }
    } catch (error) {
      if (!guard.isCurrent()) {
        if (typeof notifId !== 'undefined' && notifId) updateNotification(notifId, 'Your account or organization changed. Reopen the task to see its current state.', 'error');
        return { success: false };
      }
      updateNotification(notifId, error.userMessage || 'Error rejecting task', 'error');
      optimisticLockRef.current = null;
      setTaskColumns(previousTaskColumns);
      return { success: false, error };
    }
  }, [beginTaskAction,
    taskService,
    taskManagerContractAddress,
    isReady,
    addNotification,
    updateNotification,
    emit,
    addToIpfs,
    onUpdateColumns,
    scheduleLockClear,
    setTaskColumns,
    selectedProject?.id,
  ]);

  /**
   * Load the submission associated with the latest rejection.
   *
   * Load the immutable submission linked to the latest rejection by the
   * subgraph. If its file data source is still indexing, resolve the indexed
   * submissionHash directly from IPFS as a short-lived fallback.
   */
  const getPreviousSubmission = useCallback(async (task) => {
    if (!task?.id || !subgraphUrl || !subgraphClient) return null;
    return fetchLatestRejectedSubmission({
      client: subgraphClient,
      taskId: task.id,
      fetchFromIpfs: safeFetchFromIpfs,
    });
  }, [safeFetchFromIpfs, subgraphClient, subgraphUrl]);

  const value = useMemo(() => ({
    taskColumns,
    getTaskMetadata,
    moveTask,
    addTask,
    addTaskBatch,
    editTask,
    editTaskMetadata,
    deleteTask,
    applyForTask,
    approveApplication,
    assignTask,
    takeOverTask,
    releaseTask,
    rejectTask,
    getPreviousSubmission,
  }), [taskColumns, getTaskMetadata, moveTask, addTask, addTaskBatch, editTask, editTaskMetadata, deleteTask, applyForTask, approveApplication, assignTask, takeOverTask, releaseTask, rejectTask, getPreviousSubmission]);

  return React.createElement(TaskBoardContext.Provider, { value }, children);
};
