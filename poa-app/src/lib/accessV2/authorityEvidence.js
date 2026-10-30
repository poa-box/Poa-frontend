import { gql } from '@apollo/client';
import { createDocumentQueryAdapter } from '@poa-box/core/graph/sources';
import { readAuthoritySnapshot } from '@poa-box/core/reads/authority';
import { requireRawUint } from '@poa-box/core/amounts';
import { assertSourceBlock } from '@poa-box/core/data/facts';

const HEAD = gql`query AuthorityObservationHead { _meta { block { number hash } } }`;
const TASK_MODULE = `query AuthorityTaskBindings($orgId: ID!, $block: Block_height) {
  _meta(block: $block) { block { number hash } }
  organization(id: $orgId, block: $block) { id executorContract { id } taskManager { id creatorHatIds } }
}`;

/** Observe the endpoint head, then ask core to prove that block on every collection page.
 * Apollo remains endpoint-owned. A requested block is never returned as observed evidence.
 */
export async function observeAuthority({ client, scope, pageSize, maxPages, block: requestedBlock, now = () => Date.now() / 1000 }) {
  const adapter = createDocumentQueryAdapter({
    parse: gql,
    createClient: () => client,
    execute: async (endpointClient, { document, variables }) => {
      let response;
      const result = await endpointClient.query({
        query: document, variables, fetchPolicy: 'network-only',
        context: { queryDeduplication: false, onCoreResponse: value => {
          response = { data: value.data == null ? value.data : structuredClone(value.data), errors: value.errors };
        } },
      });
      return response || result;
    },
  });
  let block;
  if (requestedBlock) {
    const number = requireRawUint(requestedBlock.number);
    if (!Number.isSafeInteger(Number(number)) || (requestedBlock.hash !== undefined && !/^0x[\da-fA-F]{64}$/.test(requestedBlock.hash))) {
      throw new Error('The selected membership observation could not be verified.');
    }
    block = { number: Number(number), ...(requestedBlock.hash ? { hash: requestedBlock.hash } : {}) };
  } else {
    const head = await client.query({ query: HEAD, fetchPolicy: 'network-only' });
    block = head?.data?._meta?.block;
    if (head.error || head.errors?.length || !Number.isSafeInteger(block?.number) || block.number < 0) {
      throw new Error('Membership information could not be verified. Please retry.');
    }
  }
  const source = { ...scope, method: 'authority-snapshot', indexed: true, snapshot: 'pinned',
    block: { number: String(block.number), ...(block.hash ? { hash: block.hash } : {}) }, observedAt: Math.floor(now()) };
  const snapshot = await readAuthoritySnapshot({ source, query: adapter.query, pageSize, maxPages });
  // Auxiliary TaskManager bindings do not certify or weaken authority collection coverage.
  let taskModule = null;
  try {
    const response = await adapter.query(source, TASK_MODULE, { orgId: scope.orgId,
      block: source.block.hash ? { hash: source.block.hash } : { number: block.number } });
    const proof = response.data?._meta?.block;
    assertSourceBlock(proof ? { number: String(proof.number), hash: proof.hash } : undefined, source.block);
    const org = response.data?.organization;
    if (!response.issues.length && org?.id === scope.orgId && org.taskManager?.id && org.executorContract?.id
        && Array.isArray(org.taskManager.creatorHatIds)) taskModule = {
      source: { ...snapshot.source, contract: org.taskManager.id, method: 'task-creator-bindings',
        contracts: { membershipAuthority: scope.contract, taskManager: org.taskManager.id, executor: org.executorContract.id } },
      executor: org.executorContract.id, creatorSubjectIds: org.taskManager.creatorHatIds,
    };
  } catch { /* Keep task-only facts unknown without denying unrelated authority reads. */ }
  return { ...snapshot, data: { ...snapshot.data, taskModule } };
}

/** Canonical flat collections -> existing view-model input. No capped nested relations. */
export function authoritySubjectRows(snapshot) {
  if (!snapshot) return [];
  const data = snapshot.data;
  return (data.collections?.subjects?.data || []).map(subject => ({
    ...subject,
    perms: (data.permissions || []).filter(row => row.subjectId === subject.subjectId),
    groups: (data.groupEdges || []).filter(row => row.roleSubjectId === subject.subjectId),
    memberRoles: (data.groupEdges || []).filter(row => row.groupSubjectId === subject.subjectId),
  }));
}

/** Shared across hook instances; a failed refresh revokes old positive evidence immediately. */
export function createAuthorityObservationStore(read) {
  let state = { snapshot: null, loading: false, error: null };
  let pending;
  const listeners = new Set();
  const publish = next => { state = next; listeners.forEach(listener => listener()); };
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    refresh() {
      if (pending) return pending;
      publish({ snapshot: null, loading: true, error: null });
      pending = Promise.resolve().then(read).then(snapshot => {
        publish({ snapshot, loading: false, error: snapshot.coverage.status === 'complete' ? null
          : new Error('Some membership information could not be verified. Please retry.') });
        return snapshot;
      }, () => {
        const error = new Error('Membership information could not be verified. Please retry.');
        publish({ snapshot: null, loading: false, error });
        throw error;
      }).finally(() => { pending = undefined; });
      return pending;
    },
  };
}
