import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { utils, constants } from 'ethers';
import { composeSubjectId } from '@poa-box/core/authority/ids';
import { buildGovernanceProposal } from '@poa-box/core/tx/governance';
import { createRoleHost, runRoleCommand } from '../../../../scripts/examples/role-workflow.mjs';
import { fixture, account, contracts, orgId, interfaces, selectedResponse, authorityResponse } from '@/lib/accessV2/roleObservationFixtures';
import { DELEGATED_SUBMISSION_LEASE } from '@/services/web3/core/managerSubmissionScope';
import { TransactionManager } from '@/services/web3/core/TransactionManager';
import { fakeBrowserLocks, recoveryTestStorage } from '@/services/web3/core/submissionTestHelpers';
import { roleContinuationScope, roleRecoveryIdentity } from '@/lib/accessV2/roleContinuationDraft';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('OFFLINE_NETWORK_FORBIDDEN'); }));
  vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function host(jsonStorage, { lostAcknowledgementAt, fromBlock = 123n } = {}) {
  const options = { subjects: [] }, f = fixture(options), rows = [], txs = {}, receipts = {};
  f.input.snapshot.data.groupEdges = [];
  const proposals = [], blockHash = utils.id('proposal block'), execHash = utils.id('execution block');
  let serialized = '[]', lostReceipt = true, sequence = 7, latestBatch;
  const store = {
    read: () => jsonStorage ? JSON.parse(serialized) : structuredClone(rows),
    save: row => { const saved = store.read(), index = saved.findIndex(item => item.id === row.id);
      if (index < 0) saved.push(row); else saved[index] = row;
      serialized = JSON.stringify(saved); rows.splice(0, rows.length, ...structuredClone(saved)); return structuredClone(row); },
  };
  f.provider.getTransaction = async hash => txs[hash]; f.provider.getTransactionReceipt = async hash => receipts[hash];
  f.provider.getBlock = async number => ['0x64', '100', 100].includes(number) ? { number: 100, hash: blockHash, timestamp: 900 }
    : ['0x6e', '110', 110].includes(number) ? { number: 110, hash: execHash, timestamp: 950 } : { ...f.indexedResponse._meta.block };
  const query = async (document, variables) => selectedResponse(document,
    authorityResponse({ ...f.indexedResponse, proposals: proposals.filter(row => row.id === variables.id) }, f.input.snapshot.data, variables));
  const publicClient = { getChainId: async () => 100, getBlockNumber: async () => fromBlock,
    getTransaction: async ({ hash }) => txs[hash], getTransactionReceipt: async ({ hash }) => receipts[hash],
    getBlock: async ({ blockNumber }) => ({ number: blockNumber, hash: blockNumber === 100n ? blockHash : execHash }),
  };
  const contract = { address: contracts.hybridVoting, interface: interfaces.hybridVoting,
    estimateGas: { createProposal: async () => utils.parseUnits('1', 5) },
    createProposal: vi.fn(async (...args) => {
      const id = String(sequence++), hash = utils.id(`creation-${id}`);
      const data = interfaces.hybridVoting.encodeFunctionData('createProposal', args.slice(0, -1));
      txs[hash] = { hash, to: contracts.hybridVoting, from: account, chainId: 100, nonce: 1,
        value: '0', data, blockNumber: 100, blockHash };
      const parsed = interfaces.hybridVoting.parseTransaction({ data }).args;
      const event = interfaces.hybridVoting.encodeEventLog('NewProposal', [id, parsed.title, parsed.descriptionHash, 2, 1600, 900]);
      receipts[hash] = { status: 1, transactionHash: hash, blockNumber: 100, blockHash,
        logs: [{ ...event, address: contracts.hybridVoting, transactionHash: hash, blockNumber: 100, blockHash, removed: false }] };
      proposals.push({ id: `${contracts.hybridVoting}-${id}`, proposalId: id, transactionHash: hash, createdAtBlock: '100',
        wasExecuted: false, executionFailed: false, isValid: null, winningOption: null, status: 'Active', batchExecutions: [],
        hybridVoting: { id: contracts.hybridVoting, organization: { id: orgId } } });
      if (proposals.length === lostAcknowledgementAt) throw new Error('Lost wallet acknowledgement');
      return { hash, wait: async () => { if (lostReceipt) throw new Error('Lost receipt response'); return receipts[hash]; } };
    }),
  };
  const manager = new TransactionManager({ getAddress: async () => account, getChainId: async () => 100, getTransactionCount: async () => 1 },
    { accountAddress: account, chainId: 100, publicClient, submissionStorage: recoveryTestStorage(), submissionLocks: fakeBrowserLocks() });
  const scope = roleContinuationScope({ chainId: 100, orgId, account, authority: contracts.membershipAuthority,
    executor: contracts.executor, hybridVoting: contracts.hybridVoting, endpoint: 'https://index.invalid' });
  const ports = { store, identity: (raw, intent) => roleRecoveryIdentity(raw, scope, intent),
    observe: async () => ({ scope: { ...f.input.scope, account }, authoritySnapshot: await f.readAuthority(query),
      sources: { indexed: { endpoint: scope.endpoint, query: async (source, document, variables) => ({ source, data: await query(document, variables), issues: [] }) },
        rpc: { endpoint: 'https://rpc.invalid', provider: f.provider }, now: () => 1001 } }),
    submission: { session: run => manager.submissionController.session(run), withLease: (run, lease) => manager.submissionController.withLease(run, lease, { settlement: true }),
      pending: () => manager.getPendingSubmission(), recover: (saved, options) => manager.reconcileSubmission(saved, options) },
    propose: async (operation, proposal, lifecycle) => {
      latestBatch = operation.data.batch;
      const intent = buildGovernanceProposal({ votingAddress: contracts.hybridVoting, votingAbiName: 'HybridVotingNew',
        title: proposal.title, descriptionHash: constants.HashZero, durationMinutes: 60, numOptions: 2,
        batches: [latestBatch, []], subjectIds: [] });
      await lifecycle.beforeExecute();
      return manager.execute(contract, intent.method, intent.args, { ...lifecycle, [DELEGATED_SUBMISSION_LEASE]: lifecycle.lease, beforeSend: lifecycle.beforeExecute });
    },
  };
  const executeCreation = () => {
    const proposal = proposals[0], hash = utils.id('execute creation'), subjectId = composeSubjectId(contracts.membershipAuthority, '19');
    const creation = interfaces.membershipAuthority.parseTransaction({ data: latestBatch[0].calldata });
    options.subjects.push({ subjectId, name: 'Portable role', kind: 'Role', maxMembers: '0', memberCount: '0' });
    txs[hash] = { hash, to: contracts.hybridVoting, from: account, chainId: 100, blockNumber: 110, blockHash: execHash,
      value: '0', data: interfaces.hybridVoting.encodeFunctionData('announceWinner', [proposal.proposalId]) };
    const log = (module, name, args) => ({ ...interfaces[module].encodeEventLog(name, args), address: contracts[module],
      transactionHash: hash, blockNumber: 110, blockHash: execHash, removed: false });
    receipts[hash] = { status: 1, transactionHash: hash, blockNumber: 110, blockHash: execHash, logs: [
      log('membershipAuthority', 'SubjectCreated', [subjectId, 0, 'Portable role', creation.args[1], 0]),
      log('executor', 'CallExecuted', [proposal.proposalId, 0, contracts.membershipAuthority, 0]),
      log('executor', 'BatchExecuted', [proposal.proposalId, 1]), log('hybridVoting', 'ProposalExecuted', [proposal.proposalId, 0, 1]),
    ] };
    Object.assign(proposal, { wasExecuted: true, isValid: true, winningOption: '0', status: 'Executed',
      batchExecutions: [{ proposalId: proposal.proposalId, callCount: '1', transactionHash: hash, executedAtBlock: '110', executor: { id: contracts.executor } }] });
    lostReceipt = false;
    return subjectId;
  };
  return { ports, manager, contract, store, executeCreation, batch: () => latestBatch };
}

