import { FETCH_ORG_TASK_COUNT_PAGE } from '@poa-box/core/graph/documents/org';
import { readIndexedPageFacts } from '@poa-box/core/reads/protocol';
import { requireCompleteSnapshot } from '@poa-box/core/data/facts';
import { getAllSubgraphUrls } from '@/config/networks';
import { PublicDataUnavailable } from '@/lib/graphql/coreQuery';

// Existing Explore totals deliberately count these four visible work states.
const VISIBLE_STATUSES = new Set(['Open', 'Assigned', 'Submitted', 'Completed']);
export async function fetchOrgTaskCounts(endpoint, managerIds, fetchImpl = fetch, { chainId, maxPages = 100, directory } = {}) {
  const counts = Object.fromEntries(managerIds.map((id) => [id, { open: 0, total: 0 }]));
  if (!managerIds.length) return counts;
  const source = {
    chainId: chainId ?? getAllSubgraphUrls().find((entry) => entry.url === endpoint)?.chainId,
    endpoint, indexed: true, snapshot: 'latest', method: 'graph',
  };
  const signal = AbortSignal.timeout(8000);
  const query = async (query, variables) => {
    const response = await fetchImpl(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }), signal,
    });
    if (!response.ok) throw new PublicDataUnavailable();
    const result = await response.json();
    if (result?.errors?.length) throw new PublicDataUnavailable();
    return result?.data;
  };
  if (directory) {
    const { readOrganizationTaskCounts } = await import('@poa-box/core/reads/org');
    const snapshot = await readOrganizationTaskCounts({ source, query, directory, maxPages });
    try {
      const data = requireCompleteSnapshot(snapshot);
      for (const entry of data.counts) {
        if (entry.byStatus.state !== 'known') throw new PublicDataUnavailable(snapshot.coverage);
        const manager = directory.data.find((org) => org.id.toLowerCase() === entry.orgId)?.taskManager?.id;
        if (!counts[manager]) continue;
        counts[manager] = { open: Number(entry.byStatus.value.Open || '0'), total: Number([...VISIBLE_STATUSES]
          .reduce((total, status) => total + BigInt(entry.byStatus.value[status] || '0'), 0n)) };
      }
      return counts;
    } catch { throw new PublicDataUnavailable(snapshot.coverage); }
  }
  // Compatibility caller has manager IDs only. The host must pass the directory
  // snapshot to enable canonical organization/module provenance validation.
  const snapshot = await readIndexedPageFacts({
    source, document: FETCH_ORG_TASK_COUNT_PAGE, collection: 'tasks',
    variables: { taskManagers: managerIds }, initialCursor: '', pageSize: 1000, maxPages,
    validateRow: (task) => {
      if (!Object.prototype.hasOwnProperty.call(counts, task.taskManager)
          || typeof task.status !== 'string') throw new Error('Task scope unavailable');
    },
    query,
  });
  try {
    for (const task of requireCompleteSnapshot(snapshot)) {
      if (!VISIBLE_STATUSES.has(task.status)) continue;
      counts[task.taskManager].total += 1;
      if (task.status === 'Open') counts[task.taskManager].open += 1;
    }
    return counts;
  } catch { throw new PublicDataUnavailable(snapshot.coverage); }
}
