import { isUnknownFieldError } from '@poa-box/core/graph/client';
import { requireRawUint } from '@poa-box/core/amounts';
import { assertSourceRef, assertSourceBlock, requireCompleteSnapshot } from '@poa-box/core/data/facts';
import { print } from 'graphql';
import { coreDocument, coreFields } from '@/lib/graphql/coreDocuments';
import {
  FETCH_PROJECTS_PAGE, FETCH_PROJECTS_DATA, FETCH_PROJECTS_DATA_WITH_RELEASES,
  FETCH_TASKS_PAGE, FETCH_TASKS_PAGE_LEGACY, FETCH_TASK_RELEASE_HISTORY, TASK_CLAIM_EXPIRY_FRAGMENT,
} from '@poa-box/core/graph/documents/task';

const TASK_PATH = 'organization.taskManager.projects.tasks';

/** Presentation selections extend the canonical cursor/binding/block documents. */
export function boardDocument(document, withReleases) {
  if (document === FETCH_PROJECTS_PAGE) return coreDocument(document, { fields: { projects: {
    add: coreFields(FETCH_PROJECTS_DATA, 'organization.taskManager.projects', { only: ['bountyCaps'] }),
  } } });
  if (document !== FETCH_TASKS_PAGE && document !== FETCH_TASKS_PAGE_LEGACY) return document;
  const fields = ['submissionHash', 'rejectionHash', 'rejectionCount', 'rejections', 'assigneeUsername',
    'completer', 'completerUsername', 'assignedAt', 'submittedAt', 'completedAt', 'applications'];
  if (document === FETCH_TASKS_PAGE) fields.push('reclaimCount');
  const releaseFields = withReleases ? coreFields(FETCH_PROJECTS_DATA_WITH_RELEASES, TASK_PATH,
    { only: ['releaseCount', 'lastReleasedAt'] }) + ` releases(orderBy: releasedAt, orderDirection: desc, first: 5) {
      ${coreFields(FETCH_TASK_RELEASE_HISTORY, 'task.releases', { omit: ['releasedAtBlock', 'transactionHash'] })} }` : '';
  return coreDocument(document, { fields: {
    tasks: { add: coreFields(FETCH_PROJECTS_DATA, TASK_PATH, { only: fields }) + releaseFields +
      ` claimExpiries(orderBy: expiredAt, orderDirection: desc, first: 5) {
        ${coreFields(TASK_CLAIM_EXPIRY_FRAGMENT, '', { only: ['previousClaimer', 'newClaimer', 'expiredAt'] })}
        previousClaimerUsername }` },
    'tasks.metadata': { add: coreFields(FETCH_PROJECTS_DATA, `${TASK_PATH}.metadata`, { only: ['id', 'rejection'] }) },
  } });
}

function endpointQuery(client, source) {
  return async (document, variables, pageSource) => {
    if (pageSource.endpoint !== source.endpoint) throw new Error('Project source changed.');
    let response;
    // Authority's canonical pages prove number/hash. Select those same identity dimensions
    // here, rather than requesting timestamps that its membership facts cannot attest.
    const normalized = await client.query({ query: coreDocument(document, { fields: { '_meta.block.timestamp': false } }), variables, fetchPolicy: 'network-only',
      context: { queryDeduplication: false, onCoreResponse: value => {
        response = { data: value.data == null ? value.data : structuredClone(value.data), errors: value.errors };
      } },
    });
    const result = response || normalized;
    if (result.errors?.length) throw { errors: result.errors, response: { errors: result.errors } };
    if (result.error) throw result.error;
    if (!result.data) throw new Error('Project data is unavailable.');
    return structuredClone(result.data);
  };
}

/** Select an actual observed indexed block once, before enumerating any board collection. */
export async function observeBoardSource({ client, source, minimumBlock }) {
  assertSourceRef(source);
  if (source.snapshot === 'pinned') {
    if (minimumBlock != null && BigInt(source.block.number) < BigInt(requireRawUint(minimumBlock))) {
      throw new Error('The saved tasks are still indexing.');
    }
    return source;
  }
  const query = endpointQuery(client, source);
  const data = await query(FETCH_PROJECTS_PAGE, { orgId: source.orgId,
    taskManager: source.contract.toLowerCase(), cursor: '', first: 1 }, source);
  const meta = data?._meta?.block;
  if (!meta || meta.hash === undefined) throw new Error('Project observation is unavailable.');
  const pinnedSource = { ...source, snapshot: 'pinned', block: { number: requireRawUint(meta.number),
    ...(meta.hash != null ? { hash: meta.hash } : {}),
  }, observedAt: Math.floor(Date.now() / 1000) };
  assertSourceRef(pinnedSource);
  if (minimumBlock != null && BigInt(pinnedSource.block.number) < BigInt(requireRawUint(minimumBlock))) {
    throw new Error('The saved tasks are still indexing.');
  }
  return pinnedSource;
}