it.each([false, true])('one production workflow serves a DOM-free host, reload and separate configuration (JSON store=%s)', async jsonStore => {
  expect(typeof window).toBe('undefined'); expect(typeof document).toBe('undefined');
  const f = await host(jsonStore);
  const input = { request: { mode: 'create', role: { kind: 'Role', name: 'Portable role', maxMembers: '0', defaultAllow: true } },
    draft: { title: 'Original host-specific form', originalSettings: { open: true } }, draftKey: 'portable' };
  const workflow = createRoleHost(f.ports);
  const review = await workflow.review(input); expect(review.status).toBe('ready'); expect(review.data.requiresConfiguration).toBe(true);
  const result = await workflow.submit(input, { title: 'Portable role' });
  expect(result.success).toBe(false); expect(f.contract.createProposal).toHaveBeenCalledOnce();
  const saved = f.store.read()[0]; expect(saved.creation.submission.recovery.callKey).toBe(saved.creation.expectedIntentKey);
  workflow.dispose();
  await f.manager.reconcileSubmission(); expect(f.manager.getPendingSubmission()).toBeNull();
  const actualId = f.executeCreation();
  const reopened = createRoleHost(f.ports), recovered = await reopened.recover(saved.id);
  expect(recovered.proof).toMatchObject({ state: 'created', subjectId: actualId });
  expect(recovered.originalForm).toEqual(input.draft);
  const continuation = { ...input, continuationId: saved.id };
  await expect(reopened.submit(continuation, { title: 'Configure' })).rejects.toThrow('Review the current');
  const configurationReview = await reopened.review(continuation);
  expect(configurationReview.data.mode).toBe('existing');
  expect((await reopened.submit(continuation, { title: 'Configure' })).success).toBe(true);
  expect(f.contract.createProposal).toHaveBeenCalledTimes(2);
  const calls = f.batch().map(call => interfaces.membershipAuthority.parseTransaction({ data: call.calldata }));
  expect(calls.every(call => call.name !== 'createRole')).toBe(true);
  expect(calls.find(call => call.name === 'setSubjectDefault').args[0].toString()).toBe(actualId);
});

