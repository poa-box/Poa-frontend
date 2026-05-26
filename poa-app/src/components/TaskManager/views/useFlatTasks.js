import { useMemo } from 'react';
import { useTaskBoard } from '../../../context/TaskBoardContext';
import { useProjectContext } from '../../../context/ProjectContext';

// Flatten the kanban-shaped task columns into a single array, decorating each
// task with the column id/title it sits in. Cancelled tasks are filtered
// upstream so we don't need to guard them here. Pure data shape — views are
// free to sort/group/filter without re-flattening on every render.
export function useFlatTasks() {
  const ctx = useTaskBoard();
  const taskColumns = ctx?.taskColumns;
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

// Aggregated flat-tasks across every project for the "All Tasks" view.
// Reads directly from ProjectContext.projectsData (which already includes
// columns + tasks per project), bypassing TaskBoardProvider since that's
// per-project only.
export function useAllProjectsFlatTasks() {
  const { projectsData } = useProjectContext();
  return useMemo(() => {
    if (!Array.isArray(projectsData)) return [];
    const out = [];
    for (const p of projectsData) {
      if (!p || !Array.isArray(p.columns)) continue;
      for (const col of p.columns) {
        if (!col || !Array.isArray(col.tasks)) continue;
        for (const t of col.tasks) {
          if (!t) continue;
          out.push({
            ...t,
            columnId: col.id,
            columnTitle: col.title,
            // Make sure projectId is populated even on legacy task objects
            projectId: t.projectId || p.id,
            projectName: p.name || p.title || p.id,
          });
        }
      }
    }
    return out;
  }, [projectsData]);
}
