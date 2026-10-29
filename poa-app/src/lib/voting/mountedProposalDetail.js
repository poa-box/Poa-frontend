import { knownFact, unknownFact, requireCompleteSnapshot } from '@poa-box/core/data/facts';
import { requireRawUint } from '@poa-box/core/amounts';
import { readProposalDetailFacts, readProposalBallotFacts } from '@poa-box/core/reads/vote';

const HEAD = 'query MountedProposalHead { _meta { block { number hash } } }';

/** Only an open detail enumerates ballots. Every page (including terminal proof)
 * binds to the endpoint, module, organization, parent and observed block in core.
 */
export async function readMountedProposalDetail({ query, scope, lane, proposalId, readClasses,
  pageSize = 250, maxPages = 40 }) {
  const id = requireRawUint(proposalId);
  const headSource = { ...scope, method: 'mounted-proposal-head', indexed: true, snapshot: 'latest' };
  const head = await query(HEAD, {}, headSource);
  const block = head?._meta?.block;
  if (!Number.isSafeInteger(block?.number) || block.number < 0) throw new Error('Vote totals could not yet be verified.');
  const source = { ...scope, method: 'mounted-proposal-detail', indexed: true, snapshot: 'pinned',
    block: { number: String(block.number), ...(block.hash ? { hash: block.hash } : {}) } };
  const [detail, ballots] = await Promise.all([
    readProposalDetailFacts({ source, query, lane, compositeId: `${scope.contract.toLowerCase()}-${id}` }),
    readProposalBallotFacts({ source, query, lane, proposalId: id, pageSize, maxPages }),
  ]);
  requireCompleteSnapshot(detail, { scope });
  const row = detail.data.proposal.state === 'known' ? detail.data.proposal.value : null;
  if (!row) throw new Error('This vote is still being updated.');
  let classes = lane === 'dd' ? knownFact([], source) : detail.data.classSnapshot.classes;
  if (lane === 'hybrid' && classes.state !== 'known') {
    try {
      // Provider/ABIs are loaded only for a mounted fallback, independently of auth.
      const read = readClasses || (await import('@/lib/voting/readonlyProposalClasses')).readReadonlyProposalClasses;
      classes = await read({ scope, source, proposalId: id, proposal: row });
    } catch { classes = unknownFact('IMMUTABLE_CLASSES_UNAVAILABLE', source); }
  }
  const parentMatches = ballots.data.every(ballot => ballot.proposal?.numOptions === row.numOptions
    && ballot.proposal?.createdAtBlock === row.createdAtBlock);
  const coverage = parentMatches ? ballots.coverage : { ...ballots.coverage, status: 'incomplete',
    issues: [...ballots.coverage.issues, { code: 'DETAIL_BALLOT_PARENT_MISMATCH' }] };
  return { source, detail, ballots: { ...ballots, coverage }, classes };
}
