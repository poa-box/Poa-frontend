import { requireRawUint } from '@poa-box/core/amounts';
import { requireCompleteSnapshot } from '@poa-box/core/data/facts';
import { taskHostScopeKey } from '@/lib/tasks/hostScope';

/** A successful write is not indexed proof until its exact receipt block is known. */
export function taskReceiptBlock(result) {
  if (result?.success !== true || result.receipt?.blockNumber == null) return null;
  try { return requireRawUint(result.receipt.blockNumber); } catch { return null; }
}

/** Presentation reconciliation consumes the existing, complete project observation. */
export function indexedTaskProject(project, scope, minimumBlock = '0') {
  if (!scope.hydrated || !scope.account || project?.id?.toLowerCase() !== scope.projectId?.toLowerCase()) return null;
  try {
    requireCompleteSnapshot({ source: project.taskSource, coverage: project.taskCoverage, data: project }, {
      scope: { chainId: scope.chainId, orgId: scope.orgId, contract: scope.contract, endpoint: scope.endpoint },
      indexed: true, snapshot: 'pinned',
    });
    const block = requireRawUint(project.taskSource.block.number);
    return BigInt(block) >= BigInt(minimumBlock) ? project : null;
  } catch { return null; }
}

function replaceRows(columns, rows, removeIds = new Set()) {
  const replacements = new Map(rows.map(({ task, columnId }) => [task.id, { task, columnId }]));
  return columns.map(column => {
    const tasks = column.tasks.flatMap(task => {
      if (removeIds.has(task.id)) return [];
      const row = replacements.get(task.id);
      return row ? (row.columnId === column.id ? [row.task] : []) : [task];
    });
    const present = new Set(tasks.map(task => task.id));
    for (const row of rows) if (row.columnId === column.id && !present.has(row.task.id)) tasks.push(row.task);
    if (tasks.length === column.tasks.length && tasks.every((task, index) => task === column.tasks[index])) return column;
    return { ...column, tasks };
  });
}

/** Only settle confirmed writes, or an already proven ID whose indexed details arrived.
 * An in-flight write on the same row always wins over an older indexed snapshot.
 * Authorization continues to use ProjectContext and assertCurrentTask, never this view.
 */
export function reconcileTaskHostColumns(columns, project, scope, writes, creations = new Map()) {
  if (!indexedTaskProject(project, scope)) return columns;
  const key = taskHostScopeKey(scope), block = project.taskSource.block.number;
  for (const [operation, creation] of creations) {
    if (creation.scopeKey !== key || creation.block == null || BigInt(block) < BigInt(creation.block)) continue;
    columns = reconcileIndexedCreation(columns, project.columns, creation.pendingIds, project.taskSource, scope, writes);
    creations.delete(operation);
  }
  const visible = new Map(columns.flatMap(column => column.tasks).map(task => [task.id, task]));
  const rows = [];
  for (const column of project.columns) for (const task of column.tasks) {
    const current = visible.get(task.id), write = writes.get(task.id);
    if (!current || task.isIndexing) continue;
    if (write) {
      if (write.scopeKey !== key || write.block == null || BigInt(block) < BigInt(write.block)) continue;
      // Keep this floor until the grace period ends, so a delayed older snapshot cannot regress the row.
      write.block = block;
    } else if (!current.isIndexing && current.metadataHash != null) continue;
    if (current !== task) rows.push({ task, columnId: column.id });
  }
  return rows.length ? replaceRows(columns, rows) : columns;
}

/** The continuation certifies actual project IDs; it never pairs a draft with a row.
 * Keep unrelated local writes (including other temporary creations) while retiring
 * only this successful creation's temporary cards.
 */
export function reconcileIndexedCreation(columns, indexedColumns, pendingIds, source, scope, writes) {
  const key = taskHostScopeKey(scope), rows = [];
  for (const column of indexedColumns) for (const task of column.tasks) {
    const write = writes.get(task.id);
    if (write && (write.scopeKey !== key || write.block == null || BigInt(source.block.number) < BigInt(write.block))) continue;
    rows.push({ task, columnId: column.id });
  }
  const indexedIds = new Set(indexedColumns.flatMap(column => column.tasks).map(task => task.id));
  const removeIds = new Set(pendingIds);
  for (const column of columns) for (const task of column.tasks) {
    const write = writes.get(task.id);
    const protectedWrite = write && write.scopeKey === key &&
      (write.block == null || BigInt(source.block.number) < BigInt(write.block));
    if (!indexedIds.has(task.id) && !protectedWrite && !task.id.startsWith('pending-task-')) removeIds.add(task.id);
  }
  return replaceRows(columns, rows, removeIds);
}
