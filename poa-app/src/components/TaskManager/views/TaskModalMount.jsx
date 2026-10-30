import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useTaskBoard } from '@/context/TaskBoardContext';
import { useDataBaseContext } from '@/context/dataBaseContext';
import { selectTaskModal } from '@/components/TaskManager/views/taskModalSelection';

const TaskCardModal = dynamic(() => import('@/components/TaskManager/TaskCardModal'), { ssr: false });

// One modal for every project view, including mobile columns and filtered
// boards. Removing the task query (including browser Back) unmounts it.
const TaskModalMount = () => {
  const router = useRouter();
  const { taskColumns, editTask, editTaskMetadata } = useTaskBoard();
  const { selectedProject } = useDataBaseContext();
  const taskParam = router.query.task;
  const requestedProjectId = router.query.projectId;
  const selectedProjectId = selectedProject?.id;

  const match = useMemo(() => selectTaskModal({
    taskColumns,
    taskId: taskParam,
    selectedProjectId,
    requestedProjectId,
  }), [taskParam, taskColumns, selectedProjectId, requestedProjectId]);

  if (!match) return null;

  const handleEditTask = async (updatedTask) => {
    const enriched = {
      ...updatedTask,
      difficulty: updatedTask.difficulty,
      estHours: updatedTask.estHours,
    };
    return editTask(enriched, match.columnId, match.index);
  };

  const handleEditTaskMetadata = async (updatedTask) => {
    return editTaskMetadata(
      { ...updatedTask, difficulty: updatedTask.difficulty, estHours: updatedTask.estHours },
      match.columnId,
      match.index,
    );
  };

  return (
    <TaskCardModal
      key={match.task.id}
      task={match.task}
      columnId={match.columnId}
      onEditTask={handleEditTask}
      onEditTaskMetadata={handleEditTaskMetadata}
    />
  );
};

export default TaskModalMount;
