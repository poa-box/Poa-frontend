import { describe, it, expect } from 'vitest';
import {
  SORT_STEP,
  ancestorsOf,
  buildTree,
  computeSortOrder,
  descendantsOf,
  folderContainingProject,
  generateFolderId,
  moveProject,
  reparentFolder,
  unassignedProjectIds,
} from './tree';

const F = (id, parentId = null, sortOrder = 0, projectIds = []) => ({
  id,
  name: id.toUpperCase(),
  parentId,
  sortOrder,
  projectIds,
});

describe('generateFolderId', () => {
  it('produces values that begin with "f-"', () => {
    expect(generateFolderId().startsWith('f-')).toBe(true);
  });

  it('produces unique values across many calls', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(generateFolderId());
    expect(seen.size).toBe(200);
  });
});

describe('buildTree', () => {
  it('returns an empty array for empty input', () => {
    expect(buildTree([])).toEqual([]);
  });

  it('roots top-level folders and nests children', () => {
    const folders = [F('a'), F('b', 'a'), F('c', 'a'), F('d', 'b')];
    const tree = buildTree(folders);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('a');
    expect(tree[0].children.map((n) => n.id)).toEqual(['b', 'c']);
    expect(tree[0].children[0].children.map((n) => n.id)).toEqual(['d']);
  });

  it('sorts siblings by sortOrder ascending, then by id ascending for ties', () => {
    const folders = [
      F('a', null, 10),
      F('zzz', null, 5),
      F('b', null, 5),
    ];
    const tree = buildTree(folders);
    // sortOrder 5 ties: 'b' < 'zzz' lexicographically → b first.
    expect(tree.map((n) => n.id)).toEqual(['b', 'zzz', 'a']);
  });

  it('drops orphans whose parentId references a missing folder', () => {
    const folders = [F('a'), F('orphan', 'ghost')];
    const tree = buildTree(folders);
    expect(tree.map((n) => n.id)).toEqual(['a']);
  });

  it('does not mutate the input array', () => {
    const folders = [F('a'), F('b', 'a')];
    const before = JSON.stringify(folders);
    buildTree(folders);
    expect(JSON.stringify(folders)).toBe(before);
  });
});

describe('computeSortOrder', () => {
  it('returns 0 for an empty sibling list', () => {
    expect(computeSortOrder([], 0)).toBe(0);
  });

  it('returns min - SORT_STEP when inserting at the front', () => {
    const siblings = [{ sortOrder: 100 }, { sortOrder: 200 }];
    expect(computeSortOrder(siblings, 0)).toBe(100 - SORT_STEP);
  });

  it('returns max + SORT_STEP when appending to the end', () => {
    const siblings = [{ sortOrder: 100 }, { sortOrder: 200 }];
    expect(computeSortOrder(siblings, siblings.length)).toBe(200 + SORT_STEP);
  });

  it('returns the midpoint when inserting between two siblings', () => {
    const siblings = [{ sortOrder: 100 }, { sortOrder: 300 }];
    expect(computeSortOrder(siblings, 1)).toBe(200);
  });

  it('clamps a negative index to the front', () => {
    const siblings = [{ sortOrder: 100 }];
    expect(computeSortOrder(siblings, -5)).toBe(100 - SORT_STEP);
  });
});

describe('unassignedProjectIds', () => {
  it('returns ids that no folder claims', () => {
    const folders = [F('a', null, 0, ['p1']), F('b', null, 0, ['p2'])];
    expect(unassignedProjectIds(folders, ['p1', 'p2', 'p3', 'p4'])).toEqual(['p3', 'p4']);
  });

  it('returns the full list when no folders assign anything', () => {
    expect(unassignedProjectIds([], ['p1', 'p2'])).toEqual(['p1', 'p2']);
  });

  it('returns [] when every project is assigned', () => {
    const folders = [F('a', null, 0, ['p1', 'p2'])];
    expect(unassignedProjectIds(folders, ['p1', 'p2'])).toEqual([]);
  });
});

