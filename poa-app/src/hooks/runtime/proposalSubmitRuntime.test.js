import { afterEach, describe, expect, it, vi } from 'vitest';
import { utils, constants } from 'ethers';
import { getAbi } from '@poa-box/core/contracts';
import { knownFact } from '@poa-box/core/data/facts';
import { electionPlanningFingerprint } from '@poa-box/core/governance/elections';
import { observeElection } from '@/lib/accessV2/electionObservation';
import { submitProposalRuntime } from './proposalSubmitRuntime';
import { AUTHORITY_ADDRESS, ALICE, CAROL, EXECS_ID, ORG_ID, MEMBERS_ID } from '@/lib/accessV2/fixtures';

const RECIPIENT = '0x0000000000000000000000000000000000000011';
const PAYMENT_MANAGER = '0x0000000000000000000000000000000000000022';
const SHARE_CONTRACT = '0x0000000000000000000000000000000000000033';

function context(overrides = {}) {
  return {
    proposal: { type: 'normal', name: '  Choose a meeting day  ', description: '  Our next gathering  ', time: 1.25, options: ['Monday', '', 'Friday', '  '], isRestricted: true, restrictedHatIds: ['12'] },
    orgNetwork: { nativeCurrency: { decimals: 18 } },
    nativeCurrencySymbol: 'xDAI', orgChainId: 100, roleNames: {}, projectNames: {},
    setLoadingSubmit: vi.fn(), resetForm: vi.fn(), toast: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(true), addToIpfs: vi.fn(),
    buildActionSummaries: vi.fn().mockReturnValue(['Members choose a day.']),
    ...Object.fromEntries(['BasicFields', 'TransferProposal', 'ElectionProposal', 'NormalProposal', 'SetterProposal', 'CreateRoleProposal', 'RoleRemovalProposal'].map(name => [`validate${name}`, vi.fn().mockReturnValue(true)])),
    ...overrides,
  };
}

function submitReady(ctx, legacyAddress = null, contractAddresses = {}, accessV2 = {}) {
  return submitProposalRuntime(ctx, legacyAddress, {
    membershipAuthorityAddress: AUTHORITY_ADDRESS,
    ...contractAddresses,
  }, { accessV2: { enabled: true, authority: AUTHORITY_ADDRESS, ...accessV2 } });
}

afterEach(() => vi.restoreAllMocks());

