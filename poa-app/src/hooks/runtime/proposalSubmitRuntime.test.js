import { afterEach, describe, expect, it, vi } from 'vitest';
import { utils, constants } from 'ethers';
import { submitProposalRuntime } from './proposalSubmitRuntime';
import PaymentManagerABI from '../../../abi/PaymentManager.json';
import { authorityInterface } from '@/lib/accessV2/txBuilders';
import { AUTHORITY_ADDRESS, ALICE, CAROL, EXECS_ID } from '@/lib/accessV2/fixtures';

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

  it('encodes the chosen PaymentManager pot and payout order without network access', async () => {
    const ctx = context();
    ctx.proposal = { ...ctx.proposal, type: 'transferFunds', transferAddress: RECIPIENT, transferAmount: '1.25', transferToken: '', transferSource: 'paymentManager', transferFinalizeIds: ['7'], transferDestination: 'address', isRestricted: false };
    expect(await submitReady(ctx, null, { paymentManagerAddress: PAYMENT_MANAGER })).toBe(true);
    const payload = ctx.onSubmit.mock.calls[0][0];
    expect(payload.time).toBe(75); expect(payload.numOptions).toBe(2); expect(payload.hatIds).toEqual([]);
    expect(payload.batches).toHaveLength(2); expect(payload.batches[1]).toEqual([]);
    const iface = new utils.Interface(PaymentManagerABI);
    const calls = payload.batches[0]; expect(calls).toHaveLength(2);
    expect(calls.map(call => [call.target, call.value])).toEqual([[PAYMENT_MANAGER, '0'], [PAYMENT_MANAGER, '0']]);
    const finalize = iface.decodeFunctionData('finalizeDistribution', calls[0].data);
    expect(finalize[0].toString()).toBe('7'); expect(finalize[1].toString()).toBe('0');
    const withdraw = iface.decodeFunctionData('withdraw', calls[1].data);
    expect(withdraw[0]).toBe(constants.AddressZero); expect(withdraw[1]).toBe(RECIPIENT); expect(withdraw[2].toString()).toBe('1250000000000000000');
    expect(ctx.addToIpfs).not.toHaveBeenCalled();
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

  it('submits an election through the authority encoder after the lazy-runtime split', async () => {
    const ctx = context();
    ctx.proposal = { ...ctx.proposal, type: 'election', electionRoleId: EXECS_ID, electionCandidates: [{ name: 'Alice', address: ALICE }], electionSelectedIncumbents: [{ name: 'Carol', address: CAROL }], electionIncludeNoOneOption: true };
    expect(await submitReady(ctx, null, {}, {
      memberships: [{ subjectId: EXECS_ID, user: CAROL, accepted: true }],
      inOrgUsers: new Set([ALICE, CAROL]),
      roles: [{ subjectId: EXECS_ID, name: 'Executives' }],
    })).toBe(true);
    const payload = ctx.onSubmit.mock.calls[0][0];
    expect(payload.optionNames).toEqual(['Alice', 'No One']);
    expect(payload.batches[1]).toEqual([]);
    expect(payload.batches[0].every(call => call.target.toLowerCase() === AUTHORITY_ADDRESS.toLowerCase())).toBe(true);
    expect(payload.batches[0].map(call => authorityInterface.parseTransaction({ data: call.data }).name)).toEqual(['remove', 'grant']);
    expect(ctx.addToIpfs).not.toHaveBeenCalled();
  });
});
