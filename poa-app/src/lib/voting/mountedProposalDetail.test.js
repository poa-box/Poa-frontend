import { describe, expect, it, vi } from 'vitest';
import { FETCH_HYBRID_PROPOSAL_BALLOTS_PAGE, FETCH_DD_PROPOSAL_BALLOTS_PAGE } from '@poa-box/core/graph/documents/voting-classes';
import { readMountedProposalDetail } from '@/lib/voting/mountedProposalDetail';
import { mountedProposalView } from '@/lib/voting/hostProjection';
import { readReadonlyProposalClasses } from '@/lib/voting/readonlyProposalClasses';

const addr = n => `0x${n.repeat(40)}`;
const voting = addr('1'), alice = addr('2'), bob = addr('3'), asset = addr('0');
const orgId = `0x${'4'.repeat(64)}`, hash = `0x${'5'.repeat(64)}`;
const scope = { chainId: 100, orgId, endpoint: 'https://index.example', contract: voting };
const block = { number: 123, hash };
function fixture(lane = 'hybrid') {
  const parentKey = lane === 'hybrid' ? 'hybridVoting' : 'directDemocracyVoting';
  const collection = lane === 'hybrid' ? 'votes' : 'ddvvotes';
  const cls = { id: 'emission-class-0', classIndex: 0, strategy: 'DIRECT', slicePct: 100,
    quadratic: false, minBalance: '0', asset, hatIds: [], isActive: false, version: '100', change: { id: 'exact-emission' } };
  const row = { id: `${voting}-9`, proposalId: '9', numOptions: 2, createdAtBlock: '100', startTimestamp: '10',
    endTimestamp: '20', status: 'Ended', isHatRestricted: false, restrictedHatIds: [], classesVersion: '100',
    [parentKey]: { id: voting, organization: { id: orgId } }, metadata: { optionNames: ['Yes', 'No'] },
    classesChange: { id: 'exact-emission', version: '100', numClasses: 1,
      hybridVoting: { id: voting, organization: { id: orgId } }, votingClasses: [cls] } };
  const ballots = [alice, bob].map((voter, i) => ({ id: `${row.id}-${voter}`, voter,
    optionIndexes: [i], optionWeights: [100], classRawPowers: ['100'], votedAt: '12', votedAtBlock: '110',
    transactionHash: `0x${'6'.repeat(64)}`, proposal: { ...row } }));
  const response = () => ({ _meta: { block }, organization: { id: orgId, [parentKey]: { id: voting } },
    proposals: lane === 'hybrid' ? [row] : [], ddvproposals: lane === 'dd' ? [row] : [] });
  const query = vi.fn(async (document, variables) => {
    if (document.includes('MountedProposalHead')) return { _meta: { block } };
    if (document === FETCH_HYBRID_PROPOSAL_BALLOTS_PAGE || document === FETCH_DD_PROPOSAL_BALLOTS_PAGE) {
      return { ...response(), [collection]: ballots.filter(row => row.id > variables.cursor).slice(0, variables.first) };
    }
    return response();
  });
  const input = { query, scope, lane, proposalId: '9', pageSize: 1, maxPages: 4,
    readClasses: vi.fn(async () => { throw new Error('Unexpected fallback'); }) };
  const poll = { id: row.id, proposalId: '9', type: lane === 'hybrid' ? 'Hybrid' : 'Direct Democracy', votes: [], options: [], thresholdPct: 51, quorum: 1 };
  return { input, row, ballots, query, poll, cls };
}