describe('actual proposal submission runtime', () => {
  it('submits the normal poll payload in minutes and resets only after success', async () => {
    const ctx = context();
    let resolveWrite;
    ctx.onSubmit.mockImplementation(() => new Promise(resolve => { resolveWrite = resolve; }));
    const completion = submitReady(ctx);
    expect(ctx.resetForm).not.toHaveBeenCalled();
    expect(ctx.setLoadingSubmit.mock.calls).toEqual([[true]]);
    expect(ctx.onSubmit).toHaveBeenCalledTimes(1);
    expect(ctx.onSubmit.mock.calls[0][0]).toMatchObject({ name: 'Choose a meeting day', description: 'Our next gathering', time: 75, numOptions: 2, optionNames: ['Monday', 'Friday'], batches: [], actionSummaries: ['Members choose a day.'], gasLimit: null, hatIds: ['12'] });
    resolveWrite(true);
    expect(await completion).toBe(true);
    expect(ctx.resetForm).toHaveBeenCalledTimes(1);
    expect(ctx.setLoadingSubmit.mock.calls).toEqual([[true], [false]]);
    expect(ctx.toast).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
    expect(ctx.addToIpfs).not.toHaveBeenCalled();
  });

  it('retains the draft without a success toast when the transaction returns false', async () => {
    const ctx = context({ onSubmit: vi.fn().mockResolvedValue(false) });
    expect(await submitReady(ctx)).toBe(false);
    expect(ctx.resetForm).not.toHaveBeenCalled();
    expect(ctx.toast).not.toHaveBeenCalled();
    expect(ctx.setLoadingSubmit.mock.calls).toEqual([[true], [false]]);
  });

  it('reports submission failure and retains the draft', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = context({ onSubmit: vi.fn().mockRejectedValue(new Error('Submission declined')) });
    expect(await submitReady(ctx)).toBe(false);
    expect(ctx.resetForm).not.toHaveBeenCalled();
    expect(ctx.toast).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', description: 'Submission declined' }));
    expect(ctx.setLoadingSubmit.mock.calls).toEqual([[true], [false]]);
  });

  it.each(['validateBasicFields', 'validateNormalProposal'])('stops before submission when %s rejects', async validator => {
    const ctx = context(); ctx[validator].mockReturnValue(false);
    await submitReady(ctx);
    expect(ctx.onSubmit).not.toHaveBeenCalled();
    expect(ctx.addToIpfs).not.toHaveBeenCalled();
    expect(ctx.resetForm).not.toHaveBeenCalled();
    expect(ctx.setLoadingSubmit.mock.calls).toEqual([[true], [false]]);
  });

  it('refuses an unreviewed treasury draft before encoding or submitting a payment', async () => {
    const ctx = context();
    ctx.proposal = { ...ctx.proposal, type: 'transferFunds', transferAddress: RECIPIENT, transferAmount: '1.25', transferToken: '', transferSource: 'paymentManager', transferFinalizeIds: ['7'], transferDestination: 'address', isRestricted: false };
    expect(await submitReady(ctx, null, { paymentManagerAddress: PAYMENT_MANAGER })).toBe(false);
    expect(ctx.onSubmit).not.toHaveBeenCalled(); expect(ctx.addToIpfs).not.toHaveBeenCalled();
    expect(ctx.resetForm).not.toHaveBeenCalled();
  });

  it('encodes an advanced setter and preserves the member-authored title', async () => {
    const ctx = context();
    ctx.proposal = { ...ctx.proposal, type: 'setter', setterMode: 'advanced', setterContract: 'participationToken', setterFunction: 'setName', setterParams: ['Worker Shares'] };
    expect(await submitReady(ctx, null, { participationTokenAddress: SHARE_CONTRACT })).toBe(true);
    const payload = ctx.onSubmit.mock.calls[0][0];
    expect(payload.name).toBe('Choose a meeting day');
    expect(payload.optionNames).toEqual(['Apply Changes', 'Reject']);
    expect(payload.batches[1]).toEqual([]);
    expect(payload.batches[0]).toHaveLength(1);
    const call = payload.batches[0][0];
    expect(call.target).toBe(SHARE_CONTRACT); expect(call.value).toBe('0');
    expect(new utils.Interface(['function setName(string newName)']).decodeFunctionData('setName', call.data)[0]).toBe('Worker Shares');
    expect(ctx.resetForm).toHaveBeenCalledTimes(1);
  });
});


