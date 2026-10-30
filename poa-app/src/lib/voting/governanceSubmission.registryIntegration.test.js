import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BigNumber, utils } from 'ethers';
import { knownFact } from '@poa-box/core/data/facts';
import { planElection, planRoleRemovals, electionPlanningFingerprint } from '@poa-box/core/governance/elections';
import { createGovernanceSubmissionGuard, recheckGovernanceSubmission } from '@/lib/voting/governanceSubmission';
import { VotingService } from '@/services/web3/domain/VotingService';
import { submitProposalRuntime } from '@/hooks/runtime/proposalSubmitRuntime';
import { TransactionManager } from '@/services/web3/core/TransactionManager';
import { SmartAccountTransactionManager } from '@/services/web3/core/SmartAccountTransactionManager';
import { fakeBrowserLocks } from '@/services/web3/core/submissionTestHelpers';

const signing = vi.hoisted(() => ({ passkey: vi.fn() }));
vi.mock('@/services/web3/passkey/passkeySign', () => ({ signUserOpWithPasskey: signing.passkey }));

const authority = `0x${'1'.repeat(40)}`, voting = `0x${'2'.repeat(40)}`, incumbent = `0x${'3'.repeat(40)}`, candidate = `0x${'4'.repeat(40)}`;
const orgId = `0x${'5'.repeat(64)}`, hash = `0x${'6'.repeat(64)}`;
const cid = 'QmYwAPJzv5CZsnAzt8auVZRnGFWVkCRyd6jGV4q4BNToea';
const coverage = { status: 'complete', receivedKeys: [], missingIds: [], failedIds: [], issues: [] };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function evidence(now = 1000) {
  const scope = { chainId: 100, orgId, contract: authority }, block = { number: '123', hash };
  const source = { ...scope, endpoint: 'https://rpc.invalid', method: 'election', indexed: false, snapshot: 'pinned', block, observedAt: now };
  const context = { source, coverage, data: { readiness: { membershipAuthority: { id: authority, isRouterBound: true, cutoverAt: '1' } },
    executorAuthorized: knownFact(true), paused: knownFact(false), subjects: [{ subjectId: '7', kind: 'Role', maxMembers: '1', memberCount: '1', rulesRevision: 'unchanged',
      statuses: [{ account: incumbent, accepted: true, eligible: true, acceptedAt: '900', ruleKind: 1 },
        { account: candidate, accepted: false, eligible: false, acceptedAt: '0', ruleKind: 0 }] }],
    accounts: [{ account: incumbent, acceptedAnywhere: knownFact(true), acceptedSubjectIds: knownFact(['7']) },
      { account: candidate, acceptedAnywhere: knownFact(false), acceptedSubjectIds: knownFact([]) }] } };
  const preflights = { source, coverage, data: [{ subjectId: '7', account: incumbent, ban: false, reason: 0, sourceSet: 0 }] };
  return { scope, freshness: { now, maxAgeSeconds: 30, block }, context, preflights,
    expectedFingerprint: electionPlanningFingerprint(context.data, preflights.data), confirmedBans: [] };
}
function proposal(type, input) {
  const removals = [{ account: incumbent, ban: false, expectedReason: 0, expectedSourceSet: 0 }];
  const plan = type === 'election' ? planElection({ ...input, subjectId: '7', candidates: [candidate], removals, stickyWinner: true, includeNoOneOption: true })
    : planRoleRemovals({ ...input, subjectId: '7', removals });
  expect(plan.status).toBe('ready');
  return { type, name: 'Reviewed authority changes', durationMinutes: 60, numOptions: 2, optionNames: ['Apply', 'Keep'],
    batches: plan.data.map(batch => batch.map(call => ({ target: call.target, value: String(call.value), data: call.calldata }))),
    electionRoleId: '7', electionCandidates: [{ name: 'Candidate', address: candidate }], electionIncludeNoOneOption: true,
    electionSelectedIncumbents: [{ address: incumbent, ban: false, expectedReason: 0, expectedSourceSet: 0 }], electionConfirmBans: false,
    roleRemovalConfig: { subjectId: '7', subjectName: 'Stewards', liveReconciled: true,
      members: [{ address: incumbent, ban: false, expectedReason: 0, expectedSourceSet: 0 }], confirmBans: false } };
}
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('OFFLINE_NETWORK_FORBIDDEN'); }));
  vi.stubGlobal('navigator', { locks: fakeBrowserLocks() });
  signing.passkey.mockReset();
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('authority planning lifetime across enclosing proposal metadata', () => {
  it.each(['election', 'removeRoleMembers'])('refuses stale reviewed %s facts before the wallet manager after a slow upload', async type => {
    let now = 1000;
    const input = evidence(), request = proposal(type, input), gate = deferred();
    recheckGovernanceSubmission(request, input, now);
    const execute = vi.fn(async () => ({ success: true }));
    const service = new VotingService({ createWritable: (address, abi) => ({ address, interface: new utils.Interface(abi) }) }, { execute },
      { addToIpfs: vi.fn(async () => { await gate.promise; return { path: cid }; }) });
    const pending = service.createHybridProposal(voting, request, { beforeExecute: () => recheckGovernanceSubmission(request, input, now) });
    expect(execute).not.toHaveBeenCalled(); now = 1040; gate.resolve();
    await expect(pending).rejects.toThrow('Review');
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(['election', 'removeRoleMembers'])('refreshes unchanged %s choices after slow upload and keeps callbacks out of metadata and manager options', async type => {
    let now = 1000;
    const input = evidence(), request = proposal(type, input), gate = deferred();
    const refresh = vi.fn(async () => evidence(now));
    const beforeExecute = createGovernanceSubmissionGuard(request, input, refresh, () => now);
    const execute = vi.fn(async () => ({ success: true })), uploads = [];
    const service = new VotingService({ createWritable: (address, abi) => ({ address, interface: new utils.Interface(abi) }) }, { execute },
      { addToIpfs: vi.fn(async text => { uploads.push(text); await gate.promise; return { path: cid }; }) });
    const pending = service.createHybridProposal(voting, request, { beforeExecute, confirmations: 2 });
    expect(refresh).not.toHaveBeenCalled(); now = 1040; gate.resolve();
    await expect(pending).resolves.toEqual({ success: true });
    expect(refresh).toHaveBeenCalledOnce(); expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0][3]).toMatchObject({ confirmations: 2 });
    expect(execute.mock.calls[0][3]).not.toHaveProperty('beforeExecute');
    expect(JSON.parse(uploads[0])).not.toHaveProperty('beforeExecute');
    expect(JSON.parse(uploads[0])).not.toHaveProperty('governancePlanning');
  });

  it.each([
    ['expired evidence', input => { input.context.source.observedAt = 1000; input.preflights.source.observedAt = 1000; }],
    ['changed removal reason', input => { input.preflights.data[0].reason = 7; input.preflights.data[0].sourceSet = 1; }],
    ['changed capacity', input => { input.context.data.subjects[0].maxMembers = '2'; }],
    ['unavailable authority', input => { input.context.coverage = { ...coverage, status: 'unavailable' }; }],
    ['rebound organization', input => { input.scope.orgId = `0x${'7'.repeat(64)}`; input.context.source.orgId = input.scope.orgId; input.preflights.source.orgId = input.scope.orgId; }],
  ])('does not dispatch with %s after metadata upload', async (_name, change) => {
    const input = evidence(), request = proposal('election', input), fresh = evidence(1040);
    change(fresh);
    const execute = vi.fn(), refresh = vi.fn(async () => fresh);
    const service = new VotingService({ createWritable: vi.fn() }, { execute }, { addToIpfs: vi.fn(async () => ({ path: cid })) });
    await expect(service.createHybridProposal(voting, request, {
      beforeExecute: createGovernanceSubmissionGuard(request, input, refresh, () => 1040),
    })).rejects.toThrow('Review');
    expect(execute).not.toHaveBeenCalled(); expect(service.factory.createWritable).not.toHaveBeenCalled();
  });

  it('binds the final check to reviewed choices and freshness rather than mutable caller objects', async () => {
    const input = evidence(), request = proposal('election', input);
    const guard = createGovernanceSubmissionGuard(request, input, async () => evidence(1040), () => 1040);
    request.electionSelectedIncumbents[0].ban = true;
    request.electionCandidates[0].address = incumbent;
    request.batches[0][0].data = '0x';
    input.expectedFingerprint = 'changed'; input.scope.orgId = 'changed'; input.confirmedBans.push({});
    // The callback checks the retained original intent/choices, never a caller's edits during upload.
    await expect(guard()).resolves.toBeUndefined();
    const stale = evidence();
    const strictGuard = createGovernanceSubmissionGuard(proposal('election', stale), stale,
      async () => ({ ...evidence(), freshness: { ...evidence().freshness, maxAgeSeconds: 1000 } }), () => 1040);
    await expect(strictGuard()).rejects.toThrow('Review');
  });

  it('preserves the host pre-send callback and revalidates authority after it', async () => {
    let now = 1000;
    const input = evidence(), request = proposal('election', input), order = [];
    const beforeExecute = createGovernanceSubmissionGuard(request, input,
      async () => { order.push('authority'); return evidence(1000); }, () => now);
    const beforeSend = vi.fn(async () => { order.push('host'); now = 1040; });
    const execute = vi.fn(async (_contract, _method, _args, options) => { await options.beforeSend(); return { success: true }; });
    const service = new VotingService({ createWritable: (address, abi) => ({ address, interface: new utils.Interface(abi) }) }, { execute },
      { addToIpfs: vi.fn(async () => ({ path: cid })) });
    await expect(service.createHybridProposal(voting, request, { beforeExecute, beforeSend })).rejects.toThrow('Review');
    expect(beforeSend).toHaveBeenCalledOnce(); expect(order).toEqual(['authority', 'host', 'authority']);
  });

  it.each(['election', 'removeRoleMembers'])('threads the real %s runtime guard through metadata upload and retains a refused draft', async type => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now * 1000);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const input = evidence(), request = proposal(type, input), gate = deferred();
    const execute = vi.fn(async () => ({ success: true }));
    const service = new VotingService({ createWritable: (address, abi) => ({ address, interface: new utils.Interface(abi) }) }, { execute },
      { addToIpfs: vi.fn(async () => { await gate.promise; return { path: cid }; }) });
    const refresh = vi.fn(async () => evidence(1000));
    const context = { proposal: { ...request, time: 1, isRestricted: false },
      orgChainId: 100, roleNames: { '7': 'Stewards' }, projectNames: {}, nativeCurrencySymbol: 'xDAI',
      setLoadingSubmit: vi.fn(), resetForm: vi.fn(), toast: vi.fn(), buildActionSummaries: () => [],
      ...Object.fromEntries(['BasicFields', 'TransferProposal', 'ElectionProposal', 'NormalProposal', 'SetterProposal', 'CreateRoleProposal', 'RoleRemovalProposal'].map(name => [`validate${name}`, () => true])),
      onSubmit: vi.fn(payload => service.createHybridProposal(voting, { ...payload, durationMinutes: payload.time }, { beforeExecute: payload.beforeExecute })),
    };
    const pending = submitProposalRuntime(context, null, { membershipAuthorityAddress: authority }, { accessV2: {
      enabled: true, authority, roles: [{ subjectId: '7', name: 'Stewards' }], refreshGovernancePlanning: refresh,
      [type === 'election' ? 'electionPlanning' : 'removalPlanning']: input,
    } });
    await vi.waitFor(() => expect(context.onSubmit).toHaveBeenCalledOnce());
    expect(refresh).toHaveBeenCalledOnce(); now = 1040; gate.resolve();
    await expect(pending).resolves.toBe(false);
    expect(refresh).toHaveBeenCalledTimes(2); expect(execute).not.toHaveBeenCalled();
    expect(context.resetForm).not.toHaveBeenCalled();
    expect(context.toast).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', description: expect.stringContaining('Review') }));
  });

  it.each(['wallet', 'passkey'])('checks fresh authority again after awaited %s setup before any signer or transport dispatch', async mode => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    let now = 1000;
    const input = evidence(), request = proposal('election', input), gate = deferred();
    const refresh = vi.fn(async () => evidence(1000));
    const send = vi.fn(), bundler = { sendUserOperation: vi.fn() };
    const factory = { createWritable: (address, abi) => {
      const contract = { address, interface: new utils.Interface(abi), estimateGas: {} };
      contract.connect = () => contract;
      contract.interface.fragments.filter(fragment => fragment.type === 'function').forEach(fragment => {
        contract[fragment.name] = send;
        contract.estimateGas[fragment.name] = vi.fn(async () => BigNumber.from(21000));
      });
      return contract;
    } };
    let setupStarted;
    if (mode === 'wallet') {
      setupStarted = vi.fn(async () => { await gate.promise; return null; });
    }
    const manager = mode === 'wallet'
      ? new TransactionManager({}, { ensureChain: setupStarted })
      : new SmartAccountTransactionManager({ accountAddress: candidate, rawCredentialId: 'offline-credential',
        publicClient: {}, bundlerClient: bundler, chainId: 100, paymasterAddress: null });
    if (mode === 'passkey') {
      setupStarted = vi.fn(async callData => {
        await gate.promise;
        return { sender: candidate, nonce: 0n, callData, callGasLimit: 500000n, verificationGasLimit: 500000n,
          preVerificationGas: 50000n, maxFeePerGas: 7n, maxPriorityFeePerGas: 1n, signature: '0x' };
      });
      manager._buildUserOpWithFallback = setupStarted;
    }
    const service = new VotingService(factory, manager, { addToIpfs: vi.fn(async () => ({ path: cid })) });
    const pending = service.createHybridProposal(voting, request, {
      beforeExecute: createGovernanceSubmissionGuard(request, input, refresh, () => now),
    });
    await vi.waitFor(() => expect(setupStarted).toHaveBeenCalledOnce());
    expect(refresh).toHaveBeenCalledOnce(); now = 1040; gate.resolve();
    const result = await pending;
    expect(result.success).toBe(false);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(send).not.toHaveBeenCalled(); expect(signing.passkey).not.toHaveBeenCalled();
    expect(bundler.sendUserOperation).not.toHaveBeenCalled();
    expect(manager.getPendingSubmission?.()).toBeFalsy();
  });
});
