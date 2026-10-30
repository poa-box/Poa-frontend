import React, { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountedHostDocument } from '@/test/mountedHost';
import { fixture, contracts, account, orgId } from '@/lib/accessV2/roleObservationFixtures';
import { readRoleContinuations, roleContinuationScope, saveRoleContinuation } from '@/lib/accessV2/roleContinuationDraft';
import { RoleCreationService } from '@/services/web3/domain/RoleCreationService';
import { normalizeRoleForm } from '@/lib/accessV2/roleFormBatch';
import { createRoleOperationHost } from '@/lib/accessV2/roleOperationHost';

const live = vi.hoisted(() => ({}));
vi.mock('@/context/authState', () => ({ useAuth: () => live.auth }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => live.po }));
vi.mock('@/hooks/useWeb3Services', () => ({ useWeb3Services: () => live.services }));
vi.mock('@/context/ipfsContext', () => ({ useIPFScontext: () => live.ipfs }));
vi.mock('@/hooks/accessV2/useOrgAuthority', () => ({ useOrgAuthority: () => live.authority }));
vi.mock('@/hooks/accessV2/useAuthorityEvidence', () => ({ useAuthorityEvidence: () => live.authorityObservation }));
vi.mock('@/util/apolloClient', () => ({ useSubgraphClient: () => live.client }));
vi.mock('@/util/queries', () => ({ FETCH_INFRASTRUCTURE_ADDRESSES: 'infrastructure' }));
vi.mock('@/config/networks', () => ({ getNetworkByChainId: () => ({ nativeCurrency: { symbol: 'xDAI' }, rpcUrl: 'https://rpc.invalid' }) }));
vi.mock('@apollo/client', () => ({ useQuery: () => live.infrastructure }));
vi.mock('@/lib/accessV2/roleOperationQuery', () => ({ roleOperationQuery: (...args) => live.query(...args) }));

import { useRoleCreationContext } from '@/hooks/accessV2/useRoleCreationContext';

let root, container, f, latest, errors, commits, stored;

const savedScope = () => roleContinuationScope({ chainId: 100, orgId, authority: contracts.membershipAuthority,
  hybridVoting: contracts.hybridVoting, executor: contracts.executor, account, endpoint: live.po.subgraphUrl });
function seedStage(built, form) {
  const scope = savedScope(), rows = readRoleContinuations(window.localStorage, scope);
  const existing = rows.find(row => row.id === form.continuationId), id = existing?.id || crypto.randomUUID();
  const field = built.stage === 'create' ? 'creation' : 'configuration';
  const batch = built.batch.map(call => ({ target: call.target, value: call.value, calldata: call.data }));
  saveRoleContinuation(window.localStorage, scope, { ...(existing || { id, originalForm: normalizeRoleForm(form), creation: {} }),
    form, requiresConfiguration: built.requiresConfiguration, [field]: { status: 'submitting', attemptId: crypto.randomUUID(),
      ...(field === 'creation' ? { call: batch[0] } : { batch }) } });
  return { id, scope, field };
}
function seedOutcome({ id, scope, field }, result) {
  const row = readRoleContinuations(window.localStorage, scope).find(row => row.id === id);
  saveRoleContinuation(window.localStorage, scope, { ...row, [field]: { ...row[field], status: 'pending', transactionHash: result.receipt.transactionHash } });
}
const prepareForAssertion = async form => (await latest.submitRole({ form, proposal: {} })).role;

const form = { name: 'Builders', sponsorship: { enabled: false } };
const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(finish => { resolve = finish; }); return { promise, resolve }; };
const known = value => ({ state: 'known', value });
function capabilityResults() {
  live.po = { ...live.po, zkEmailInvitesAddress: contracts.email };
  const infrastructure = { poaManagerContracts: [{ orgRegistryProxy: contracts.registry, paymasterHubProxy: contracts.paymaster }] };
  live.infrastructure = { data: infrastructure, refetch: vi.fn(async () => ({ data: infrastructure })) };
  const data = { sponsorship: { operatorAuthorized: known(true), claimBudgetExists: known(false) },
    email: { enabled: known(true), authorityMatches: known(true), domainEnabled: known(true), emailEnabled: known(true) },
    registry: { currentAdminSubject: known('19') } };
  live.services.roleCreation.getRolePlanningEvidence.mockResolvedValue({ status: 'ready', data: { purpose: 'capabilities', context: { data } } });
  return data;
}
function Consumer({ enabled = true, auto = false, revision = 0 }) {
  const context = useRoleCreationContext({ enabled, authority: live.authority.address });
  useEffect(() => { latest = context; }, [context]);
  const reviewRoleConfiguration = context.reviewRoleConfiguration;
  const [status, setStatus] = useState('checking');
  useEffect(() => {
    if (!auto) return undefined;
    const controller = new AbortController();
    reviewRoleConfiguration(form, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) { commits.push(result); setStatus('ready'); }
    }, error => { errors.push(error); if (!controller.signal.aborted) setStatus('blocked'); });
    return () => controller.abort();
  }, [reviewRoleConfiguration, auto, revision]);
  return <span>{status}</span>;
}
const render = props => act(async () => { root.render(props === null ? null : <Consumer {...props} />); await flush(); });