describe('authority-only deferred submission', () => {
  it.each(['normal', 'transferFunds', 'election', 'createRole', 'setter'])(
    'rejects an unresolved %s org before validation, uploads or writes', async type => {
      const ctx = context();
      ctx.proposal = { ...ctx.proposal, type, roleConfig: { name: 'Old draft', description: 'Do not upload' } };
      expect(await submitProposalRuntime(ctx, null, { membershipAuthorityAddress: AUTHORITY_ADDRESS }, { accessV2: { enabled: false } })).toBe(false);
      expect(ctx.validateBasicFields).not.toHaveBeenCalled();
      expect(ctx.addToIpfs).not.toHaveBeenCalled();
      expect(ctx.onSubmit).not.toHaveBeenCalled();
      expect(ctx.resetForm).not.toHaveBeenCalled();
      expect(ctx.setLoadingSubmit).toHaveBeenLastCalledWith(false);
      expect(ctx.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Organization permissions are unavailable', status: 'error' }));
    },
  );

  it('rejects readiness without a resolved authority address', async () => {
    const ctx = context();
    expect(await submitProposalRuntime(ctx, null, {}, { accessV2: { enabled: true } })).toBe(false);
    expect(ctx.onSubmit).not.toHaveBeenCalled();
    expect(ctx.addToIpfs).not.toHaveBeenCalled();
  });

  it.each([
    { setterMode: 'advanced', setterContract: 'hybridVoting', setterFunction: 'setCreatorHatAllowed', setterParams: ['12', true] },
    { setterMode: 'advanced', setterContract: 'taskManager', setterFunction: 'setConfig', setterParams: [2, '0x' + '00'.repeat(32)] },
    { setterMode: 'template', setterTemplate: 'allow-proposal-creator-hybrid', setterValues: { role: '12', allowed: true } },
  ])('blocks a retired restored setter even if its UI validator passes: $setterFunction $setterTemplate', async draft => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ctx = context();
    ctx.proposal = { ...ctx.proposal, type: 'setter', ...draft };
    expect(await submitReady(ctx, null, { votingContractAddress: SHARE_CONTRACT, taskManagerContractAddress: SHARE_CONTRACT })).toBe(false);
    expect(ctx.validateSetterProposal).toHaveBeenCalled();
    expect(ctx.onSubmit).not.toHaveBeenCalled();
    expect(ctx.addToIpfs).not.toHaveBeenCalled();
    expect(ctx.resetForm).not.toHaveBeenCalled();
    expect(ctx.toast).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', description: expect.stringMatching(/retired|unavailable/) }));
  });

  it('refuses historical membership rows as a substitute for reviewed current election evidence', async () => {
    const ctx = context();
    ctx.proposal = { ...ctx.proposal, type: 'election', electionRoleId: EXECS_ID, electionCandidates: [{ name: 'Alice', address: ALICE }], electionSelectedIncumbents: [{ name: 'Carol', address: CAROL }], electionIncludeNoOneOption: true };
    expect(await submitReady(ctx, null, {}, {
      memberships: [{ subjectId: EXECS_ID, user: CAROL, accepted: true }], inOrgUsers: new Set([ALICE, CAROL]),
      roles: [{ subjectId: EXECS_ID, name: 'Executives' }],
    })).toBe(false);
    expect(ctx.onSubmit).not.toHaveBeenCalled(); expect(ctx.addToIpfs).not.toHaveBeenCalled();
    expect(ctx.resetForm).not.toHaveBeenCalled();
  });
});

it('submits the exact reviewed PaymentManager payout after re-observing the same qualified plan', async () => {
  const executor = '0x' + '8'.repeat(40), block = { number: '100', hash: '0x' + '7'.repeat(64) };
  const scope = { chainId: 100, orgId: ORG_ID, contracts: { executor, paymentManager: PAYMENT_MANAGER } };
  const source = contract => ({ ...scope, contract, endpoint: 'https://rpc.invalid', method: 'eth_call', indexed: false, snapshot: 'pinned', block });
  const coverage = { status: 'complete', receivedKeys: [], failedIds: [], missingIds: [], issues: [] };
  const asset = { chainId: 100, address: constants.AddressZero, decimals: 18 };
  const rounds = Array.from({ length: 7 }, (_, i) => ({ distributionId: String(i + 1), payoutToken: constants.AddressZero,
    totalAmount: i < 6 ? '1' : '1000000000000000000', totalClaimed: i < 6 ? '1' : '1000000000000000000', finalized: i < 6, checkpointBlock: '10', creationBlock: knownFact('20', source(PAYMENT_MANAGER)) }));
  const evidence = { scope, block, asset, executor: { source: source(executor), coverage, data: { asset, rawAmount: '0' } },
    paymentManager: { source: source(PAYMENT_MANAGER), coverage: { ...coverage, receivedKeys: rounds.map(row => row.distributionId) },
      data: { asset, balanceRaw: '2000000000000000000', distributionCounterRaw: '7', rounds } } };
  const ctx = context(); ctx.proposal = { ...ctx.proposal, type: 'transferFunds', transferAddress: RECIPIENT, transferAmount: '1.25', transferToken: '',
    transferSource: 'paymentManager', transferFinalizeIds: ['7'], transferDestination: 'address', isRestricted: false };
  const refetch = vi.fn(async () => ({ planningEvidence: evidence }));
  const succeeded = await submitProposalRuntime(ctx, null, { membershipAuthorityAddress: AUTHORITY_ADDRESS, paymentManagerAddress: PAYMENT_MANAGER, treasuryContractAddress: executor }, {
    accessV2: { enabled: true, authority: AUTHORITY_ADDRESS, orgId: ORG_ID }, treasury: { transferDecimals: 18, planningEvidence: evidence, refetch },
  });
  expect(succeeded, JSON.stringify(ctx.toast.mock.calls)).toBe(true);
  expect(refetch).toHaveBeenCalledOnce();
  const calls = ctx.onSubmit.mock.calls[0][0].batches[0];
  const iface = new utils.Interface(getAbi('PaymentManager'));
  expect(calls.map(call => iface.parseTransaction({ data: call.data }).name)).toEqual(['finalizeDistribution', 'withdraw']);
  expect(iface.decodeFunctionData('withdraw', calls[1].data)[2].toString()).toBe('1250000000000000000');
});