it('requires explicit approval in the runnable independent consumer', async () => {
  const f = await host(true), approve = vi.fn(async () => false);
  await expect(runRoleCommand({ ...f.ports, approve }, { action: 'submit', input: {
    request: { mode: 'create', role: { kind: 'Role', name: 'Portable role', maxMembers: '0' } }, draft: {} }, proposal: {} })).rejects.toThrow('Explicit approval');
  expect(approve).toHaveBeenCalledOnce(); expect(f.contract.createProposal).not.toHaveBeenCalled();
});

it.each(['creation', 'configuration'])('recovers detached %s beyond the bounded scan using only its own transaction candidate', async stage => {
  const f = await host(true, { lostAcknowledgementAt: stage === 'creation' ? 1 : 2, fromBlock: 40n });
  const input = { request: { mode: 'create', role: { kind: 'Role', name: 'Portable role', maxMembers: '0', defaultAllow: true } },
    draft: { originalSettings: { open: true } }, draftKey: 'detached-candidate' };
  const workflow = createRoleHost(f.ports);
  await workflow.review(input); await workflow.submit(input, { title: 'Portable role' });
  const id = f.store.read()[0].id;
  if (stage === 'configuration') {
    await f.manager.reconcileSubmission(); f.executeCreation(); await workflow.recover(id);
    const next = { ...input, continuationId: id };
    await workflow.review(next); await workflow.submit(next, { title: 'Configure' });
  }
  const candidate = utils.id(`creation-${stage === 'creation' ? 7 : 8}`);
  const saved = f.store.read()[0][stage].submission;
  expect(saved.txHash).toBeUndefined(); expect(saved.recovery.fromBlock).toBe('40');
  expect((await f.manager.reconcileSubmission(saved, { candidateTxHash: candidate })).outcome.status).toBe('succeeded');
  expect(f.manager.getPendingSubmission()).toBeNull();
  if (stage === 'creation') f.executeCreation();
  workflow.dispose(); const reopened = createRoleHost(f.ports);
  await expect(reopened.recover(id)).rejects.toThrow('still unconfirmed');
  const ownOption = stage === 'creation' ? 'candidateTxHash' : 'configurationTxHash';
  const otherOption = stage === 'creation' ? 'configurationTxHash' : 'candidateTxHash';
  await expect(reopened.recover(id, { [otherOption]: candidate })).rejects.toThrow('still unconfirmed');
  await expect(reopened.recover(id, { [ownOption]: utils.id('unrelated candidate') })).rejects.toThrow('still unconfirmed');
  const recovered = await reopened.recover(id, { [ownOption]: candidate });
  expect(recovered.proof.state).toBe('created');
  expect(recovered[stage].transactionHash).toBe(candidate);
  if (stage === 'configuration') expect(recovered.configuration.status).toBe('pending');
  expect(recovered.originalForm).toEqual(input.draft);
  expect(f.contract.createProposal).toHaveBeenCalledTimes(stage === 'creation' ? 1 : 2);
});


it('two workflows serialize the same draft under one account lock, including after a journal clear', async () => {
  const f = await host(true), a = createRoleHost(f.ports), b = createRoleHost(f.ports);
  const input = { request: { mode: 'create', role: { kind: 'Role', name: 'Portable role', maxMembers: '0' } }, draft: {}, draftKey: 'same-draft' };
  await Promise.all([a.review(input), b.review(input)]);
  await Promise.allSettled([a.submit(input, { title: 'One draft' }), b.submit(input, { title: 'One draft' })]);
  expect(f.store.read()).toHaveLength(1); expect(f.contract.createProposal).toHaveBeenCalledOnce();
  await f.manager.reconcileSubmission();
  await b.review(input);
  await expect(b.submit(input, { title: 'One draft' })).rejects.toThrow('already has a saved vote');
  expect(f.store.read()).toHaveLength(1); expect(f.contract.createProposal).toHaveBeenCalledOnce();
});