/** Complete canonical project/task pages retain endpoint-owned Apollo caching and exact IDs. */
export async function readBoardProjects({ client, source, releasesSupported }) {
  const [{ listProjectsComplete, projectManagerFact }, { listTasksComplete, taskEntityId },
    { taskActionPolicy, projectHasReviewCapability }] = await Promise.all([
    import('@poa-box/core/reads/project'), import('@poa-box/core/reads/task'), import('@/lib/tasks/actionPolicy'),
  ]);
  const pinnedSource = await observeBoardSource({ client, source });
  const query = endpointQuery(client, pinnedSource);
  let hasDeadlineData = true;
  let hasReleaseData = Boolean(releasesSupported);
  const boardQuery = async (document, variables, pageSource) => {
    if (document === FETCH_TASKS_PAGE_LEGACY) hasDeadlineData = false;
    let enriched = boardDocument(document, hasReleaseData);
    try { return await query(typeof enriched === 'string' ? enriched : print(enriched), variables, pageSource); }
    catch (error) {
      // Optional release presentation must never change collection filters or the observed block.
      if (!hasReleaseData || !isUnknownFieldError(error)) throw error;
      hasReleaseData = false;
      enriched = boardDocument(document, false);
      return query(typeof enriched === 'string' ? enriched : print(enriched), variables, pageSource);
    }
  };
  const [projects, tasks] = await Promise.all([
    listProjectsComplete({ source: pinnedSource, query: boardQuery }),
    listTasksComplete({ source: pinnedSource, query: boardQuery }),
  ]);
  requireCompleteSnapshot(projects, { scope: pinnedSource, indexed: true, snapshot: 'pinned' });
  requireCompleteSnapshot(tasks, { scope: pinnedSource, indexed: true, snapshot: 'pinned' });
  assertSourceBlock(tasks.source.block, projects.source.block);
  assertSourceBlock(projects.source.block, tasks.source.block);
  const projectMap = new Map(projects.data.map(row => {
    if (row.id.toLowerCase() !== `${source.contract.toLowerCase()}-${row.projectId.toLowerCase()}`) {
      throw new Error('The project data is incomplete.');
    }
    return [row.id, { ...row, tasks: [] }];
  }));
  for (const task of tasks.data) {
    const parent = projectMap.get(task.project.id);
    if (!parent || taskEntityId(source.contract, task.taskId) !== task.id.toLowerCase()) {
      throw new Error('The task data is incomplete.');
    }
    parent.tasks.push(task);
  }
  // Preserve the board's historical newest-task-first presentation; IDs never narrow to Number.
  for (const project of projectMap.values()) project.tasks.sort((a, b) =>
    BigInt(a.taskId) > BigInt(b.taskId) ? -1 : BigInt(a.taskId) < BigInt(b.taskId) ? 1 : 0);
  return { data: { organization: { id: source.orgId, taskManager: { id: source.contract, projects: [...projectMap.values()] } } },
    source: projects.source, coverage: { status: 'complete',
      receivedKeys: [...projects.coverage.receivedKeys, ...tasks.coverage.receivedKeys],
      missingIds: [], failedIds: [], issues: [] },
    taskActionPolicy, projectHasReviewCapability, projectManagerFact,
    collections: { projects, tasks }, hasDeadlineData, hasReleaseData };
}

export async function readBoardManagers({ client, source }) {
  const { listProjectManagersComplete } = await import('@poa-box/core/reads/project');
  const pinnedSource = await observeBoardSource({ client, source });
  return listProjectManagersComplete({ source: pinnedSource, query: endpointQuery(client, pinnedSource) });
}

/** The same selected source is actually requested and proven by every page, including empty terminals. */
export async function readBoardSnapshot({ client, source, releasesSupported, minimumBlock }) {
  const pinnedSource = await observeBoardSource({ client, source, minimumBlock });
  const [result, managers] = await Promise.all([
    readBoardProjects({ client, source: pinnedSource, releasesSupported }),
    readBoardManagers({ client, source: pinnedSource }),
  ]);
  return { result, managers };
}