it('submits a reviewed election through the actual core planner after a current same-block recheck', async () => {
  const executor = '0x' + '8'.repeat(40), hash = '0x' + '7'.repeat(64);
  const scope = { chainId: 100, orgId: ORG_ID, contract: AUTHORITY_ADDRESS };
  const source = { ...scope, endpoint: 'https://graph.invalid', method: 'authority-snapshot', indexed: true, snapshot: 'pinned', block: { number: '123', hash } };
  const coverage = { status: 'complete', receivedKeys: [], failedIds: [], missingIds: [], issues: [] };
  const live = { executor: async () => executor, orgId: async () => ORG_ID, paused: async () => false,
    getSubject: async () => ({ exists: true, maxMembers: '1' }), memberCount: async () => '1',
    getStatus: async (_subject, user) => ({ accepted: user === CAROL.toLowerCase(), eligible_: true, acceptedAt: '10', ruleKind: 0 }),
    userSubjects: async user => [user === CAROL.toLowerCase() ? EXECS_ID : MEMBERS_ID], canRemove: async () => ({ reason: 7, sourceSet: 1 }) };
  const snapshot = { source, coverage, data: { authority: { isRouterBound: true, cutoverAt: '1' },
    subjects: [{ subjectId: EXECS_ID, kind: 'Role', raw: { id: EXECS_ID, lastUpdatedAt: '100' } }],
    memberships: [{ subject: { subjectId: EXECS_ID }, user: CAROL, accepted: true }], collections: { accessRules: { data: [] } } } };
  const read = async () => observeElection({ scope, snapshot, subjectId: EXECS_ID, executor, candidates: [ALICE], now: () => 1001,
    readFactory: { createReadOnly: () => live, provider: { connection: { url: 'https://rpc.invalid' }, getNetwork: async () => ({ chainId: 100 }), getBlock: async () => ({ number: 123, hash, timestamp: 1000 }) } } });
  const evidence = await read();
  const reviewed = { ...evidence, confirmedBans: [{ subjectId: EXECS_ID, account: CAROL, reason: 7, sourceSet: 1 }],
    expectedFingerprint: electionPlanningFingerprint(evidence.context.data, evidence.preflights.data) };
  const ctx = context(); ctx.proposal = { ...ctx.proposal, type: 'election', electionRoleId: EXECS_ID, electionCandidates: [{ name: 'Alice', address: ALICE }],
    electionSelectedIncumbents: [{ name: 'Carol', address: CAROL, ban: true, expectedReason: 7, expectedSourceSet: 1 }], electionIncludeNoOneOption: true };
  const refreshGovernancePlanning = vi.fn(read);
  expect(await submitReady(ctx, null, {}, { electionPlanning: reviewed, refreshGovernancePlanning })).toBe(true);
  expect(refreshGovernancePlanning).toHaveBeenCalledOnce();
  const payload = ctx.onSubmit.mock.calls[0][0]; expect(payload.optionNames).toEqual(['Alice', 'No One']);
  const iface = new utils.Interface(getAbi('MembershipAuthority'));
  expect(payload.batches[0].map(call => iface.parseTransaction({ data: call.data }).name)).toEqual(['remove', 'grant']);
  expect(payload.batches[1]).toEqual([]);
});
