import { useMemo } from 'react';
import { useAuth } from '@/context/authState';
import { useUserContext } from '@/context/UserContext';
import { useProjectContext } from '@/context/ProjectContext';
import { isTaskMine } from '@/util/taskIndicators';

/**
 * Shared per-task indicator hook so the card, the list row, the filter chips,
 * and the My Work sections all answer "is this mine" / "does this need my
 * review" identically. Review permission is resolved from the task's project in
 * ProjectContext exactly as the contract gates `completeTask` (the REVIEW bit
 * from the project + global masks, or being a manager of that project).
 *
 * `columnId` overrides task.columnId — the Board passes the column as a prop and
 * the raw task object may not carry it.
 *
 * @returns {{ isMine: boolean, needsMyReview: boolean }}
 */
export function useTaskIndicators(task, columnId) {
  const { accountAddress } = useAuth() || {};
  const {
    address: ctxAddress,
    graphUsername,
  } = useUserContext() || {};
  const { projectsData, getTaskActions } = useProjectContext() || {};

  const address = accountAddress || ctxAddress || '';
  const col = columnId || task?.columnId;
  const projectId = task?.projectId;

  const project = useMemo(
    () => (projectsData || []).find((p) => p.id === projectId),
    [projectsData, projectId],
  );

  const isMine = useMemo(
    () => isTaskMine(task, address, graphUsername),
    [task, address, graphUsername],
  );

  const needsMyReview = useMemo(
    () => col === 'inReview' && getTaskActions(task, project).complete.state === 'allowed',
    [col, project, getTaskActions, task],
  );

  return { isMine, needsMyReview };
}

export default useTaskIndicators;
