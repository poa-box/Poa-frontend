/**
 * Tree-shape helpers for the flat folder doc.
 *
 * The on-disk schema is flat (each folder has a `parentId`) — the nested
 * tree is reconstructed in memory for rendering and rebuilt on save.
 *
 * `sortOrder` uses sparse numbering (default step: 100) so most inserts
 * don't require renumbering siblings.
 */

export const SORT_STEP = 100;

/**
 * Build the nested tree (`{...folder, children: []}[]`) from the flat list.
 * Children are sorted by sortOrder asc, then id asc (spec tie-break).
 * Records whose parentId is unknown are dropped from the tree (spec calls
 * for client to reject; for render we silently skip and let validation
 * surface the issue separately).
 */
export function buildTree(folders) {
  const byId = new Map();
  for (const f of folders) {
    byId.set(f.id, { ...f, children: [] });
  }
  const roots = [];
  for (const node of byId.values()) {
    if (node.parentId == null) {
      roots.push(node);
    } else {
      const parent = byId.get(node.parentId);
      if (parent) parent.children.push(node);
      // else: orphan, dropped
    }
  }
  function sortRec(arr) {
    arr.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    for (const n of arr) sortRec(n.children);
  }
  sortRec(roots);
  return roots;
}

/**
 * Generate a stable folder id. Uses crypto.randomUUID when available, with
 * the "f-" prefix from the spec's conventional shape.
 */
export function generateFolderId() {
  const uuid =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
  return `f-${uuid}`;
}

/**
 * Compute a sortOrder that places a folder at a given 0-indexed position
 * among its target siblings (sparse — leaves room for future inserts).
 *
 * @param {Array<{sortOrder:number}>} siblings  Existing siblings sorted asc.
 * @param {number}                    index     Target slot (0..siblings.length).
 */
export function computeSortOrder(siblings, index) {
  if (siblings.length === 0) return 0;
  if (index <= 0) return siblings[0].sortOrder - SORT_STEP;
  if (index >= siblings.length) return siblings[siblings.length - 1].sortOrder + SORT_STEP;
  const prev = siblings[index - 1].sortOrder;
  const next = siblings[index].sortOrder;
  // If the gap is too tight, renumber would be ideal — for MVP just
  // bias toward `next` and accept fractional collisions get tie-broken
  // by id ordering.
  const mid = (prev + next) / 2;
  return mid === prev || mid === next ? next : mid;
}

/**
 * Collect the set of unassigned project ids — projects that don't appear in
 * any folder's projectIds. Spec says these render as a virtual top-level bucket.
 */
export function unassignedProjectIds(folders, allProjectIds) {
  const assigned = new Set();
  for (const f of folders) {
    for (const pid of f.projectIds || []) assigned.add(pid);
  }
  return allProjectIds.filter((pid) => !assigned.has(pid));
}

/**
 * Move `projectId` to `targetFolderId` (or detach when targetFolderId === null).
 * Returns a NEW folders array — never mutates the input.
 */
export function moveProject(folders, projectId, targetFolderId) {
  return folders.map((f) => {
    const without = (f.projectIds || []).filter((p) => p !== projectId);
    if (f.id === targetFolderId) {
      return { ...f, projectIds: [...without, projectId] };
    }
    return { ...f, projectIds: without };
  });
}

/**
 * Reparent a folder. Returns a NEW folders array.
 * Caller is responsible for cycle prevention before calling — `validateFolderDoc`
 * will catch a bad reparent at save time, but UI should block it earlier.
 */
export function reparentFolder(folders, folderId, newParentId, newSortOrder) {
  return folders.map((f) => {
    if (f.id !== folderId) return f;
    return {
      ...f,
      parentId: newParentId,
      sortOrder: newSortOrder ?? f.sortOrder,
    };
  });
}

/**
 * Walk from `folderId` up the parent chain, returning the set of ancestor
 * ids (NOT including the folder itself). Used by the sidebar to auto-expand
 * the path to a selected project's enclosing folder.
 *
 * Bounded by `folders.length` so a malformed cycle won't loop forever
 * (validateFolderDoc catches cycles on save; this is defensive at read).
 */
export function ancestorsOf(folders, folderId) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out = new Set();
  let current = byId.get(folderId);
  let safety = folders.length;
  while (current && current.parentId != null && safety-- > 0) {
    if (out.has(current.parentId)) break; // cycle guard
    out.add(current.parentId);
    current = byId.get(current.parentId);
  }
  return out;
}

/**
 * Find the folder id (if any) that contains `projectId` in its `projectIds`
 * list. Returns null if the project is unassigned or unknown.
 */
export function folderContainingProject(folders, projectId) {
  if (!projectId) return null;
  for (const f of folders) {
    if ((f.projectIds || []).includes(projectId)) return f.id;
  }
  return null;
}

/**
 * Compute the descendants of `folderId` (including itself). Used to prevent
 * reparenting a folder under one of its own descendants.
 */
export function descendantsOf(folders, folderId) {
  const childrenOf = new Map();
  for (const f of folders) {
    const arr = childrenOf.get(f.parentId) || [];
    arr.push(f);
    childrenOf.set(f.parentId, arr);
  }
  const out = new Set();
  function walk(id) {
    out.add(id);
    for (const child of childrenOf.get(id) || []) walk(child.id);
  }
  walk(folderId);
  return out;
}