describe('mounted canonical proposal ballots', () => {
  it.each(['hybrid', 'dd'])('reads complete %s ballots through the actual pinned cursor document', async lane => {
    const { input, query, poll } = fixture(lane);
    const evidence = await readMountedProposalDetail(input);
    expect(evidence.ballots.coverage.status).toBe('complete');
    const document = lane === 'hybrid' ? FETCH_HYBRID_PROPOSAL_BALLOTS_PAGE : FETCH_DD_PROPOSAL_BALLOTS_PAGE;
    const pages = query.mock.calls.filter(([doc]) => doc === document);
    expect(pages).toHaveLength(3); // two full pages AND terminal proof
    for (const [, vars, source] of pages) {
      expect(vars).toMatchObject({ orgId, compositeId: poll.id, first: 1, block: { hash } });
      expect(source).toMatchObject({ ...scope, snapshot: 'pinned', block: { number: '123', hash } });
    }
    const view = mountedProposalView(poll, evidence, alice);
    expect(view).toMatchObject({ totalVotes: 2, tallyKnown: true, tallyComplete: true, userHasVoted: true });
    expect(view.options.map(option => option.percentage)).toEqual([50, 50]);
    expect(input.readClasses).not.toHaveBeenCalled();
  });
  it('requires the exact class emission even when its version matches', async () => {
    const { input, cls, row } = fixture();
    cls.change.id = 'another-emission';
    input.readClasses.mockResolvedValue({ state: 'known', value: [{ ...cls, slicePct: 100 }] });
    await readMountedProposalDetail(input);
    expect(input.readClasses).toHaveBeenCalledWith(expect.objectContaining({ proposal: row,
      proposalId: '9', source: expect.objectContaining({ block: { number: '123', hash } }) }));
  });
  it('never promotes capped, malformed, parent-mismatched or wrong-block pages to complete', async () => {
    for (const mode of ['cap', 'weights', 'parent', 'block', 'votingModule', 'org']) {
      const { input, ballots, query, poll } = fixture();
      if (mode === 'cap') input.maxPages = 2;
      if (mode === 'weights') ballots[0].optionWeights = [99];
      if (mode === 'parent') ballots[0].proposal.proposalId = '8';
      if (['block', 'votingModule', 'org'].includes(mode)) {
        const original = query.getMockImplementation();
        query.mockImplementation(async (...args) => {
          const data = await original(...args);
          if (args[0] === FETCH_HYBRID_PROPOSAL_BALLOTS_PAGE) {
            if (mode === 'block') data._meta = { block: { number: 124, hash } };
            if (mode === 'votingModule') data.organization.hybridVoting.id = addr('8');
            if (mode === 'org') data.organization.id = `0x${'8'.repeat(64)}`;
          }
          return data;
        });
      }
      const evidence = await readMountedProposalDetail(input);
      expect(evidence.ballots.coverage.status, mode).not.toBe('complete');
      expect(mountedProposalView(poll, evidence, null).tallyComplete, mode).toBe(false);
    }
  });
  it('keeps an optimistic own ballot visible without certifying it as indexed', async () => {
    const { input, poll } = fixture();
    const evidence = await readMountedProposalDetail(input);
    const account = addr('7');
    const view = mountedProposalView({ ...poll, votes: [{ voter: account, optionIndexes: [0], optionWeights: [100], classRawPowers: ['100'] }] }, evidence, account);
    expect(view).toMatchObject({ userHasVoted: true, totalVotes: 3, tallyComplete: false });
    expect(evidence.ballots.data).toHaveLength(2);
    expect(mountedProposalView({ ...poll, id: `${voting}-10` }, evidence, null).tallyComplete).toBeUndefined();
  });
  it('leaves missing historical classes unavailable when unsigned fallback fails', async () => {
    const { input, row, poll } = fixture();
    delete row.classesChange;
    const evidence = await readMountedProposalDetail(input);
    expect(evidence.classes.state).toBe('unknown');
    expect(mountedProposalView(poll, evidence, null)).toMatchObject({ tallyKnown: false, tallyComplete: false });
  });
});

describe('lazy anonymous class fallback', () => {
  it('reads frozen classes at the indexed block without an account, signer or balance query', async () => {
    const { input, row } = fixture();
    const votingModule = { getProposalClasses: vi.fn(async () => [{ strategy: 0, slicePct: 100, quadratic: false,
      minBalance: '0', asset, hatIds: [] }]), pollRestricted: vi.fn(async () => false) };
    const provider = { getNetwork: async () => ({ chainId: 100 }), getBlock: vi.fn(async () => block) };
    const classes = await readReadonlyProposalClasses({ scope, source: { ...scope, method: 'detail', indexed: true,
      snapshot: 'pinned', block: { number: '123', hash } }, proposalId: input.proposalId, proposal: row,
      readFactory: { provider, createReadOnly: () => votingModule } });
    expect(classes).toMatchObject({ state: 'known', value: [{ strategy: 'DIRECT', slicePct: 100 }] });
    expect(votingModule.getProposalClasses).toHaveBeenCalledWith('9', { blockTag: 123 });
    expect(provider.getBlock).toHaveBeenCalledTimes(2);
  });
});
