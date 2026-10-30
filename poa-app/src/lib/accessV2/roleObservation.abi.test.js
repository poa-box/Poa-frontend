import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { constants, utils } from 'ethers';
import { STORAGE_KEYS, encodeLensCall } from '@poa-box/core/task-lens';
import { paymasterSubjectKey, SUBJECT_TYPE } from '@poa-box/core/sponsorship/codec';
import { roleFormRequest } from '@/lib/accessV2/roleFormRequest';
import { createRoleOperationHost } from '@/lib/accessV2/roleOperationHost';
import { operationFixture as fixture, operationHistoricalFixture as historicalFixture, observe,
  contracts, otherExecutor, orgId, hash, root, roleId, source, roleForm, selectedResponse, interfaces } from '@/lib/accessV2/roleObservationFixtures';

const data = result => { expect(result.status, JSON.stringify(result.codes)).toBe('ready'); return result.data; };
const unavailable = result => { expect(result.status).not.toBe('ready'); expect(result).not.toHaveProperty('data.batch'); return result.observations; };
const review = input => createRoleOperationHost(input.readFactory).review(input);
beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('OFFLINE_NETWORK_FORBIDDEN'); })));
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe('actual installed public role operation with offline ABI transports', () => {
  it('reads blank staged capabilities from the real module without subject, account, registration or compound history reads', async () => {
    const f = await fixture({}, { sponsorship: { enabled: false } });
    f.input.request = roleFormRequest({ sponsorship: { enabled: false } });
    const observed = data(await observe({ ...f.input, purpose: 'capabilities' }));
    expect(observed).toMatchObject({ purpose: 'capabilities', mode: 'create', context: { data: {
      sponsorship: { operatorAuthorized: { state: 'known', value: true }, claimBudgetExists: { state: 'known', value: true } },
      email: { enabled: { state: 'known', value: true }, authorityMatches: { state: 'known', value: true } },
    } } });
    for (const key of ['subjectId', 'predictedSubjectId', 'allocations', 'proposals']) expect(observed[key]).toBeUndefined();
    expect(f.calls.some(call => ['getSubject', 'userSubjects', 'groupMemberRoles', 'memberCount', 'getStatus', 'isEmailRegistered'].includes(call.method))).toBe(false);
    expect(f.query.mock.calls.some(([document]) => /FetchHybridProposalsPage|RecoverSubjectCreation/.test(document))).toBe(false);
  });
  it('retains independently sourced indexed authority/history and actual module facts at one canonical block', async () => {
    const f = await fixture(), observed = data(await observe(f.input)), calls = f.calls;
    expect(observed.context.data).toMatchObject({ taskManager: { executorAuthorized: { state: 'known', value: true } },
      registry: { executorAuthorized: { state: 'known', value: true }, currentAdminSubject: { value: roleId } },
      sponsorship: { operatorAuthorized: { state: 'known', value: true }, claimBudgetExists: { value: true } },
      email: { enabled: { value: true }, authorityMatches: { value: true }, minterAuthorized: { value: true }, currentRoot: { value: root } } });
    expect(observed.context.source.indexed).toBe(false); expect(observed.authoritySnapshot.source.indexed).toBe(true);
    expect(observed.allocations.source.indexed).toBe(true); expect(observed.proposals.coverage.status).toBe('complete');
    for (const snapshot of [observed.context, observed.allocations, observed.proposals]) expect(snapshot.source.block).toEqual(source.block);
    expect(observed.activeAllowlist.data).toMatchObject({ root: { state: 'known', value: root }, cid: { state: 'known', value: hash } });
    expect(observed.context.data.hybrid.classes.map(row => row.classIndex)).toEqual([0, 1]);
    expect(new Set(calls.map(call => call.module))).toEqual(new Set(Object.keys(contracts)));
    expect(calls.every(call => call.blockTag === '0x7b')).toBe(true);
    const lens = calls.find(call => call.module === 'taskManager'); expect(lens.method).toBe('getLensData');
    expect(lens.args[0]).toBe(STORAGE_KEYS.EXECUTOR); expect(lens.args[1]).toBe('0x'); expect(lens.transaction.data).toBe(encodeLensCall(STORAGE_KEYS.EXECUTOR));
    expect(calls.find(call => call.method === 'getOrgMetadataAdminHat').args[0]).toBe(orgId);
    const admin = calls.find(call => call.method === 'setOrgMetadataAdminHat'), sponsor = calls.find(call => call.method === 'setBudget');
    expect(admin.args.map(String)).toEqual([orgId, roleId]); expect(sponsor.args.map(String)).toEqual([orgId, constants.HashZero, '1', '3600']);
    for (const probe of [admin, sponsor]) expect(probe.transaction.from.toLowerCase()).toBe(contracts.executor);
    expect(calls.find(call => call.method === 'getBudget').args[1]).toBe(paymasterSubjectKey(SUBJECT_TYPE.CLAIM, contracts.email));
    expect(f.input.snapshot.source.block).toEqual({ number: source.block.number, hash: source.block.hash });
  });
  it('keeps the real registry getter available without requesting a task capability', async () => {
    const desired = { name: 'Editors', editOrgDetails: true, sponsorship: { enabled: false } };
    const f = await fixture({ withoutTask: true }, desired); expect(data(await observe(f.input)).context.data.registry.currentAdminSubject.value).toBe(roleId);
  });
  it.each([0, 3600])('uses the actual shared claim budget epoch %s, including a configured zero cap', async epochLen => {
    const f = await fixture({ epochLen });
    expect(data(await observe(f.input)).context.data.sponsorship.claimBudgetExists.value).toBe(epochLen !== 0);
  });
  it.each([false, true])('proves historical createsSubject=%s using exact indexed rows and real calldata/events', async createsSubject => {
    const f = await historicalFixture(createsSubject), original = structuredClone(f.input.snapshot.source), observed = data(await observe(f.input));
    expect(observed.proposals.data[0].createsSubject).toBe(createsSubject);
    expect(f.provider.getTransaction).toHaveBeenCalledWith(f.transactionHash); expect(f.provider.getTransactionReceipt).toHaveBeenCalledWith(f.transactionHash);
    expect(observed.proposals.source.block).toEqual(source.block); expect(f.input.snapshot.source).toEqual(original);
    const result = await review(f.input);
    if (createsSubject) { unavailable(result); expect(result.codes).toContain('COMPETING_SUBJECT_CREATION'); }
    else expect(result.status).toBe('ready');
  });
  it.each(['missing timestamp', 'mismatched timestamp', 'authority', 'chain', 'transaction hash', 'calldata', 'event', 'proposal id', 'creation block', 'indirect target'])(
    'preserves historical %s as unknown instead of fabricating createsSubject=false', async mode => {
      const f = await historicalFixture();
      if (mode === 'missing timestamp') delete f.exactResponse._meta.block.timestamp;
      if (mode === 'mismatched timestamp') f.exactResponse._meta.block.timestamp = 999;
      if (mode === 'authority') f.exactResponse.organization.membershipAuthority.id = otherExecutor;
      if (mode === 'chain') f.tx.chainId = 1;
      if (mode === 'transaction hash') f.tx.hash = root;
      if (mode === 'calldata') f.tx.data += '00';
      if (mode === 'event') f.receipt.logs[0].address = otherExecutor;
      if (mode === 'proposal id') f.exactResponse.proposals[0].proposalId = '10';
      if (mode === 'creation block') f.exactResponse.proposals[0].createdAtBlock = '99';
      if (mode === 'indirect target') f.tx.data = interfaces.hybridVoting.encodeFunctionData('createProposal',
        [f.title, root, 10, 2, [[[otherExecutor, 0, f.action]], []], []]);
      const observed = await observe(f.input), partial = unavailable(observed);
      expect(partial.proposals.data[0].createsSubject).toBeUndefined();
      expect((await review(f.input)).status).not.toBe('ready');
      if (mode.includes('timestamp')) expect(f.provider.getTransaction).not.toHaveBeenCalled();
    });
  it('processes all 205 indexed archive rows and all 18 unsettled exact proofs under aggregate concurrency three', async () => {
    const f = await historicalFixture(), rows = [], txs = new Map(), receipts = new Map();
    for (let id = 1; id <= 205; id++) {
      const transactionHash = `0x${id.toString(16).padStart(64, '0')}`;
      rows.push({ ...f.row, id: `${contracts.hybridVoting}-${id}`, proposalId: String(id), transactionHash,
        wasExecuted: id > 18, status: id > 18 ? 'Executed' : 'Ended' });
      txs.set(transactionHash, { ...f.tx, hash: transactionHash });
      const event = interfaces.hybridVoting.encodeEventLog(interfaces.hybridVoting.getEvent('NewProposal'), [id, f.title, root, 2, 1500, 900]);
      receipts.set(transactionHash, { ...f.receipt, transactionHash, logs: [{ ...f.receipt.logs[0], ...event, transactionHash }] });
    }
    rows.sort((a, b) => a.id.localeCompare(b.id));
    f.query.mockImplementation(async (document, variables) => selectedResponse(document, { ...f.indexedResponse,
      proposals: document.includes('RecoverSubjectCreation') ? rows.filter(row => row.id === variables.id)
        : rows.filter(row => row.id > variables.cursor).slice(0, variables.first) }));
    let active = 0, max = 0;
    const bounded = read => async (...args) => { active++; max = Math.max(max, active); await Promise.resolve();
      try { return await read(...args); } finally { active--; } };
    f.provider.getTransaction = vi.fn(bounded(async hash => txs.get(hash)));
    f.provider.getTransactionReceipt = vi.fn(bounded(async hash => receipts.get(hash)));
    f.provider.getBlock = vi.fn(bounded(f.provider.getBlock.getMockImplementation()));
    const observed = data(await observe(f.input));
    expect(observed.proposals.data).toHaveLength(205); expect(observed.proposals.coverage.status).toBe('complete');
    expect(observed.proposals.data.filter(row => !row.wasExecuted).every(row => row.createsSubject === false)).toBe(true);
    expect(f.query.mock.calls.filter(([doc]) => doc.includes('FetchHybridProposalsPage'))).toHaveLength(3);
    expect(f.query.mock.calls.filter(([doc]) => doc.includes('RecoverSubjectCreation'))).toHaveLength(18);
    expect(f.provider.getTransaction).toHaveBeenCalledTimes(18); expect(f.provider.getTransactionReceipt).toHaveBeenCalledTimes(18); expect(max).toBeLessThanOrEqual(3);
  });
  it.each(['initial', 'final', 'index'])('rejects mismatched or missing canonical metadata at %s', async stage => {
    for (const change of ['hash', 'timestamp', 'missing block']) {
      const f = await fixture(), changed = { number: 123, hash: change === 'hash' ? root : hash, timestamp: 999 };
      if (change === 'missing block') delete changed.timestamp;
      if (stage === 'initial') f.provider.getBlock.mockResolvedValueOnce(changed);
      if (stage === 'final') f.provider.getBlock.mockResolvedValueOnce({ number: 123, hash, timestamp: 1000 }).mockResolvedValueOnce(changed);
      if (stage === 'index') f.indexedResponse._meta.block = changed;
      unavailable(await observe(f.input));
    }
  });
  it.each([999, 1061, 1031])('rejects skewed/stale observation clock %s without executable data', async now => {
    const f = await fixture(); f.input.now = () => now; unavailable(await observe(f.input));
  });
  it.each(['missing timestamp', 'different timestamp', 'reorg'])('rejects proposal archive metadata %s', async mode => {
    const f = await fixture(); f.query.mockImplementation(async (document, variables) => {
      const response = selectedResponse(document, f.indexedResponse);
      if (document.includes('FetchHybridProposalsPage')) {
        if (mode === 'missing timestamp') delete response._meta.block.timestamp;
        if (mode === 'different timestamp') response._meta.block.timestamp = 999;
        if (mode === 'reorg') response._meta.block.hash = root;
      }
      return response;
    });
    unavailable(await observe(f.input));
  });
  it.each(['taskExecutor', 'hybridExecutor', 'emailExecutor', 'executorAuthority', 'minterAuthorized'])(
    'blocks the requested branch for known false %s without discarding that fact', async field => {
      const f = await fixture({ [field]: field === 'minterAuthorized' ? false : otherExecutor });
      const result = await review(f.input); unavailable(result);
      expect(result.status).toBe('blocked');
    });
  it.each(['0x', '0x1234'])('refuses malformed executor lens payload %s', async lensPayload => {
    const f = await fixture({ lensPayload }); unavailable(await observe(f.input));
    expect(f.calls.filter(call => call.module === 'taskManager').map(call => call.method)).toEqual(['getLensData']);
  });
  it.each([['registry.setOrgMetadataAdminHat', 'registry', 'executorAuthorized'], ['paymaster.setBudget', 'sponsorship', 'operatorAuthorized']])(
    'retains unavailable authorization as unknown for %s', async (failCall, module, field) => {
      const f = await fixture({ failCall }); const result = await observe(f.input), partial = unavailable(result);
      expect(result.status).toBe('unknown'); expect(partial.planning.data[module][field].state).toBe('unknown');
    });
  it.each(['taskManager.getLensData', 'registry.getOrgMetadataAdminHat', 'email.merkleRoot'])(
    'never substitutes a fallback for unavailable required read %s', async failCall => { const f = await fixture({ failCall }); unavailable(await observe(f.input)); });
  it.each(['authorityExecutor', 'authorityOrgId'])('refuses changed %s', async field => {
    const f = await fixture({ [field]: field === 'authorityOrgId' ? hash : otherExecutor }); unavailable(await review(f.input));
  });
  it('rejects wrong chain, incomplete authority and independently changed indexed module bindings', async () => {
    const wrong = await fixture({ chainId: 1 }); unavailable(await observe(wrong.input)); expect(wrong.calls).toEqual([]);
    const f = await fixture(); f.input.snapshot.coverage.status = 'incomplete'; unavailable(await observe(f.input));
    const changed = await fixture(); changed.indexedResponse.organization.taskManager.id = otherExecutor;
    unavailable(await observe(changed.input)); expect(changed.calls).toEqual([]);
  });
  it.each(['subjects', 'holders'])('returns explicit bounded-size unknown for oversized %s without truncating', async kind => {
    const f = await fixture(kind === 'subjects' ? { subjects: Array.from({ length: 257 }, (_, i) => ({
      subjectId: ((BigInt(contracts.membershipAuthority) << 64n) | BigInt(i + 1)).toString(), kind: 'Role', name: 'Members' })) } : {});
    if (kind === 'holders') f.input.request.role.holders = Array.from({ length: 51 }, (_, i) => ({ account: `0x${(i + 10).toString(16).padStart(40, '0')}`, sticky: false }));
    const result = await observe(f.input); unavailable(result); expect(result.status).toBe('unknown');
    expect(f.calls.some(call => call.method === 'getSubject')).toBe(false);
  });
  it('keeps staged create free of allocation prediction, history and deferred optional reads', async () => {
    const f = await fixture(); f.input.request.mode = 'create';
    const observed = data(await review(f.input)).evidence; expect(observed.allocations).toBeUndefined(); expect(observed.proposals).toBeUndefined();
    expect(new Set(f.calls.map(call => call.method))).toEqual(new Set(['executor', 'orgId']));
  });
});