describe('moveProject', () => {
  it('moves a project from one folder to another', () => {
    const folders = [F('a', null, 0, ['p1']), F('b', null, 0, [])];
    const next = moveProject(folders, 'p1', 'b');
    expect(next.find((f) => f.id === 'a').projectIds).toEqual([]);
    expect(next.find((f) => f.id === 'b').projectIds).toEqual(['p1']);
  });

  it('detaches a project when target is null', () => {
    const folders = [F('a', null, 0, ['p1'])];
    const next = moveProject(folders, 'p1', null);
    expect(next[0].projectIds).toEqual([]);
  });

  it('does not mutate the input', () => {
    const folders = [F('a', null, 0, ['p1']), F('b', null, 0, [])];
    const before = JSON.stringify(folders);
    moveProject(folders, 'p1', 'b');
    expect(JSON.stringify(folders)).toBe(before);
  });

  it('is idempotent when target equals current parent', () => {
    const folders = [F('a', null, 0, ['p1'])];
    const next = moveProject(folders, 'p1', 'a');
    expect(next[0].projectIds).toEqual(['p1']);
  });
});

describe('reparentFolder', () => {
  it('updates parentId without mutating input', () => {
    const folders = [F('a'), F('b', 'a', 100)];
    const next = reparentFolder(folders, 'b', null, 0);
    expect(next.find((f) => f.id === 'b').parentId).toBe(null);
    expect(folders.find((f) => f.id === 'b').parentId).toBe('a'); // original unchanged
  });

  it('preserves existing sortOrder when none provided', () => {
    const folders = [F('a', null, 42)];
    const next = reparentFolder(folders, 'a', null);
    expect(next[0].sortOrder).toBe(42);
  });
});

describe('descendantsOf', () => {
  it('returns the folder itself and all of its descendants', () => {
    const folders = [F('root'), F('a', 'root'), F('b', 'a'), F('c', 'root'), F('d', 'a')];
    expect(Array.from(descendantsOf(folders, 'root')).sort()).toEqual(['a', 'b', 'c', 'd', 'root']);
    expect(Array.from(descendantsOf(folders, 'a')).sort()).toEqual(['a', 'b', 'd']);
    expect(Array.from(descendantsOf(folders, 'c')).sort()).toEqual(['c']);
  });

  it('returns just the folder itself when it has no children', () => {
    const folders = [F('lonely')];
    expect(Array.from(descendantsOf(folders, 'lonely'))).toEqual(['lonely']);
  });
});

describe('ancestorsOf', () => {
  it('walks the parent chain up to the root, excluding the folder itself', () => {
    const folders = [F('root'), F('a', 'root'), F('b', 'a'), F('c', 'b')];
    expect(Array.from(ancestorsOf(folders, 'c')).sort()).toEqual(['a', 'b', 'root']);
    expect(Array.from(ancestorsOf(folders, 'b')).sort()).toEqual(['a', 'root']);
    expect(Array.from(ancestorsOf(folders, 'a'))).toEqual(['root']);
    expect(Array.from(ancestorsOf(folders, 'root'))).toEqual([]);
  });

  it('returns an empty set for an unknown folder', () => {
    const folders = [F('a')];
    expect(Array.from(ancestorsOf(folders, 'ghost'))).toEqual([]);
  });

  it('terminates on cycles instead of looping forever', () => {
    const folders = [F('a', 'b'), F('b', 'a')]; // mutually parented
    expect(() => ancestorsOf(folders, 'a')).not.toThrow();
    const result = Array.from(ancestorsOf(folders, 'a'));
    // Cycle guard short-circuits; exact set depends on traversal but length <= 2.
    expect(result.length).toBeLessThanOrEqual(2);
  });
});

describe('folderContainingProject', () => {
  it('returns the folder id that owns the project', () => {
    const folders = [F('a', null, 0, ['p1']), F('b', null, 0, ['p2', 'p3'])];
    expect(folderContainingProject(folders, 'p1')).toBe('a');
    expect(folderContainingProject(folders, 'p3')).toBe('b');
  });

  it('returns null when the project is unassigned', () => {
    const folders = [F('a', null, 0, ['p1'])];
    expect(folderContainingProject(folders, 'p2')).toBeNull();
  });

  it('returns null for missing input', () => {
    expect(folderContainingProject([F('a')], null)).toBeNull();
    expect(folderContainingProject([F('a')], undefined)).toBeNull();
  });
});
