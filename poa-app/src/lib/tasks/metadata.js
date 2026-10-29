import { buildTaskMetadata, mergeTaskMetadataFinal } from '@poa-box/core/metadata/task';

/** Core owns canonical fields. The host carries compatible metadata extensions through edits. */
function withExtensions(base, canonical) {
  const extensions = { ...base };
  // Remove canonical keys so a cleared dueDate does not leak back from the base.
  for (const key of ['name', 'description', 'location', 'difficulty', 'estHours', 'submission', 'dueDate']) {
    delete extensions[key];
  }
  return { ...canonical, ...extensions };
}

export function createTaskMetadata(data) {
  return withExtensions(data.baseMetadata, buildTaskMetadata({
    name: data.name, description: data.description ?? '', location: data.location ?? '',
    difficulty: data.difficulty ?? 'medium', estHours: data.estHours ?? 0,
    submission: data.submission ?? '', dueDate: data.dueDate,
  }));
}

export function editTaskMetadata(data) {
  const base = data.baseMetadata;
  if (!base && data.submission === undefined) {
    throw new Error('The saved task details are required before editing. Reload the task and try again.');
  }
  const canonical = mergeTaskMetadataFinal(base ?? null, {
    name: data.name, description: data.description, location: data.location,
    difficulty: data.difficulty, estHours: data.estHours, submission: data.submission,
    dueDate: data.dueDate,
  });
  return withExtensions(base, canonical);
}
