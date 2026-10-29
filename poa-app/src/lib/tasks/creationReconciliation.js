/** Unconfirmed IDs have no protocol meaning and cannot enable task actions. */
let sequence = 0;
export function pendingTaskId() {
  sequence += 1;
  return `pending-task-${Date.now()}-${sequence}`;
}

export function reconcileCreatedTasks(columns, pendingIds, matched, taskManagerAddress) {
  const ids = matched?.state === 'known' && matched.value.length === pendingIds.length ? matched.value : null;
  const positions = new Map(pendingIds.map((id, index) => [id, index]));
  return columns.map(column => ({ ...column, tasks: column.tasks.map(task => {
    if (!positions.has(task.id)) return task;
    const id = ids?.[positions.get(task.id)];
    return id === undefined ? { ...task, isIndexing: true }
      : { ...task, id: `${taskManagerAddress.toLowerCase()}-${id}`, taskId: id, isIndexing: false };
  }) }));
}

/** Resume from a complete indexed board observed after the confirmed receipt.
 * This deliberately does not assign draft positions to indexed rows. The whole
 * current project replaces temporary cards, using only the indexer's actual IDs.
 */
export async function indexedCreationContinuation({ result, scope, refresh, assertCurrent }) {
  if (result?.success !== true || result.receipt?.blockNumber == null || !refresh || !scope.hydrated || !scope.account) return null;
  const [{ requireRawUint }, { assertPlanScope, requireCompleteSnapshot }, { transformBoardProjects }] = await Promise.all([
    import('@poa-box/core/amounts'), import('@poa-box/core/data/facts'), import('@/lib/tasks/boardPresentation'),
  ]);
  assertCurrent();
  const minimumBlock = requireRawUint(result.receipt.blockNumber);
  const snapshot = await refresh({ minimumBlock });
  assertCurrent();
  if (!snapshot) return null;
  try {
    assertPlanScope(snapshot.source, { chainId: scope.chainId, orgId: scope.orgId,
      contract: scope.contract, endpoint: scope.endpoint });
    requireCompleteSnapshot(snapshot, { indexed: true, snapshot: 'pinned' });
    if (BigInt(snapshot.source.block.number) < BigInt(minimumBlock)) return null;
    const project = transformBoardProjects({ result: snapshot, scope }).find(row => row.id.toLowerCase() === scope.projectId.toLowerCase());
    return project ? { columns: project.columns, source: snapshot.source } : null;
  } catch { return null; }
}
