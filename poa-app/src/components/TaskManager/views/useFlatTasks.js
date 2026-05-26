import { useMemo } from 'react';
import { useTaskBoard } from '../../../context/TaskBoardContext';

// Flatten the kanban-shaped task columns into a single array, decorating each
// task with the column id/title it sits in. Cancelled tasks are filtered
// upstream so we don't need to guard them here. Pure data shape — views are
// free to sort/group/filter without re-flattening on every render.
export function useFlatTasks() {
  const { taskColumns } = useTaskBoard();
  return useMemo(() => {
    if (!Array.isArray(taskColumns)) return [];
    const out = [];
    for (const col of taskColumns) {
      if (!col || !Array.isArray(col.tasks)) continue;
      for (const t of col.tasks) {
        if (!t) continue;
        out.push({ ...t, columnId: col.id, columnTitle: col.title });
      }
    }
    return out;
  }, [taskColumns]);
}
