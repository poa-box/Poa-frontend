/**
 * Folder JSON schema (TaskManager v4)
 *
 * Authoritative spec lives at:
 *   https://github.com/poa-box/POP/blob/main/docs/TASK_MANAGER_FOLDERS.md
 *
 * On-disk shape: `{ schemaVersion: 1, folders: FolderRecord[] }`.
 * Trees are reconstructed client-side via `parentId` pointers.
 */

export const FOLDERS_SCHEMA_VERSION = 1;

export function makeEmptyFolderDoc() {
  return { schemaVersion: FOLDERS_SCHEMA_VERSION, folders: [] };
}

/**
 * Validate a folder doc against the v1 schema. Returns `{ valid, errors }`.
 * Rejects forward-incompatible newer versions per spec.
 */
export function validateFolderDoc(doc) {
  const errors = [];
  if (!doc || typeof doc !== 'object') {
    errors.push('Document is not an object.');
    return { valid: false, errors };
  }
  if (typeof doc.schemaVersion !== 'number') {
    errors.push('Missing schemaVersion.');
  } else if (doc.schemaVersion > FOLDERS_SCHEMA_VERSION) {
    errors.push(
      `Schema version ${doc.schemaVersion} is newer than this client (${FOLDERS_SCHEMA_VERSION}). Refusing to render.`
    );
  }
  if (!Array.isArray(doc.folders)) {
    errors.push('`folders` must be an array.');
    return { valid: false, errors };
  }

  const ids = new Set();
  const projectAssignments = new Map(); // projectId → folderId
  for (const f of doc.folders) {
    if (!f || typeof f !== 'object') {
      errors.push('Folder record is not an object.');
      continue;
    }
    if (typeof f.id !== 'string' || !f.id) {
      errors.push('Folder is missing a string id.');
      continue;
    }
    if (ids.has(f.id)) {
      errors.push(`Duplicate folder id: ${f.id}`);
    }
    ids.add(f.id);
    if (typeof f.name !== 'string') errors.push(`Folder ${f.id} name is not a string.`);
    if (f.parentId !== null && typeof f.parentId !== 'string') {
      errors.push(`Folder ${f.id} parentId must be a string or null.`);
    }
    if (typeof f.sortOrder !== 'number') {
      errors.push(`Folder ${f.id} sortOrder must be a number.`);
    }
    if (!Array.isArray(f.projectIds)) {
      errors.push(`Folder ${f.id} projectIds must be an array.`);
      continue;
    }
    for (const pid of f.projectIds) {
      if (projectAssignments.has(pid)) {
        errors.push(
          `Project ${pid} is assigned to multiple folders: ${projectAssignments.get(pid)} and ${f.id}`
        );
      } else {
        projectAssignments.set(pid, f.id);
      }
    }
  }

  // parentId references + cycle detection
  for (const f of doc.folders) {
    if (f.parentId === null) continue;
    if (!ids.has(f.parentId)) {
      errors.push(`Folder ${f.id} references unknown parent ${f.parentId}.`);
    }
  }
  if (hasCycle(doc.folders)) {
    errors.push('Folder tree contains a cycle.');
  }

  return { valid: errors.length === 0, errors };
}

function hasCycle(folders) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(folders.map((f) => [f.id, WHITE]));
  function visit(id) {
    const c = color.get(id);
    if (c === GRAY) return true;
    if (c === BLACK) return false;
    color.set(id, GRAY);
    const f = byId.get(id);
    if (f && f.parentId && byId.has(f.parentId)) {
      if (visit(f.parentId)) return true;
    }
    color.set(id, BLACK);
    return false;
  }
  for (const f of folders) {
    if (visit(f.id)) return true;
  }
  return false;
}
