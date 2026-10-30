import { requireRawUint } from '@poa-box/core/amounts';
import { assertSourceRef } from '@poa-box/core/data/facts';
import { listEducationModulesComplete, listCompletionsComplete } from '@poa-box/core/reads/education';
import { FETCH_MODULES_PAGE, FETCH_COMPLETIONS_PAGE } from '@poa-box/core/graph/documents/education';
import { createApolloProtocolQuery } from '@/lib/graphql/coreQuery';
import { bytes32ToIpfsCid } from '@/lib/ipfs/cidBytes32';
import { formatTokenAmount } from '@/util/formatToken';

/** Select a real indexed block, then let core prove it on every cursor page. */
export async function readEducation({ client, source, kind, pageSize = 250, maxPages = 100 }) {
  assertSourceRef(source);
  if (!['modules', 'completions'].includes(kind)) throw new Error('Unknown education read.');
  const query = createApolloProtocolQuery({ clientForEndpoint: endpoint => {
    if (endpoint !== source.endpoint) throw new Error('Education source changed.');
    return client;
  }, fetchPolicy: 'network-only' });
  const document = kind === 'modules' ? FETCH_MODULES_PAGE : FETCH_COMPLETIONS_PAGE;
  let pinned = source;
  if (source.snapshot !== 'pinned') {
    const data = await query(document, { orgId: source.orgId.toLowerCase(), hub: source.contract.toLowerCase(),
      ...(kind === 'completions' ? { learner: source.account.toLowerCase() } : {}), cursor: '', first: 1 }, source);
    const block = data?._meta?.block;
    if (!block || block.hash === undefined) throw new Error('Education data is unavailable.');
    pinned = { ...source, snapshot: 'pinned', block: { number: requireRawUint(block.number),
      ...(block.hash != null ? { hash: block.hash } : {}),
      ...(block.timestamp != null ? { timestamp: requireRawUint(block.timestamp) } : {}),
    }, observedAt: Math.floor(Date.now() / 1000) };
    assertSourceRef(pinned);
  }
  const reader = kind === 'modules' ? listEducationModulesComplete : listCompletionsComplete;
  return reader({ source: pinned, query, pageSize, maxPages });
}

function quizFields(metadata, indexed) {
  let answers = metadata?.answers;
  if (indexed) {
    try { answers = JSON.parse(metadata?.answersJson || '[]'); } catch { answers = []; }
  }
  return {
    description: metadata?.description || 'No description available',
    link: metadata?.link || '',
    question: Array.isArray(metadata?.quiz) ? metadata.quiz[0] || '' : '',
    answers: (Array.isArray(answers?.[0]) ? answers[0] : []).map((answer, index) => ({ index, answer })),
  };
}

/** Host presentation only. Keep raw IDs, rewards and the full metadata document. */
export async function shapeEducationModules(rows, safeFetchFromIpfs) {
  return Promise.all(rows.map(async row => {
    const ipfsHash = bytes32ToIpfsCid(row.contentHash);
    let metadata = row.metadata;
    let contentUnavailable = false;
    const contentLoading = !!(!metadata && ipfsHash && !safeFetchFromIpfs);
    if (!metadata && ipfsHash && safeFetchFromIpfs) {
      try { metadata = await safeFetchFromIpfs(ipfsHash); } catch { /* Retry via the existing host reader. */ }
      contentUnavailable = !metadata;
    }
    return { ...row,
      id: row.id, moduleId: row.moduleId,
      name: row.title || 'Preparing module…',
      ipfsHash, contentHashBytes32: row.contentHash,
      payoutRaw: row.payout,
      payout: formatTokenAmount(row.payout),
      isIndexing: !ipfsHash,
      ...quizFields(metadata, !!row.metadata),
      ...(!metadata && ipfsHash ? { description: contentLoading ? 'Learning material is loading…' : 'Learning material is unavailable. Please try again.' } : {}),
      metadata,
      // Core's completions reader is per learner, not an all-learners count.
      completions: null, completetions: null, completionCount: null, completionsComplete: false,
      _ipfsFetched: !!metadata, contentUnavailable, contentLoading,
    };
  }));
}

/** The canonical stream already supplies exact raw completion and module IDs. */
export function shapeEducationCompletions(rows) {
  return rows.map(row => ({ ...row, moduleEntityId: row.module?.id ?? null }));
}