async function delayedConfigurationContinuation(configurationState = 'rejected') {
  await render({});
  const original = { ...form, description: 'Keep the original role details', perms: { DD_VOTE: true } };
  const transactionHash = `0x${'ab'.repeat(32)}`, configurationHash = `0x${'cd'.repeat(32)}`;
  let ticket;
  await act(async () => {
    ticket = seedStage({ stage: 'create', requiresConfiguration: true,
      batch: [{ target: contracts.membershipAuthority, data: '0x1234', value: '0' }] }, original);
    seedOutcome(ticket, { success: true, receipt: { transactionHash, logs: [] } });
    const configurationTicket = seedStage({ stage: 'existing',
      batch: [{ target: contracts.membershipAuthority, data: '0x5678', value: '0' }] }, { ...original, continuationId: ticket.id });
    seedOutcome(configurationTicket, { success: true, receipt: { transactionHash: configurationHash, logs: [] } });
  });
  const proof = { state: 'created', subjectId: ((BigInt(contracts.membershipAuthority) << 64n) | 19n).toString(),
    proposalId: '7', creationTransactionHash: transactionHash };
  const configuration = { state: configurationState, proposalId: '8', creationTransactionHash: configurationHash };
  const creationGate = deferred(), configurationGate = deferred();
  // Explicit service-boundary fixtures; this suite does not establish protocol proof.
  const oldSnapshot = f.input.snapshot;
  const freshSnapshot = { ...structuredClone(oldSnapshot), source: { ...oldSnapshot.source,
    observedAt: 1041, block: { number: '131', hash: `0x${'ee'.repeat(32)}`, timestamp: '1040' } } };
  live.authorityObservation.refetch.mockResolvedValueOnce(oldSnapshot).mockResolvedValue(freshSnapshot);
  live.services.roleCreation.getRoleContinuation = vi.fn()
    .mockImplementationOnce(async () => { await creationGate.promise; return { status: 'ready', data: { creation: proof } }; })
    .mockImplementationOnce(async () => { await configurationGate.promise; return { status: 'ready', data: { creation: proof, configuration } }; });
  live.services.roleCreation.reviewRoleOperation.mockResolvedValue({ status: 'ready', data: { mode: 'existing',
    requiresConfiguration: false, preview: { callCount: 1, createsSubject: false }, currentEffects: [], deferredEffects: [] }, consequences: [] });
  const completeCreation = () => act(async () => { Date.now.mockReturnValue(1021000); creationGate.resolve(); await flush(); });
  const completeConfiguration = () => act(async () => { Date.now.mockReturnValue(1041000); configurationGate.resolve(); await flush(); });
  return { ticket, proof, original, retryForm: { ...original, continuationId: ticket.id }, oldSnapshot, freshSnapshot,
    completeCreation, completeConfiguration };
}

