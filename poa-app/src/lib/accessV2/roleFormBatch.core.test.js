import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { constants, utils } from 'ethers';
import { getAbi } from '@poa-box/core/contracts';
import { roleFormRequest } from '@/lib/accessV2/roleFormRequest';
import { createRoleOperationHost } from '@/lib/accessV2/roleOperationHost';
import { operationFixture, prepareFixture, contracts, account, otherExecutor, roleId, groupId } from '@/lib/accessV2/roleObservationFixtures';
const iface = new utils.Interface(getAbi('MembershipAuthority'));
const form = () => ({ name: 'Reviewers', sponsorship: { enabled: false }, creationMode: 'compound', limitSeats: true, maxMembers: 2,
  groupIds: [groupId], perms: { DD_VOTE: true, TM_PERMS: 6 }, projectPerms: [{ projectId: '900719925474099312345', mask: 0, inheritGlobal: false }],
  holders: [{ address: account, sticky: true }, { address: otherExecutor }], canCreateTasks: true, bindingVote: true, bindingClassIdx: 1 });
beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('OFFLINE_NETWORK_FORBIDDEN'); })));
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe('role form -> installed packed shared operation -> exact batch', () => {
  it('plans nested permissions, explicit zero project override, grant/offer, task and actual selected class', async () => {
    const f = await operationFixture({ accountAcceptance: address => address.toLowerCase() === account }, form());
    const built = await prepareFixture(f.input, form()); expect(built.submittable.ok).toBe(true);
    const calls = built.batch.filter(call => call.target.toLowerCase() === contracts.membershipAuthority).map(call => iface.parseTransaction({ data: call.data }));
    expect(calls.map(call => call.name)).toEqual(['createRole', 'addRoleToGroup', 'setPerm', 'setPerm', 'setPerm', 'grant', 'offer']);
    expect(calls[4].args.ctx).toBe(utils.hexZeroPad(utils.hexlify(900719925474099312346n), 32));
    expect(calls[4].args.word.toString()).toBe((1n << 255n).toString()); expect(calls[5].args[2]).toBe(false); expect(calls[6].args[2]).toBe(true);
    const task = new utils.Interface(getAbi('TaskManagerNew')).parseTransaction({ data: built.batch.find(call => call.target.toLowerCase() === contracts.taskManager).data });
    expect(task.name).toBe('setConfig');
    const hybrid = new utils.Interface(getAbi('HybridVotingNew')).parseTransaction({ data: built.batch.find(call => call.target.toLowerCase() === contracts.hybridVoting).data });
    expect(hybrid.args[0]).toBe(1); expect(hybrid.args[1].toString()).toBe(built.predictedSubjectId);
  });
  it.each([[0, 'Members (one vote each)'], [1, 'Contributors (weighted by Shares)']])('describes actual packed voting class %s from observed strategy', async (bindingClassIdx, label) => {
    const desired = { ...form(), bindingClassIdx }, f = await operationFixture({}, desired);
    const built = await prepareFixture(f.input, desired);
    expect(built.submittable.ok).toBe(true);
    expect(built.summaries.join(' ')).toContain(label);
  });
  it.each(['stale', 'partial', 'module', 'executor', 'competing', 'unproven'])('refuses %s evidence with no partial executable batch', async kind => {
    const f = await operationFixture({}, form());
    if (kind === 'stale') f.input.now = () => 1031;
    if (kind === 'partial') f.input.snapshot.coverage.status = 'incomplete';
    if (kind === 'module') f.input.scope.contracts.hybridVoting = otherExecutor;
    if (kind === 'executor') f.input.scope.contracts.executor = otherExecutor;
    if (kind === 'competing' || kind === 'unproven') f.indexedResponse.proposals.push({ id: `${contracts.hybridVoting}-7`, proposalId: '7',
      status: 'Active', createdAtBlock: '100', numOptions: 2, hybridVoting: { id: contracts.hybridVoting, organization: { id: f.input.scope.orgId } } });
    const built = await prepareFixture(f.input, form()); expect(built.submittable.ok).toBe(false); expect(built.batch).toEqual([]);
    expect(['unknown', 'blocked']).toContain(built.plan.status);
  });
  it('rejects a reviewed compound request after allocations change instead of retargeting permissions', async () => {
    const desired = form(), f = await operationFixture({}, desired), host = createRoleOperationHost(f.input.readFactory);
    const review = await host.review(f.input); expect(review.status).toBe('ready');
    f.input.snapshot.data.subjects.push({ ...f.input.snapshot.data.subjects[0], subjectId: '123' });
    const prepared = await host.prepare({ ...f.input, review: review.data, currentRequest: roleFormRequest(desired) });
    expect(prepared.status).not.toBe('ready'); expect(prepared).not.toHaveProperty('data.batch');
  });
  it('includes configured email rules only for explicit email consent and preserves raw budget units', async () => {
    const desired = { ...form(), sponsorship: { enabled: true, capNative: '0.25', epochDays: 30, supportPasskeys: true, includeConfiguredEmailRules: true } };
    const f = await operationFixture({}, desired), built = await prepareFixture(f.input, desired);
    expect(built.submittable.ok).toBe(true);
    const paymaster = new utils.Interface(getAbi('PaymasterHub'));
    const calls = built.batch.filter(call => call.target.toLowerCase() === contracts.paymaster).map(call => paymaster.parseTransaction({ data: call.data }));
    expect(calls.find(call => call.name === 'setRulesBatch').args[1].map(value => value.toLowerCase())).toContain(contracts.email);
    expect(calls.find(call => call.name === 'setBudget').args[2].toString()).toBe('250000000000000000');
  });
  it('prepares passkey membership sponsorship without an email module or email rules by default', async () => {
    const desired = { ...form(), sponsorship: { enabled: true } };
    const f = await operationFixture({}, desired);
    delete f.input.scope.contracts.email;
    const built = await prepareFixture(f.input, desired);
    expect(built.submittable.ok).toBe(true);
    const paymaster = new utils.Interface(getAbi('PaymasterHub'));
    const calls = built.batch.filter(call => call.target.toLowerCase() === contracts.paymaster).map(call => paymaster.parseTransaction({ data: call.data }));
    expect(calls.filter(call => call.name === 'setBudget')).toHaveLength(1);
    expect(calls.find(call => call.name === 'setRulesBatch').args[1].every(target => target.toLowerCase() === contracts.membershipAuthority)).toBe(true);
    expect(f.calls.filter(call => call.module === 'email')).toEqual([]);
  });
  it.each(['configured rules', 'email additions'])('requires explicit missing-budget consent for %s before preparation', async mode => {
    const desired = { ...form(), sponsorship: { enabled: true, includeConfiguredEmailRules: mode === 'configured rules' },
      ...(mode === 'email additions' ? { join: { domains: ['example.org'] } } : {}) };
    const f = await operationFixture({ epochLen: 0, ...(mode === 'email additions' ? { emailRoot: constants.HashZero } : {}) }, desired);
    const blocked = await prepareFixture(f.input, desired);
    expect(blocked.submittable.ok).toBe(false); expect(blocked.batch).toEqual([]);
    expect(blocked.plan.codes).toContain('CLAIM_BUDGET_INITIALIZATION_REQUIRED');
    const selected = { ...desired, sponsorship: { ...desired.sponsorship, initializeClaimBudget: true } };
    const built = await prepareFixture(f.input, selected);
    expect(built.submittable.ok).toBe(true);
    const paymaster = new utils.Interface(getAbi('PaymasterHub'));
    const budgets = built.batch.filter(call => call.target.toLowerCase() === contracts.paymaster).map(call => paymaster.parseTransaction({ data: call.data }))
      .filter(call => call.name === 'setBudget');
    expect(budgets).toHaveLength(2);
    expect(built.warnings.join(' ')).toContain('shared email joining budget');
  });
  it('plans group composition and manager without hidden role-only fields', async () => {
    const desired = { ...form(), kind: 'group', name: 'Everyone', memberRoleIds: [roleId],
      manager: { enabled: true, managerSubjectId: groupId, canGrant: true, canRemove: true, delaySecs: 86400 } };
    const f = await operationFixture({}, desired), built = await prepareFixture(f.input, desired);
    expect(built.submittable.ok).toBe(true);
    const calls = built.batch.filter(call => call.target.toLowerCase() === contracts.membershipAuthority).map(call => iface.parseTransaction({ data: call.data }));
    expect(calls[0].name).toBe('createGroup'); expect(calls.some(call => ['grant', 'offer'].includes(call.name))).toBe(false);
    expect(calls.find(call => call.name === 'setManagerConfig').args[2]).toBe(3);
  });
});
