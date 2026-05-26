// Sentinel project id used by the "All Tasks" cross-project view. Lives in
// router.query.projectId and in DataBaseContext.selectedProject.id; chosen so
// it cannot collide with a real on-chain project id (those are 0x-prefixed
// numeric strings).
export const ALL_PROJECTS_ID = '__all__';

export function isAllTasksId(id) {
  return id === ALL_PROJECTS_ID;
}

// Canonical kanban column order. Used to merge same-status columns across
// projects when synthesizing All-Tasks columns; matches the order used
// elsewhere (see ListView.COLUMN_ORDER).
const COLUMN_ORDER = ['open', 'inProgress', 'inReview', 'completed'];

// Build a synthetic [{ id, title, tasks }] kanban shape that aggregates every
// project's tasks under their respective status columns. Each task is
// decorated with projectId/projectName so views can render a project chip.
//
// Returns columns in canonical order, including empty ones — keeps the board
// rendering stable when an org has zero in-review tasks org-wide, etc.
export function aggregateAllTasksColumns(projects) {
  const buckets = new Map();
  for (const id of COLUMN_ORDER) buckets.set(id, { id, title: '', tasks: [] });

  for (const project of projects || []) {
    if (!project || !Array.isArray(project.columns)) continue;
    for (const col of project.columns) {
      if (!col) continue;
      if (!buckets.has(col.id)) {
        buckets.set(col.id, { id: col.id, title: col.title || col.id, tasks: [] });
      } else if (!buckets.get(col.id).title && col.title) {
        buckets.get(col.id).title = col.title;
      }
      const dest = buckets.get(col.id);
      for (const task of col.tasks || []) {
        if (!task) continue;
        dest.tasks.push({
          ...task,
          projectId: task.projectId || project.id,
          projectName: task.projectName || project.name,
        });
      }
    }
  }

  return COLUMN_ORDER
    .map((id) => buckets.get(id))
    .filter(Boolean)
    .map((col) => ({ ...col, title: col.title || titleFromId(col.id) }));
}

function titleFromId(id) {
  switch (id) {
    case 'open': return 'Open';
    case 'inProgress': return 'In Progress';
    case 'inReview': return 'In Review';
    case 'completed': return 'Completed';
    default: return id;
  }
}

// Total task count across all projects — used in the sidebar subtitle.
export function countAllTasks(projects) {
  let n = 0;
  for (const p of projects || []) {
    for (const c of p?.columns || []) n += (c?.tasks?.length || 0);
  }
  return n;
}