beforeEach(() => {
  f = fixture({ withoutTask: true }); errors = []; commits = [];
  // Use the real installed planner with a pinned clock; never call a live endpoint.
  vi.spyOn(Date, 'now').mockReturnValue(1001000);
  live.auth = { accountAddress: account, isAuthHydrated: true, isAuthenticated: true };
  live.po = { orgId, orgChainId: 100, subgraphUrl: f.input.snapshot.source.endpoint,
    treasuryContractAddress: contracts.executor, votingContractAddress: contracts.hybridVoting };
  live.authority = { enabled: true, address: contracts.membershipAuthority };
  live.authorityObservation = { refetch: vi.fn(async () => f.input.snapshot) };
  live.infrastructure = { data: { poaManagerContracts: [] }, refetch: vi.fn(async () => ({ data: { poaManagerContracts: [] } })) };
  // This suite proves React/host lifetimes with explicit domain results. Real packed
  // observation/proof/calldata parity remains in RoleForm.staged and roleObservation.abi.
  const review = { mode: 'create', requiresConfiguration: false, preview: { callCount: 1, createsSubject: true },
    currentEffects: [{ field: 'name' }], deferredEffects: [], evidence: { context: { data: {} } } };
  const operations = {
    reviewRoleOperation: vi.fn(async ({ sources, request }) => {
      await sources.rpc.provider.getBlock(123);
      if (Date.now() > 1030000) return { status: 'unknown', codes: ['STALE_HEAD'] };
      return { status: 'ready', data: { ...review, mode: request.mode, preview: { ...review.preview, createsSubject: request.mode !== 'existing' } }, consequences: [] };
    }),
    prepareRoleOperation: vi.fn(async ({ sources }) => {
      await sources.rpc.provider.getBlock(123);
      if (Date.now() > 1030000) return { status: 'unknown', codes: ['STALE_HEAD'] };
      return { status: 'ready', data: { mode: 'create', requiresConfiguration: false,
        batch: [{ target: contracts.membershipAuthority, value: '0', calldata: '0x1234' }] }, consequences: [] };
    }),
    revalidatePreparedRoleOperation: vi.fn(async () => ({ status: 'ready', data: {} })),
  };
  const host = createRoleOperationHost(f.input.readFactory, { operations });
  live.services = { roleCreation: { reviewRoleOperation: vi.fn(input => host.review(input)),
    prepareRoleOperation: vi.fn(input => host.prepare(input)), revalidatePreparedRoleOperation: vi.fn(input => host.revalidate(input)),
    getRolePlanningEvidence: vi.fn(async () => ({ status: 'ready', data: { context: { data: {} } } })),
  }, zkEmailInvites: {} };
  const service = live.services.roleCreation;
  service.roleOperationHost = Object.fromEntries(Object.entries({ read: 'getRolePlanningEvidence', review: 'reviewRoleOperation',
    prepare: 'prepareRoleOperation', revalidate: 'revalidatePreparedRoleOperation', status: 'getRoleContinuation' })
    .map(([name, method]) => [name, input => service[method](input)]));
  service.createWorkflow = RoleCreationService.prototype.createWorkflow;
  live.services.txManager = { submissionController: { session: async run => run({}), withLease: async run => run() }, getPendingSubmission: () => null };
  live.services.voting = { createHybridProposal: async () => ({ success: true }) };
  live.ipfs = { addToIpfs: vi.fn(), fetchFromIpfs: vi.fn() };
  live.query = f.query; live.client = {};
  const doc = mountedHostDocument(); container = doc.createElement('main');
  vi.stubGlobal('document', doc);
  stored = new Map();
  vi.stubGlobal('window', { document: doc, HTMLIFrameElement: class {}, addEventListener() {}, removeEventListener() {},
    localStorage: { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) } });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('OFFLINE_NETWORK_FORBIDDEN'); }));
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); await flush(); });
  expect(fetch).not.toHaveBeenCalled(); expect(live.ipfs.addToIpfs).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('actual role creation hook lifetimes', () => {
  it('makes blank-form options ready from public capabilities and never passes unfinished settings or a guessed subject', async () => {
    capabilityResults(); await render({});
    await act(async () => { await latest.refreshRoleCreation(); });
    const input = live.services.roleCreation.getRolePlanningEvidence.mock.calls[0][0];
    expect(input).toMatchObject({ purpose: 'capabilities', request: { mode: 'create', role: { name: '', kind: 'Role' } } });
    expect(input.request).not.toHaveProperty('subjectId'); expect(input.request.role).not.toHaveProperty('sponsorship');
    expect(latest.sponsorshipConfig).toMatchObject({ ready: true, canConfigure: true, claimBudgetReady: true, claimBudgetMissing: true, nativeSymbol: 'xDAI' });
    expect(latest.emailConfig).toMatchObject({ ready: true, enabled: true, authorityMatches: true });
    expect(latest.metadataAdminSubject).toBe('19');
    const callback = latest.refreshRoleCreation;
    await render({}); expect(latest.refreshRoleCreation).toBe(callback);
    await act(async () => { await latest.refreshRoleCreation({ name: 'unfinished', sponsorship: { capNative: 'invalid' } }); });
    expect(live.services.roleCreation.getRolePlanningEvidence.mock.calls[1][0].request).toEqual(input.request);
    await latest.reviewRoleConfiguration(form);
    expect(live.services.roleCreation.reviewRoleOperation.mock.calls.at(-1)[0]).not.toHaveProperty('purpose');
    expect(live.services.roleCreation.reviewRoleOperation.mock.calls.at(-1)[0].request.role.name).toBe('Builders');
  });

  it('represents absent modules as unavailable after a successful capabilities read without inventing readiness for an unknown response', async () => {
    await render({});
    await act(async () => { await latest.refreshRoleCreation(); });
    expect(latest.sponsorshipConfig).toMatchObject({ ready: true, canConfigure: false });
    expect(latest.emailConfig).toMatchObject({ ready: true, enabled: false });
    live.services.roleCreation.getRolePlanningEvidence.mockResolvedValue({ status: 'unknown', codes: ['UNAVAILABLE'] });
    await act(async () => { await expect(latest.refreshRoleCreation()).rejects.toMatchObject({ code: 'ROLE_OPERATION_UNAVAILABLE' }); });
    expect(latest.sponsorshipConfig.ready).toBe(false); expect(latest.emailConfig.ready).toBe(false);
    expect(latest.configurationError).toContain('could not be verified');
  });

  it.each(['false', 'unknown', 'missing'])('keeps %s capability authorization facts distinct from ready permission', async mode => {
    const data = capabilityResults();
    const fact = mode === 'false' ? known(false) : mode === 'unknown' ? { state: 'unknown', reason: 'UNAVAILABLE' } : undefined;
    data.sponsorship.operatorAuthorized = fact; data.email.enabled = fact;
    await render({}); await act(async () => { await latest.refreshRoleCreation(); });
    expect(latest.sponsorshipConfig).toMatchObject({ ready: mode === 'false', canConfigure: false });
    expect(latest.emailConfig).toMatchObject({ ready: mode === 'false', enabled: false });
    expect(latest.sponsorshipConfig.error).toBeTruthy(); expect(latest.emailConfig.error).toBeTruthy();
  });

  it('cancels old option reads on account change and keeps a late failure from replacing an explicit retry', async () => {
    capabilityResults(); await render({});
    await act(async () => { await latest.refreshRoleCreation(); });
    expect(latest.sponsorshipConfig.ready).toBe(true);
    const gate = deferred();
    live.services.roleCreation.getRolePlanningEvidence.mockImplementationOnce(async () => { await gate.promise; return { status: 'unknown', codes: ['OLD_READ'] }; });
    const old = latest.refreshRoleCreation().catch(error => error); await flush();
    const signal = live.services.roleCreation.getRolePlanningEvidence.mock.calls.at(-1)[0].signal;
    await act(async () => { await latest.refreshRoleCreation(); });
    expect(signal.aborted).toBe(true);
    await act(async () => { gate.resolve(); await old; });
    expect(latest.sponsorshipConfig.ready).toBe(true);
    live.auth = { ...live.auth, accountAddress: contracts.executor };
    await render({});
    expect(latest.sponsorshipConfig.ready).toBe(false);
  });

  it('rejects stale and cancelled option callbacks without cancelling a current account’s read', async () => {
    const data = capabilityResults(); await render({});
    const stale = latest.refreshRoleCreation;
    live.auth = { ...live.auth, accountAddress: contracts.executor }; await render({});
    const gate = deferred();
    live.services.roleCreation.getRolePlanningEvidence.mockImplementationOnce(async () => {
      await gate.promise; return { status: 'ready', data: { purpose: 'capabilities', context: { data } } };
    });
    let current;
    await act(async () => { current = latest.refreshRoleCreation(); await flush(); });
    const signal = live.services.roleCreation.getRolePlanningEvidence.mock.calls.at(-1)[0].signal;
    await expect(stale()).rejects.toThrow('account changed');
    const cancelled = new AbortController(); cancelled.abort();
    await expect(latest.refreshRoleCreation(undefined, { signal: cancelled.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(signal.aborted).toBe(false);
    await act(async () => { gate.resolve(); await current; });
    expect(latest.sponsorshipConfig).toMatchObject({ ready: true, canConfigure: true });
  });

  it('keeps the review callback stable through data rerenders and prepares canonical role/group requests', async () => {
    await render({});
    const callback = latest.reviewRoleConfiguration;
    live.infrastructure = { ...live.infrastructure, data: { poaManagerContracts: [] } };
    await render({});
    expect(latest.reviewRoleConfiguration).toBe(callback);
    const built = await callback(form);
    expect(built.plan.status).toBe('ready');
    expect((await prepareForAssertion(form)).submittable.ok).toBe(true);
    expect(f.calls.filter(call => call.method === 'getSubject')).toHaveLength(0);
    const group = { kind: 'group', name: 'Builders group', sponsorship: { enabled: false } };
    expect((await latest.reviewRoleConfiguration(group)).plan.status).toBe('ready');
    expect((await prepareForAssertion(group)).submittable.ok).toBe(true);
  });

  it.each(['pending hydration', 'anonymous', 'disabled'])('does not start a review for %s', async mode => {
    if (mode === 'pending hydration') live.auth = { ...live.auth, isAuthHydrated: false };
    if (mode === 'anonymous') live.auth = { ...live.auth, isAuthenticated: false };
    await render({ enabled: mode !== 'disabled' });
    await expect(latest.reviewRoleConfiguration(form)).rejects.toThrow('could not be verified');
    expect(live.authorityObservation.refetch).not.toHaveBeenCalled();
    expect(live.services.roleCreation.reviewRoleOperation).not.toHaveBeenCalled();
  });

  it('aborts a mounted in-flight review on close and suppresses late commits', async () => {
    const gate = deferred();
    f.provider.getBlock.mockImplementation(async () => { await gate.promise; return { number: 123, hash: f.input.snapshot.source.block.hash, timestamp: 1000 }; });
    await render({ auto: true });
    expect(live.services.roleCreation.reviewRoleOperation).toHaveBeenCalledOnce();
    const signal = live.services.roleCreation.reviewRoleOperation.mock.calls[0][0].signal;
    await render(null);
    expect(signal.aborted).toBe(true);
    await act(async () => { gate.resolve(); await flush(); });
    expect(commits).toEqual([]);
    expect(f.calls).toEqual([]);
    await render({ auto: true });
    await act(async () => { await flush(); await latest.reviewRoleConfiguration(form); });
    expect(container.textContent).toBe('ready');
  });

  it.each(['account', 'organization', 'source'])('cancels the prior %s scope and rejects old submission callbacks', async mode => {
    await render({});
    await latest.reviewRoleConfiguration(form);
    const oldSubmit = latest.submitRole; const oldPrepare = form => oldSubmit({ form, proposal: {} });
    const gate = deferred();
    live.infrastructure.refetch.mockImplementationOnce(async () => { await gate.promise; return { data: { poaManagerContracts: [] } }; });
    const old = latest.reviewRoleConfiguration(form).catch(error => error);
    if (mode === 'account') live.auth = { ...live.auth, accountAddress: contracts.executor };
    if (mode === 'organization') live.po = { ...live.po, orgId: `0x${'cc'.repeat(32)}` };
    if (mode === 'source') live.po = { ...live.po, subgraphUrl: 'https://other-index.invalid' };
    await render({});
    gate.resolve();
    expect((await old).name).toBe('AbortError');
    await expect(oldPrepare(form)).rejects.toThrow();
    expect(live.ipfs.addToIpfs).not.toHaveBeenCalled();
    if (mode === 'account') {
      expect((await latest.reviewRoleConfiguration(form)).plan.status).toBe('ready');
      expect(live.services.roleCreation.reviewRoleOperation.mock.calls.at(-1)[0].scope.account).toBe(contracts.executor);
    }
  });

  it('continues with the actual domain-proven subject ID, preserves the original draft, and does not predict from storage', async () => {
    await render({});
    const original = { ...form, description: 'Original details', perms: { DD_VOTE: true } };
    let ticket;
    await act(async () => {
      ticket = seedStage({ stage: 'create', requiresConfiguration: true,
        batch: [{ target: contracts.membershipAuthority, data: '0x1234', value: '0' }] }, original);
      seedOutcome(ticket, { success: true, receipt: { transactionHash: `0x${'ab'.repeat(32)}`, logs: [] } });
    });
    const actualId = ((BigInt(contracts.membershipAuthority) << 64n) | 19n).toString();
    live.services.roleCreation.getRoleContinuation = vi.fn(async () => ({ status: 'ready', data: { next: 'review-configuration',
      creation: { state: 'created', subjectId: actualId, proposalId: '7', creationTransactionHash: `0x${'ab'.repeat(32)}` } } }));
    let built;
    await act(async () => { built = await latest.reviewRoleConfiguration({ ...original, description: '', continuationId: ticket.id }); });
    const request = live.services.roleCreation.reviewRoleOperation.mock.calls.at(-1)[0].request;
    expect(request).toMatchObject({ mode: 'existing', subjectId: actualId, continuation: { proposalId: '7' }, metadata: { description: '' } });
    expect(built.createsSubject).toBe(false);
    expect(latest.continuations[0].originalForm.description).toBe('Original details');
    expect(latest.continuations[0].creation.status).toBe('created');
  });

  it.each(['failed', 'rejected'])('renews authority after delayed creation and %s configuration recovery before operation review', async state => {
    const recovery = await delayedConfigurationContinuation(state);
    let pending;
    await act(async () => { pending = latest.reviewRoleConfiguration(recovery.retryForm); await flush(); });
    expect(live.authorityObservation.refetch).toHaveBeenCalledOnce();
    expect(live.services.roleCreation.getRoleContinuation).toHaveBeenCalledOnce();
    expect(live.services.roleCreation.reviewRoleOperation).not.toHaveBeenCalled();
    await recovery.completeCreation();
    expect(live.services.roleCreation.getRoleContinuation).toHaveBeenCalledTimes(2);
    expect(live.authorityObservation.refetch).toHaveBeenCalledOnce();
    expect(live.services.roleCreation.reviewRoleOperation).not.toHaveBeenCalled();
    await recovery.completeConfiguration();
    const built = await pending;
    expect(Math.floor(Date.now() / 1000) - recovery.oldSnapshot.source.observedAt).toBe(40);
    expect(live.authorityObservation.refetch).toHaveBeenCalledTimes(2);
    const input = live.services.roleCreation.reviewRoleOperation.mock.calls[0][0];
    expect(input.snapshot).toBe(recovery.freshSnapshot);
    expect(input.snapshot).not.toBe(recovery.oldSnapshot);
    expect(input.scope).toMatchObject({ account, orgId, chainId: 100, contract: contracts.membershipAuthority });
    expect(input.request).toMatchObject({ mode: 'existing', subjectId: recovery.proof.subjectId,
      continuation: { proposalId: '7', transactionHash: recovery.proof.creationTransactionHash } });
    for (const [input] of live.services.roleCreation.getRoleContinuation.mock.calls) expect(input.snapshot).toBe(recovery.oldSnapshot);
    expect(built.createsSubject).toBe(false);
    expect(latest.continuations[0]).toMatchObject({ originalForm: recovery.original, creation: { status: 'created' }, configuration: { status: state } });
    expect(live.services.roleCreation.prepareRoleOperation).not.toHaveBeenCalled();
  });

  for (const phase of ['recovery', 'renewal']) {
    it.each(['caller cancellation', 'account', 'organization', 'source', 'unmount'])(`guards %s while awaiting ${phase} before reviewing a continuation`, async mode => {
      const recovery = await delayedConfigurationContinuation(), renewalGate = deferred(), controller = new AbortController();
      live.authorityObservation.refetch.mockReset().mockImplementationOnce(async () => recovery.oldSnapshot)
        .mockImplementationOnce(async () => { await renewalGate.promise; return recovery.freshSnapshot; });
      let pending;
      await act(async () => { pending = latest.reviewRoleConfiguration(recovery.retryForm, { signal: controller.signal }).catch(error => error); await flush(); });
      await recovery.completeCreation();
      if (phase === 'renewal') {
        await recovery.completeConfiguration();
        expect(live.authorityObservation.refetch).toHaveBeenCalledTimes(2);
      }
      const signal = live.services.roleCreation.getRoleContinuation.mock.calls.at(-1)[0].signal;
      if (mode === 'caller cancellation') controller.abort();
      if (mode === 'account') live.auth = { ...live.auth, accountAddress: contracts.executor };
      if (mode === 'organization') live.po = { ...live.po, orgId: `0x${'cc'.repeat(32)}` };
      if (mode === 'source') live.po = { ...live.po, subgraphUrl: 'https://other-index.invalid' };
      await render(mode === 'unmount' ? null : {});
      if (phase === 'recovery') expect(signal.aborted).toBe(true);
      await recovery.completeConfiguration();
      await act(async () => { renewalGate.resolve(); await flush(); });
      expect((await pending).name).toBe('AbortError');
      expect(live.authorityObservation.refetch).toHaveBeenCalledTimes(phase === 'renewal' ? 2 : 1);
      expect(live.services.roleCreation.reviewRoleOperation).not.toHaveBeenCalled();
    });
  }

  it('fails closed when post-recovery authority renewal fails and preserves the independently recovered stages', async () => {
    const recovery = await delayedConfigurationContinuation();
    live.authorityObservation.refetch.mockReset().mockResolvedValueOnce(recovery.oldSnapshot)
      .mockRejectedValueOnce(new Error('AUTHORITY_RENEWAL_UNAVAILABLE'));
    let pending;
    await act(async () => { pending = latest.reviewRoleConfiguration(recovery.retryForm).catch(error => error); await flush(); });
    await recovery.completeCreation(); await recovery.completeConfiguration();
    expect(await pending).toMatchObject({ cause: { message: 'AUTHORITY_RENEWAL_UNAVAILABLE' } });
    expect(live.authorityObservation.refetch).toHaveBeenCalledTimes(2);
    expect(live.services.roleCreation.reviewRoleOperation).not.toHaveBeenCalled();
    expect(latest.continuations[0]).toMatchObject({ creation: { status: 'created' }, configuration: { status: 'rejected' } });
  });

  it.each(['pending', 'executed'])('does not renew or review a continuation with %s configuration', async state => {
    const recovery = await delayedConfigurationContinuation(state);
    let pending;
    await act(async () => { pending = latest.reviewRoleConfiguration(recovery.retryForm).catch(error => error); await flush(); });
    await recovery.completeCreation(); await recovery.completeConfiguration();
    expect((await pending).cause.message).toContain('earlier vote is still waiting or needs attention');
    expect(live.authorityObservation.refetch).toHaveBeenCalledOnce();
    expect(live.services.roleCreation.reviewRoleOperation).not.toHaveBeenCalled();
  });

  it('uses the current trusted document reader for scoped configuration status after a mounted reader change', async () => {
    const recovery = await delayedConfigurationContinuation('executed');
    const oldReader = live.ipfs.fetchFromIpfs;
    const document = { fixture: 'trusted configuration document' };
    const currentReader = vi.fn(async () => document);
    const participationToken = `0x${'a'.repeat(40)}`, paymentManager = `0x${'b'.repeat(40)}`;
    capabilityResults();
    live.po = { ...live.po, taskManagerContractAddress: contracts.taskManager,
      participationTokenAddress: participationToken, paymentManagerAddress: paymentManager };
    live.ipfs = { ...live.ipfs, fetchFromIpfs: currentReader };
    await render({});
    // The domain owns allowlist/root proof. This fixture exercises the actual
    // hook's document capability and result lifetime, without claiming that proof.
    live.services.roleCreation.getRoleContinuation.mockReset().mockImplementation(async input => {
      if (!input.configuration) return { status: 'ready', data: { creation: recovery.proof } };
      expect(await input.fetchDocument('trusted-document-pointer')).toBe(document);
      return { status: 'ready', data: { creation: recovery.proof, configuration: { state: 'executed', proposalId: '8' } } };
    });
    let result;
    await act(async () => { result = await latest.resolveContinuation(recovery.ticket.id); });
    const [creation, configuration] = live.services.roleCreation.getRoleContinuation.mock.calls.map(([input]) => input);
    expect(configuration.fetchDocument).toBe(currentReader);
    expect(currentReader).toHaveBeenCalledExactlyOnceWith('trusted-document-pointer');
    expect(oldReader).not.toHaveBeenCalled();
    expect(configuration.snapshot).toBe(recovery.oldSnapshot);
    expect(configuration.endpoint).toBe(live.po.subgraphUrl);
    expect(configuration.scope).toEqual({ chainId: 100, orgId, contract: contracts.membershipAuthority, account,
      contracts: { membershipAuthority: contracts.membershipAuthority, executor: contracts.executor, hybridVoting: contracts.hybridVoting,
        taskManager: contracts.taskManager, participationToken, paymentManager,
        registry: contracts.registry, paymaster: contracts.paymaster, email: contracts.email } });
    expect(configuration.signal).toBe(creation.signal);
    expect(configuration.signal.aborted).toBe(false);
    expect(result.configuration.status).toBe('executed');
    expect(latest.continuations[0].configuration.status).toBe('executed');
  });

  it.each(['caller cancellation', 'organization change'])('does not promote configuration after %s during trusted document loading', async mode => {
    const recovery = await delayedConfigurationContinuation('executed'), gate = deferred(), controller = new AbortController();
    const scope = roleContinuationScope({ chainId: 100, orgId, authority: contracts.membershipAuthority,
      hybridVoting: contracts.hybridVoting, executor: contracts.executor, account, endpoint: live.po.subgraphUrl });
    const reader = vi.fn(async () => { await gate.promise; return { fixture: 'late trusted document' }; });
    live.ipfs = { ...live.ipfs, fetchFromIpfs: reader };
    await render({});
    live.services.roleCreation.getRoleContinuation.mockReset().mockImplementation(async input => {
      if (!input.configuration) return { status: 'ready', data: { creation: recovery.proof } };
      await input.fetchDocument('trusted-document-pointer');
      return { status: 'ready', data: { creation: recovery.proof, configuration: { state: 'executed', proposalId: '8' } } };
    });
    let pending;
    await act(async () => { pending = latest.resolveContinuation(recovery.ticket.id, { signal: controller.signal }).catch(error => error); await flush(); });
    expect(reader).toHaveBeenCalledOnce();
    const configuration = live.services.roleCreation.getRoleContinuation.mock.calls.at(-1)[0];
    expect(configuration.fetchDocument).toBe(reader); expect(configuration.signal.aborted).toBe(false);
    if (mode === 'caller cancellation') controller.abort();
    else { live.po = { ...live.po, orgId: `0x${'cc'.repeat(32)}` }; await render({}); }
    expect(configuration.signal.aborted).toBe(true);
    await act(async () => { gate.resolve(); await flush(); });
    expect((await pending).name).toBe('AbortError');
    const saved = readRoleContinuations(window.localStorage, scope)[0];
    expect(saved.creation.status).toBe('created'); expect(saved.configuration.status).toBe('pending');
    expect(live.services.roleCreation.reviewRoleOperation).not.toHaveBeenCalled();
  });

  it('preserves independently established creation when configuration evidence is unavailable and never treats it as failed', async () => {
    await render({}); let creationTicket, configurationTicket;
    const original = { ...form, perms: { DD_VOTE: true } }, transactionHash = `0x${'ab'.repeat(32)}`;
    await act(async () => {
      creationTicket = seedStage({ stage: 'create', requiresConfiguration: true,
        batch: [{ target: contracts.membershipAuthority, data: '0x1234', value: '0' }] }, original);
      seedOutcome(creationTicket, { success: true, receipt: { transactionHash, logs: [] } });
      configurationTicket = seedStage({ stage: 'existing', batch: [{ target: contracts.membershipAuthority, data: '0x5678', value: '0' }] },
        { ...original, continuationId: creationTicket.id });
      seedOutcome(configurationTicket, { success: true, receipt: { transactionHash: `0x${'cd'.repeat(32)}`, logs: [] } });
    });
    const proof = { state: 'created', subjectId: 'actual-subject', proposalId: '7', creationTransactionHash: transactionHash };
    live.services.roleCreation.getRoleContinuation = vi.fn().mockResolvedValueOnce({ status: 'ready', data: { creation: proof, next: 'review-configuration' } })
      .mockResolvedValueOnce({ status: 'unknown', codes: ['CONFIGURATION_UNAVAILABLE'], observations: { creation: { state: 'known', value: proof } } });
    await act(async () => { await expect(latest.resolveContinuation(creationTicket.id)).rejects.toMatchObject({ code: 'ROLE_OPERATION_UNAVAILABLE' }); });
    const scope = roleContinuationScope({ chainId: 100, orgId, authority: contracts.membershipAuthority, hybridVoting: contracts.hybridVoting,
      executor: contracts.executor, account, endpoint: live.po.subgraphUrl });
    const saved = readRoleContinuations(window.localStorage, scope)[0];
    expect(saved.creation.status).toBe('created'); expect(saved.configuration.status).toBe('pending');
    expect(saved.configuration.failureKind).toBeUndefined();
  });
  it('rejects stale final preparation at the current clock before uploading details', async () => {
    await render({});
    const described = { ...form, description: 'Reviewed details' };
    await latest.reviewRoleConfiguration(described);
    Date.now.mockReturnValue(1032000);
    await expect(prepareForAssertion(described)).rejects.toThrow('could not be verified');
    expect(live.ipfs.addToIpfs).not.toHaveBeenCalled();
  });
});
