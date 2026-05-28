import { useMemo } from 'react';
import { useToast } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useTaskBoard } from '@/context/TaskBoardContext';
import TaskCardModal from '../TaskCardModal';

// In Kanban, TaskCardModal is rendered as a sibling of each TaskCard and
// self-opens by matching `router.query.task` to its own task.id. List and
// Gantt don't render TaskCard, so we mount a single TaskCardModal that
// targets whichever task the URL currently points at.
const TaskModalMount = () => {
  const router = useRouter();
  const { taskColumns, editTask, editTaskMetadata } = useTaskBoard();
  const toast = useToast();
  const taskParam = router.query.task;

  const match = useMemo(() => {
    if (!taskParam || !Array.isArray(taskColumns)) return null;
    for (const col of taskColumns) {
      if (!col?.tasks) continue;
      const index = col.tasks.findIndex((t) => t && t.id === taskParam);
      if (index !== -1) {
        return { task: col.tasks[index], columnId: col.id, index };
      }
    }
    return null;
  }, [taskParam, taskColumns]);

  if (!match) return null;

  const handleEditTask = async (updatedTask) => {
    const enriched = {
      ...updatedTask,
      difficulty: updatedTask.difficulty,
      estHours: updatedTask.estHours,
    };
    await editTask(enriched, match.columnId, match.index);
    toast({
      title: 'Task edited.',
      description: 'Your task was successfully edited.',
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
  };

  const handleEditTaskMetadata = async (updatedTask) => {
    await editTaskMetadata(
      { ...updatedTask, difficulty: updatedTask.difficulty, estHours: updatedTask.estHours },
      match.columnId,
      match.index,
    );
    toast({
      title: 'Task metadata updated.',
      description: 'Title and description were updated; payout and bounty are unchanged.',
      status: 'success',
      duration: 3000,
      isClosable: true,
    });
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
