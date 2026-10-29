import React, { act, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountedHostDocument, mountedNodes } from '@/test/mountedHost';

// Keep React hooks, the controlled form, its validation, and installed core lint
// adapter real. Only visual primitives and the external user search are replaced.
vi.mock('@chakra-ui/react', async () => {
  const { createElement, forwardRef } = await import('react');
  const components = {};
  for (const name of ['Accordion', 'AccordionButton', 'AccordionIcon', 'AccordionItem', 'AccordionPanel',
    'Alert', 'AlertIcon', 'Badge', 'Box', 'Button', 'Checkbox', 'CheckboxGroup', 'Divider', 'FormControl',
    'FormLabel', 'HStack', 'IconButton', 'Input', 'NumberInput', 'NumberInputField', 'Progress',
    'Radio', 'RadioGroup', 'Select', 'SimpleGrid', 'Stack', 'Switch', 'Tag', 'TagCloseButton',
    'TagLabel', 'Text', 'Textarea', 'VStack', 'Wrap', 'WrapItem']) {
    components[name] = forwardRef(function Primitive({ children, onClick, onChange, isDisabled, value, ...props }, ref) {
      const tag = ['Button', 'IconButton', 'AccordionButton'].includes(name) ? 'button'
        : name === 'Input' || name === 'NumberInputField' ? 'input'
          : name === 'Select' ? 'select' : name === 'Textarea' ? 'textarea' : 'div';
      return createElement(tag, { 'data-testid': props['data-testid'], 'aria-label': props['aria-label'], 'data-primitive': name,
        ...(tag === 'button' ? { disabled: Boolean(isDisabled) } : {}),
        ...(['input', 'select', 'textarea'].includes(tag) ? { value, readOnly: true } : {}),
        ref: node => {
          if (typeof ref === 'function') ref(node); else if (ref) ref.current = node;
          if (!node) return;
          node.press = () => { if (!isDisabled) return onClick?.(); };
          node.edit = next => { if (!isDisabled) return onChange?.({ target: { value: next, checked: next } }); };
          node.choose = next => onChange?.(next);
        },
      }, children);
    });
  }
  components.useToast = () => live.toast;
  return components;
});
vi.mock('@/components/common/UserSearchInput', () => ({ default: () => null }));

import { constants, utils } from 'ethers';
import { getAbi } from '@poa-box/core/contracts';
import { bytes32ToCidV0 } from '@poa-box/core/encoding/cid';
import { composeSubjectId } from '@poa-box/core/authority/ids';
import RoleForm from '@/components/accessV2/RoleForm';
import RoleContinuationPanel from '@/components/accessV2/RoleContinuationPanel';
import { useRoleCreationContext } from '@/hooks/accessV2/useRoleCreationContext';
import { useProposalForm } from '@/hooks/useProposalForm';
import { defaultRoleForm } from '@/lib/accessV2/roleFormBatch';
import { RoleCreationService } from '@/services/web3/domain/RoleCreationService';
import { VotingService } from '@/services/web3/domain/VotingService';
import { guardService } from '@/lib/services/runtimeScope';
import { ZkEmailInvitesService } from '@/services/web3/domain/ZkEmailInvitesService';
import { submitProposalRuntime } from '@/hooks/runtime/proposalSubmitRuntime';
import { submitTrackedRoleProposal } from '@/hooks/runtime/roleSubmissionTransport';
import { roleSubmissionIntent } from '@/lib/accessV2/roleSubmissionRecovery';
import { createSubmissionJournal } from '@/services/web3/core/submissionJournal';
import { clearRecoveredSubmission, TransactionManager } from '@/services/web3/core/TransactionManager';
import { reconcileUserOperationSubmission } from '@/services/web3/core/userOperationSubmission';
import { fakeBrowserLocks } from '@/services/web3/core/submissionTestHelpers';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';
import { fixture, contracts, account, orgId, hash, roleId, groupId, selectedResponse, interfaces, authorityResponse } from '@/lib/accessV2/roleObservationFixtures';
import { roleContinuationKey, readRoleContinuations } from '@/lib/accessV2/roleContinuationDraft';

const live = vi.hoisted(() => ({}));
vi.mock('@/context/authState', () => ({ useAuth: () => live.auth }));
vi.mock('@/context/POContext', () => ({ usePOContext: () => live.po }));
vi.mock('@/context/ProjectContext', () => ({ useProjectContext: () => ({ projectsData: [] }) }));
vi.mock('@/hooks/useWeb3Services', () => ({ useWeb3Services: () => live.services }));
vi.mock('@/context/ipfsContext', () => ({ useIPFScontext: () => live.ipfs }));
vi.mock('@/hooks/accessV2/useOrgAuthority', () => ({ useOrgAuthority: () => live.authority }));
vi.mock('@/hooks/accessV2/useAuthorityEvidence', () => ({ useAuthorityEvidence: () => live.authorityObservation }));
vi.mock('@/util/apolloClient', () => ({ useSubgraphClient: () => live.client }));
vi.mock('@/util/queries', () => ({ FETCH_INFRASTRUCTURE_ADDRESSES: 'infrastructure' }));
vi.mock('@/config/networks', async original => ({ ...await original(), getNetworkByChainId: () => ({ nativeCurrency: { symbol: 'xDAI' }, rpcUrl: 'https://rpc.invalid' }) }));
vi.mock('@apollo/client', () => ({ useQuery: () => live.infrastructure }));
vi.mock('@/lib/accessV2/roleOperationQuery', () => ({ roleOperationQuery: (...args) => live.query(...args) }));
let root, container, f, options, initial, latest, formValue, setFormValue, closeForm, submit, writes, stored, txs, receipts, queryRows, createdId, lastPayload, uncertainty, nextId;
let journal, callbackMode, retainFailure, queryFailure, lostAck, submissionFailure, latePageFailure, recoveryAvailable;
let proposalForm, scopeChangeAfterTicket, capturedTicket;
const hashOf = digit => `0x${digit.repeat(64)}`;
const oldHash = hashOf('b'), execHash = hashOf('c');
const flush = async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => setTimeout(resolve, 5)); };
const byId = id => mountedNodes(container).find(node => node.attributes['data-testid'] === id);
const press = id => act(async () => { await byId(id).press(); await flush(); });
const update = change => act(async () => { setFormValue(value => ({ ...value, ...change })); await flush(); });
const render = async (element = <Harness />) => { await act(async () => { root.render(element); }); await act(async () => { await flush(); }); };
function advanceIndexedHead() {
  const number = f.indexedResponse._meta.block.number + 1;
  const block = { number, hash: utils.id(`synthetic-indexed-head-${number}`), timestamp: 1000 };
  f.indexedResponse._meta.block = block;
  f.input.snapshot.source.block = { number: String(number), hash: block.hash, timestamp: '1000' };
}
function Harness() {
  const [form, setForm] = useState(initial), [open, setOpen] = useState(true);
  const ctx = useRoleCreationContext({ enabled: open, authority: live.authority.address });
  const [status, setStatus] = useState({ blocked: true });
  const doSubmit = useCallback(async () => {
    const runtime = {
      proposal: { type: 'createRole', name: `Settings for ${form.name}`, description: 'Reviewed changes', time: 1, roleFormV2: form },
      orgNetwork: { nativeCurrency: { decimals: 18 } }, nativeCurrencySymbol: 'xDAI', orgChainId: 100,
      roleNames: {}, projectNames: {}, setLoadingSubmit() {}, resetForm: () => setOpen(false), toast() {},
      retainRoleContinuation: id => { if (retainFailure) throw new Error('Scope changed before callback'); setForm(value => ({ ...value, continuationId: id })); },
      buildActionSummaries: () => [],
      ...Object.fromEntries(['BasicFields', 'CreateRoleProposal'].map(name => [`validate${name}`, () => true])),
      onSubmit: async (payload, tracker) => {
        lastPayload = payload;
        if (callbackMode === 'false') { tracker?.notSubmitted(); return false; }
        if (callbackMode === 'scope-guard') throw Object.assign(new Error('Account changed before transport'), { roleSubmissionState: 'not-submitted' });
        if (callbackMode === 'unknown-throw') throw new Error('No transport evidence');
        const result = await submitTrackedRoleProposal(live.services.voting, tracker,
          voting => voting.createHybridProposal(contracts.hybridVoting, { ...payload, durationMinutes: payload.time }));
        if (latePageFailure) throw new Error('Page work failed after confirmation');
        return result;
      },
    };
    return submitProposalRuntime(runtime, null, { membershipAuthorityAddress: contracts.membershipAuthority },
      { accessV2: { enabled: true, authority: contracts.membershipAuthority, roleCreation: ctx } });
  }, [ctx, form]);
  useEffect(() => { latest = ctx; formValue = form; setFormValue = setForm; closeForm = () => setOpen(false); submit = doSubmit; }, [ctx, form, doSubmit]);
  return <>
    <RoleContinuationPanel ctx={ctx} onResume={next => { setForm(next); setOpen(true); }} />
    {open && <><RoleForm value={form} onChange={setForm} ctx={{ ...ctx, authority: live.authority.address,
      roles: options.subjects.filter(row => row.kind === 'Role'), groups: options.subjects.filter(row => row.kind === 'Group'), votingClasses: [{ classIndex: 0, strategy: 0, slicePct: 100 }] }} onStatus={setStatus} />
      <button data-testid="submit-vote" disabled={Boolean(status.blocked)} onClick={doSubmit}>Create vote</button></>}
  </>;
}
function ProposalHarness() {
  const ctx = useRoleCreationContext({ enabled: true, authority: live.authority.address });
  const form = useProposalForm({ onSubmit: (payload, tracker) => callbackMode === 'false' ? false
    : submitTrackedRoleProposal(live.services.voting, tracker,
      voting => voting.createHybridProposal(contracts.hybridVoting, { ...payload, durationMinutes: payload.time })) });
  const restore = form.restoreProposal;
  useEffect(() => { restore({ type: 'createRole', name: 'A new role', time: 1, roleFormV2: initial }); }, [restore]);
  useEffect(() => {
    latest = ctx; proposalForm = form;
    submit = () => form.handleSubmit(null, { membershipAuthorityAddress: contracts.membershipAuthority }, { accessV2: { enabled: true,
      roleCreation: { ...ctx, beginRoleSubmission: (...args) => {
        const ticket = ctx.beginRoleSubmission(...args); capturedTicket = ticket;
        if (scopeChangeAfterTicket) flushSync(() => { live.auth = { ...live.auth, accountAddress: contracts.executor }; root.render(<ProposalHarness />); });
        return ticket;
      } },
    } });
  }, [ctx, form]);
  return <RoleContinuationPanel ctx={ctx} onResume={next => restore({ type: 'createRole', name: 'A new role', time: 1, roleFormV2: next })} />;
}
function newProposal(contract, method, args) {
  const id = String(nextId++), transactionHash = hashOf(nextId.toString(16));
  const data = contract.interface.encodeFunctionData(method, args);
  const parsed = contract.interface.parseTransaction({ data });
  txs[transactionHash] = { hash: transactionHash, to: contracts.hybridVoting, from: account, chainId: 100, nonce: String(Number(id) - 7),
    blockNumber: 100, blockHash: oldHash, data, value: constants.Zero };
  const event = interfaces.hybridVoting.encodeEventLog(interfaces.hybridVoting.getEvent('NewProposal'),
    [id, parsed.args.title, parsed.args.descriptionHash, 2, 1600, 900]);
  const receipt = { status: 1, transactionHash, blockNumber: 100, blockHash: oldHash,
    logs: [{ ...event, address: contracts.hybridVoting, transactionHash, blockNumber: 100, blockHash: oldHash, removed: false }] };
  receipts[transactionHash] = receipt;
  queryRows.push({ id: `${contracts.hybridVoting}-${id}`, proposalId: id, transactionHash, createdAtBlock: '100', wasExecuted: false,
    executionFailed: false, isValid: null, winningOption: null, status: 'Active', batchExecutions: [],
    hybridVoting: { id: contracts.hybridVoting, organization: { id: orgId } } });
  return receipt;
}
async function executeCreation() {
  const row = queryRows[0], creation = interfaces.membershipAuthority.parseTransaction({ data: lastPayload.batches[0][0].data });
  const kind = creation.name === 'createGroup' ? 'Group' : 'Role';
  createdId = composeSubjectId(contracts.membershipAuthority, '19'); // Deliberately different from any predicted next ID.
  options.subjects.push({ subjectId: createdId, kind, name: creation.args[0], maxMembers: kind === 'Role' ? String(creation.args[3]) : '0', memberCount: '0' });
  const transactionHash = hashOf('d');
  txs[transactionHash] = { hash: transactionHash, to: contracts.hybridVoting, from: account, chainId: 100,
    blockNumber: 110, blockHash: execHash, data: interfaces.hybridVoting.encodeFunctionData('announceWinner', [row.proposalId]), value: constants.Zero };
  const executorInterface = new utils.Interface(getAbi('Executor'));
  const log = (iface, emitter, name, args) => ({ ...iface.encodeEventLog(iface.getEvent(name), args), address: emitter,
    transactionHash, blockNumber: 110, blockHash: execHash, removed: false });
  receipts[transactionHash] = { status: 1, transactionHash, blockNumber: 110, blockHash: execHash, logs: [
    log(interfaces.membershipAuthority, contracts.membershipAuthority, 'SubjectCreated', [createdId, kind === 'Role' ? 0 : 1, creation.args[0], creation.args[1], kind === 'Role' ? creation.args[3] : 0]),
    log(executorInterface, contracts.executor, 'CallExecuted', [row.proposalId, 0, contracts.membershipAuthority, 0]),
    log(executorInterface, contracts.executor, 'BatchExecuted', [row.proposalId, 1]),
    log(interfaces.hybridVoting, contracts.hybridVoting, 'ProposalExecuted', [row.proposalId, 0, 1]),
  ] };
  Object.assign(row, { wasExecuted: true, isValid: true, winningOption: '0', status: 'Executed',
    batchExecutions: [{ proposalId: row.proposalId, callCount: '1', transactionHash, executedAtBlock: '110', executor: { id: contracts.executor } }] });
  advanceIndexedHead();
}
function executeConfiguration(state = 'executed') {
  const row = queryRows[1];
  if (state === 'failed') { row.executionFailed = true; advanceIndexedHead(); return; }
  if (state === 'rejected') { row.isValid = false; row.winningOption = '1'; advanceIndexedHead(); return; }
  const transactionHash = hashOf('e'), batch = lastPayload.batches[0];
  txs[transactionHash] = { hash: transactionHash, to: contracts.hybridVoting, from: account, chainId: 100,
    blockNumber: 110, blockHash: execHash, data: interfaces.hybridVoting.encodeFunctionData('announceWinner', [row.proposalId]), value: constants.Zero };
  const executorInterface = new utils.Interface(getAbi('Executor'));
  const log = (iface, emitter, name, args) => ({ ...iface.encodeEventLog(iface.getEvent(name), args), address: emitter,
    transactionHash, blockNumber: 110, blockHash: execHash, removed: false });
  receipts[transactionHash] = { status: 1, transactionHash, blockNumber: 110, blockHash: execHash, logs: [
    ...batch.map((call, i) => log(executorInterface, contracts.executor, 'CallExecuted', [row.proposalId, i, call.target, call.value])),
    log(executorInterface, contracts.executor, 'BatchExecuted', [row.proposalId, batch.length]),
    log(interfaces.hybridVoting, contracts.hybridVoting, 'ProposalExecuted', [row.proposalId, 0, batch.length]),
  ] };
  Object.assign(row, { wasExecuted: true, isValid: true, winningOption: '0', status: 'Executed',
    batchExecutions: [{ proposalId: row.proposalId, callCount: String(batch.length), transactionHash, executedAtBlock: '110', executor: { id: contracts.executor } }] });
  advanceIndexedHead();
}
beforeEach(() => {
  options = { subjects: [{ subjectId: roleId, kind: 'Role', name: 'Members', maxMembers: '0', memberCount: '1' },
    { subjectId: groupId, kind: 'Group', name: 'Team', maxMembers: '0', memberCount: '0' }], emailRoot: constants.HashZero,
    accountAcceptance: address => address.toLowerCase() === account };
  f = fixture(options); stored = new Map(); txs = {}; receipts = {}; queryRows = []; writes = vi.fn(); nextId = 7; uncertainty = false;
  callbackMode = null; retainFailure = false; queryFailure = false; lostAck = false; submissionFailure = null; latePageFailure = false; recoveryAvailable = true;
  scopeChangeAfterTicket = false; capturedTicket = null; live.toast = vi.fn();
  f.provider.getTransaction = vi.fn(async hash => txs[hash]); f.provider.getTransactionReceipt = vi.fn(async hash => receipts[hash]);
  f.provider.getBlock.mockImplementation(async tag => tag === '0x64' ? { number: 100, hash: oldHash, timestamp: 900 }
    : tag === '0x6e' ? { number: 110, hash: execHash, timestamp: 950 } : { ...f.indexedResponse._meta.block });
  const query = vi.fn(async (document, variables) => {
    if (queryFailure && (queryFailure === true || queryFailure === variables.id) && /RoleContinuation/.test(document)) throw new Error('Indexed status unavailable');
    if (/FetchHybridProposalsPage|RecoverSubjectCreation/.test(document)) throw new Error('UNRELATED_HISTORY_FORBIDDEN');
    const response = { ...f.indexedResponse, proposals: queryRows.filter(row => row.id === variables.id) };
    return selectedResponse(document, authorityResponse(response, f.input.snapshot.data, variables));
  });
  live.query = query;
  vi.spyOn(Date, 'now').mockReturnValue(1001000);
  const docs = new Map();
  const addToIpfs = vi.fn(async json => { const path = bytes32ToCidV0(utils.sha256(utils.toUtf8Bytes(json))); docs.set(path, JSON.parse(json)); return { path }; });
  live.ipfs = { addToIpfs, fetchFromIpfs: vi.fn(async cid => docs.get(cid)) };
  const transportStorage = { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value),
    removeItem: key => stored.delete(key), key: index => [...stored.keys()][index], get length() { return stored.size; } };
  const events = new EventTarget();
  // The actual journal and core recovery clear the journal on a confirmed result.
  // Only transport is mocked; role continuation/planning/proof remain installed core.
  journal = createSubmissionJournal({ accountAddress: account, chainId: 100, entryPoint: ENTRY_POINT_ADDRESS,
    context: { orgId }, storage: transportStorage, locks: fakeBrowserLocks() });
  const txManager = { execute: vi.fn(async (contract, method, args, executionOptions) => {
    const release = await journal.acquire();
    try {
      const intentKey = roleSubmissionIntent(contract, method, args, executionOptions);
      journal.begin(intentKey); journal.signing();
      if (submissionFailure === 'pre-send') return { success: false, error: { category: 'user_rejected' } };
      writes(); const receipt = newProposal(contract, method, args);
      let saved = journal.write({ kind: 'transaction', phase: 'submitting', chainId: 100,
        nonce: txs[receipt.transactionHash].nonce, callKey: intentKey, fromBlock: '100' });
      if (!lostAck) saved = journal.write({ ...saved, phase: 'submitted', txHash: receipt.transactionHash });
      txManager.lastSubmission = saved;
      if (submissionFailure === 'revert') { receipt.status = 0; receipt.logs = []; queryRows.pop(); }
      if (uncertainty) return { success: false, error: { category: 'submission_unknown', submission: saved } };
      expect(journal.clear(saved)).toBe(true);
      return { success: true, receipt, txHash: receipt.transactionHash };
    } finally { journal.abandonUnsent(); await release(); }
  }), getPendingSubmission: vi.fn(() => journal.read()),
  reconcileSubmission: vi.fn(async submission => {
    const result = await reconcileUserOperationSubmission(submission || journal.read(), null, txManager.publicClient);
    if (result.outcome.status !== 'unknown') await clearRecoveredSubmission(journal, submission, () => {});
    return result;
  }), publicClient: {
    getChainId: vi.fn(async () => 100),
    getTransactionReceipt: vi.fn(async ({ hash }) => recoveryAvailable ? receipts[hash] : null),
    getTransaction: vi.fn(async ({ hash }) => txs[hash] ? { ...txs[hash], value: String(txs[hash].value) } : null),
    getBlockNumber: vi.fn(async () => 123n),
    getBlock: vi.fn(async ({ blockNumber, includeTransactions }) => ({
      number: blockNumber, hash: blockNumber === 100n ? oldHash : blockNumber === 110n ? execHash : hash,
      ...(includeTransactions ? { transactions: Object.values(txs).filter(tx => BigInt(tx.blockNumber) === blockNumber).map(tx => ({ ...tx, value: String(tx.value) })) } : {}),
    })),
  } };
  live.services = { roleCreation: new RoleCreationService(f.input.readFactory),
    zkEmailInvites: new ZkEmailInvitesService(f.input.readFactory, txManager),
    voting: guardService(new VotingService(f.input.readFactory, txManager, live.ipfs), () => {}), txManager };
  live.auth = { accountAddress: account, isAuthHydrated: true, isAuthenticated: true };
  live.po = { orgId, orgChainId: 100, subgraphUrl: f.input.snapshot.source.endpoint, treasuryContractAddress: contracts.executor,
    votingContractAddress: contracts.hybridVoting, taskManagerContractAddress: contracts.taskManager, zkEmailInvitesAddress: contracts.email };
  live.authority = { enabled: true, address: contracts.membershipAuthority };
  live.authorityObservation = { refetch: vi.fn(() => f.readAuthority(live.query)) };
  const infra = { poaManagerContracts: [{ orgRegistryProxy: contracts.registry, paymasterHubProxy: contracts.paymaster }] };
  live.infrastructure = { data: infra, refetch: vi.fn(async () => ({ data: infra })) }; live.client = {};
  initial = { ...defaultRoleForm(), name: 'Builders', sponsorship: { enabled: false } };
  const doc = mountedHostDocument(); container = doc.createElement('main');
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', { document: doc, HTMLIFrameElement: class {},
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events), localStorage: transportStorage });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('OFFLINE_NETWORK_FORBIDDEN'); }));
  root = createRoot(container);
});
afterEach(async () => { await act(async () => { root.unmount(); await flush(); }); expect(fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('mounted actual role/group staged lifecycle with real installed core and services', () => {
  it.each(['role', 'group'])('reviews a simple %s as one create call with bounded reads and no history or optional module gates', async kind => {
    initial.kind = kind; await render();
    await vi.waitFor(async () => { await act(flush); expect(byId('submit-vote').disabled).toBe(false); });
    expect(container.textContent).not.toContain('could not be verified');
    let built; await act(async () => { built = await latest.prepareReviewedRole(formValue); });
    expect(built.stage).toBe('create'); expect(built.requiresConfiguration).toBe(false); expect(built.batch).toHaveLength(1);
    expect(built.predictedSubjectId).toBeNull();
    expect(built.plan.data.evidence.context.coverage.expectedKeys).toEqual(['module-bindings', 'authority:executor', 'authority:orgId', 'canonical:after']);
    // The separate options loader observes capabilities; the actual create stage
    // still requests only creation proof and never subject/holder/history work.
    expect(f.calls.some(call => ['getSubject', 'userSubjects', 'getStatus', 'subjectCount'].includes(call.method))).toBe(false);
    expect(live.query.mock.calls.every(([doc]) => !/ProposalsPage|RecoverSubjectCreation/.test(doc))).toBe(true);
    expect(writes).not.toHaveBeenCalled(); expect(latest.continuations).toEqual([]);
  });
  it.each(['role', 'group'])('persists configured %s pending, reopens, matches actual event, and submits original choices only after a second review', async kind => {
    initial = { ...initial, kind, description: 'Keep these details', imageURI: 'https://image.invalid/role.png', perms: { DD_VOTE: true },
      groupIds: kind === 'role' ? [groupId] : [], memberRoleIds: kind === 'group' ? [roleId] : [],
      manager: { enabled: true, managerSubjectId: groupId, canGrant: true, canRemove: true, delaySecs: 600 },
      ...(kind === 'role' ? { openRole: true, limitSeats: true, maxMembers: 3, holders: [{ address: account, sticky: true }] } : {}),
      canCreateTasks: true, canOrganizeFolders: true, bindingVote: true, bindingClassIdx: 0, editOrgDetails: true };
    await render(); expect(container.textContent).toContain('Saved for the second vote');
    await act(async () => { expect(await submit()).toBe(true); await flush(); });
    expect(writes).toHaveBeenCalledTimes(1); expect(lastPayload.createsSubject).toBe(true); expect(lastPayload.batches[0]).toHaveLength(1);
    const row = latest.continuations[0]; expect(row.form.description).toBe(initial.description); expect(row.creation.proposalId).toBe('7');
    expect(container.textContent).toContain('Finish configuration: Builders');
    await render(null); await render();
    await press(`role-continuation-${row.id}`); expect(container.textContent).toContain('Waiting for the creation vote'); expect(writes).toHaveBeenCalledTimes(1);
    await executeCreation(); await press(`role-continuation-${row.id}`);
    expect(container.textContent).toContain('Step 2 of 2'); expect(formValue.description).toBe(initial.description);
    expect(formValue.perms).toEqual(initial.perms); expect(writes).toHaveBeenCalledTimes(1);
    let built; await act(async () => { built = await latest.prepareReviewedRole(formValue); });
    expect(built.plan.status).toBe('ready'); expect(built.stage).toBe('existing'); expect(built.subjectId).toBe(createdId); expect(built.createsSubject).toBe(false);
    const calls = built.batch.filter(call => call.target === contracts.membershipAuthority).map(call => interfaces.membershipAuthority.parseTransaction({ data: call.data }));
    expect(calls[0].name).toBe('renameSubject'); expect(calls[0].args[0].toString()).toBe(createdId); expect(calls[0].args[2]).not.toBe(constants.HashZero);
    expect(calls.map(call => call.name)).toContain('setPerm'); expect(calls.map(call => call.name)).toContain('setManagerConfig');
    if (kind === 'role') { expect(calls.map(call => call.name)).toContain('grant'); expect(calls.map(call => call.name)).toContain('setSubjectDefault'); }
    expect(built.batch.some(call => call.target === contracts.taskManager)).toBe(true); expect(built.batch.some(call => call.target === contracts.registry)).toBe(true);
    await act(async () => { expect(await submit()).toBe(true); await flush(); });
    expect(writes).toHaveBeenCalledTimes(2); expect(lastPayload.createsSubject).toBe(false); expect(lastPayload.optionNames).toEqual(['Apply settings', 'Reject']);
    expect(latest.continuations[0].configuration.proposalId).toBe('8');
    expect(latest.continuations[0].creation.submission.recovery.attemptId).not.toBe(latest.continuations[0].configuration.submission.recovery.attemptId);
    expect(latest.continuations[0].creation.expectedIntentKey).not.toBe(latest.continuations[0].configuration.expectedIntentKey);
    await press(`role-continuation-${row.id}`); expect(writes).toHaveBeenCalledTimes(2); expect(container.textContent).toContain('already submitted');
  });
  it.each(['failed', 'rejected', 'executed'])('reconciles the separate configuration vote as %s without recreating its subject', async outcome => {
    initial.perms = { DD_VOTE: true }; await render(); await act(async () => { await submit(); await flush(); });
    const row = latest.continuations[0]; await executeCreation(); await press(`role-continuation-${row.id}`);
    await act(async () => { expect(await submit()).toBe(true); await flush(); });
    expect(writes).toHaveBeenCalledTimes(2); executeConfiguration(outcome);
    await press(`role-continuation-${row.id}`);
    if (outcome === 'executed') {
      expect(container.textContent).toContain('passed and ran successfully');
      await press(`role-continuation-${row.id}`); expect(writes).toHaveBeenCalledTimes(2);
      await act(async () => { expect(await submit()).toBe(false); await flush(); }); expect(writes).toHaveBeenCalledTimes(2);
    } else {
      expect(container.textContent).toContain('Step 2 of 2');
      expect(container.textContent).toContain(outcome === 'failed' ? 'did not run successfully' : 'was not approved');
      expect(container.textContent).not.toContain('was not submitted');
      await act(async () => { expect(await submit()).toBe(true); await flush(); });
      expect(writes).toHaveBeenCalledTimes(3); expect(lastPayload.createsSubject).toBe(false);
      expect(lastPayload.batches[0].every(call => !['createRole', 'createGroup'].includes(interfaces.membershipAuthority.parseTransaction({ data: call.data }).name))).toBe(true);
      expect(latest.continuations[0].configurationHistory).toHaveLength(1);
    }
  });
  it.each(['failed', 'rejected'])('retains a %s creation and requires an explicit new review for another creation vote', async outcome => {
    initial.perms = { DD_VOTE: true }; await render(); await act(async () => { await submit(); await flush(); });
    const row = latest.continuations[0];
    if (outcome === 'failed') queryRows[0].executionFailed = true; else queryRows[0].isValid = false;
    await press(`role-continuation-${row.id}`); expect(writes).toHaveBeenCalledTimes(1);
    expect(byId(`role-continuation-restart-${row.id}`)).toBeDefined();
    await press(`role-continuation-restart-${row.id}`); expect(formValue.continuationId).toBeUndefined();
    expect(writes).toHaveBeenCalledTimes(1); expect(container.textContent).toContain('Saved for the second vote');
  });
  it('requires fresh retry after an unavailable execution receipt and suppresses late work after close', async () => {
    initial.perms = { DD_VOTE: true }; await render(); await act(async () => { await submit(); await flush(); });
    const row = latest.continuations[0]; await executeCreation();
    const receipt = receipts[hashOf('d')]; delete receipts[hashOf('d')];
    await press(`role-continuation-${row.id}`); expect(container.textContent).not.toContain('Step 2 of 2');
    receipts[hashOf('d')] = receipt; await press(`role-continuation-${row.id}`);
    expect(container.textContent).toContain('Step 2 of 2');
    await act(async () => { closeForm(); await flush(); }); expect(writes).toHaveBeenCalledTimes(1);
  });
  it('preserves the original description draft and honors an explicitly cleared second-stage description after re-review', async () => {
    initial.description = 'Original details'; initial.perms = { DD_VOTE: true };
    await render(); await act(async () => { await submit(); await flush(); });
    const row = latest.continuations[0]; expect(row.originalForm.description).toBe('Original details');
    await executeCreation(); await press(`role-continuation-${row.id}`);
    await update({ description: '' });
    let built; await act(async () => { built = await latest.prepareReviewedRole(formValue); });
    expect(built.submittable.ok).toBe(true);
    const rename = interfaces.membershipAuthority.parseTransaction({ data: built.batch[0].data });
    expect(rename.name).toBe('renameSubject'); expect(rename.args[2]).toBe(constants.HashZero);
    expect(latest.continuations[0].originalForm.description).toBe('Original details');
  });
  it('preserves email, vouch, project and sponsorship choices until the actual-ID configuration uses real core encoding', async () => {
    initial = { ...initial, description: 'All requested settings', join: { domains: ['example.org'] }, emailInvites: ['person@example.org'],
      vouching: { enabled: true, quorum: 2, selfVouch: true }, projectPerms: [{ projectId: '4', mask: 0, inheritGlobal: false }],
      sponsorship: { enabled: true, capNative: '0.1', epochDays: 1, supportPasskeys: true } };
    await render(); await act(async () => { expect(await submit()).toBe(true); await flush(); });
    const row = latest.continuations[0]; expect(row.form.emailInvites).toEqual(initial.emailInvites);
    expect(live.ipfs.addToIpfs.mock.calls.every(([json]) => !json.includes('person@example.org'))).toBe(true);
    await executeCreation(); await press(`role-continuation-${row.id}`);
    let built; await act(async () => { built = await latest.prepareReviewedRole(formValue); });
    expect(built.plan.status).toBe('ready');
    const calls = built.batch.map(call => {
      const key = Object.keys(contracts).find(key => contracts[key] === call.target); return { key, parsed: interfaces[key].parseTransaction({ data: call.data }) };
    });
    expect(calls.some(call => call.parsed.name === 'configureVouchAttestor' && call.parsed.args[2].toString() === createdId)).toBe(true);
    expect(calls.some(call => call.parsed.name === 'setPerm' && call.parsed.args[2] !== constants.HashZero)).toBe(true);
    expect(calls.some(call => call.parsed.name === 'setActiveAllowlist')).toBe(true); expect(calls.some(call => call.parsed.name === 'setBudget')).toBe(true);
    expect(calls.some(call => call.parsed.name === 'setRulesBatch')).toBe(true); expect(writes).toHaveBeenCalledTimes(1);
  });
  it('recovers an uncertain creation without sending it again, including reopen', async () => {
    initial.perms = { DD_VOTE: true }; uncertainty = true;
    await render(); await act(async () => { expect(await submit()).toBe(false); await flush(); });
    const row = latest.continuations[0]; expect(['uncertain', 'pending']).toContain(row.creation.status); expect(formValue.continuationId).toBe(row.id);
    await act(async () => { expect(await submit()).toBe(false); await flush(); }); expect(writes).toHaveBeenCalledTimes(1);
    await render(null); await render(); await press(`role-continuation-${row.id}`);
    expect(live.services.txManager.reconcileSubmission).toHaveBeenCalled(); expect(writes).toHaveBeenCalledTimes(1);
    await executeCreation(); uncertainty = false; await press(`role-continuation-${row.id}`);
    expect(container.textContent).toContain('Step 2 of 2'); expect(writes).toHaveBeenCalledTimes(1);
  });
  async function uncertainStage(stage) {
    initial.perms = { DD_VOTE: true }; initial.description = 'Retain original settings';
    await render();
    if (stage === 'configuration') {
      await act(async () => { expect(await submit()).toBe(true); await flush(); });
      await executeCreation(); await press(`role-continuation-${latest.continuations[0].id}`);
    }
    uncertainty = true; recoveryAvailable = false;
    await act(async () => { expect(await submit()).toBe(false); await flush(); });
    recoveryAvailable = true;
    const row = latest.continuations[0];
    expect(row[stage].submission.recovery.scope.intentKey).toBe(row[stage].expectedIntentKey);
    expect(row[stage].submission.recovery.scope.accountAddress).toBe(account);
    expect(row[stage].transactionHash).toBeUndefined();
    expect(journal.read()).not.toBeNull();
    return row;
  }
  it.each(['creation', 'configuration'])('durably saves %s recovery before journal clear followed by a source failure, reload and successful retry', async stage => {
    const row = await uncertainStage(stage), expectedWrites = writes.mock.calls.length;
    if (stage === 'creation') live.authorityObservation.refetch.mockRejectedValueOnce(new Error('Graph endpoint unavailable'));
    else queryFailure = `${contracts.hybridVoting}-8`;
    await act(async () => { await expect(latest.resolveContinuation(row.id)).rejects.toThrow(); await flush(); });
    expect(journal.read()).toBeNull(); // Real journal was destructively cleared.
    const saved = latest.continuations[0];
    expect(saved[stage].transactionHash).toMatch(/^0x[\da-f]{64}$/);
    expect(saved[stage].submission.recovery.attemptId).toBe(row[stage].submission.recovery.attemptId);
    expect(saved.originalForm.description).toBe('Retain original settings');
    await render(null); queryFailure = false; await render();
    await press(`role-continuation-${row.id}`);
    expect(writes).toHaveBeenCalledTimes(expectedWrites);
    if (stage === 'creation') { await executeCreation(); await press(`role-continuation-${row.id}`); expect(container.textContent).toContain('Step 2 of 2'); }
    else { executeConfiguration(); await press(`role-continuation-${row.id}`); expect(container.textContent).toContain('passed and ran successfully'); }
    expect(writes).toHaveBeenCalledTimes(expectedWrites);
  });
  it.each(['creation', 'configuration'])('recovers %s from its own recorded identity after another surface cleared the manager journal first', async stage => {
    const row = await uncertainStage(stage), count = writes.mock.calls.length;
    const earlierChecks = live.services.txManager.reconcileSubmission.mock.calls.length;
    const recovered = await live.services.txManager.reconcileSubmission(journal.read());
    expect(recovered.outcome.status).toBe('succeeded'); expect(journal.read()).toBeNull();
    expect(latest.continuations[0][stage].transactionHash).toBeUndefined();
    await render(null); await render();
    await press(`role-continuation-${row.id}`);
    expect(latest.continuations[0][stage].transactionHash).toBe(recovered.receipt.transactionHash);
    expect(live.services.txManager.reconcileSubmission).toHaveBeenCalledTimes(earlierChecks + 1);
    expect(writes).toHaveBeenCalledTimes(count);
  });
  it.each(['creation', 'configuration'])('survives %s teardown after actual journal removal but before reconciliation returns its receipt', async stage => {
    const row = await uncertainStage(stage), count = writes.mock.calls.length;
    let release, pending;
    const gate = new Promise(resolve => { release = resolve; });
    const reconcile = live.services.txManager.reconcileSubmission.getMockImplementation();
    live.services.txManager.reconcileSubmission.mockImplementationOnce(async submission => { const result = await reconcile(submission); await gate; return result; });
    await act(async () => { pending = latest.resolveContinuation(row.id).catch(error => error); await flush(); });
    expect(journal.read()).toBeNull(); expect(latest.continuations[0][stage].transactionHash).toBeUndefined();
    await render(null); await render(); await press(`role-continuation-${row.id}`);
    expect(latest.continuations[0][stage].transactionHash).toMatch(/^0x[\da-f]{64}$/);
    await act(async () => { release(); expect((await pending).name).toBe('AbortError'); await flush(); });
    expect(writes).toHaveBeenCalledTimes(count);
  });
  it.each(['creation', 'configuration'])('retains a hashless %s send and resolves it with only core bounded exact-nonce recovery', async stage => {
    lostAck = true;
    const row = await uncertainStage(stage), count = writes.mock.calls.length;
    expect(row[stage].submission.txHash).toBeUndefined(); expect(row[stage].submission.recovery.fromBlock).toBe('100');
    await render(null); await render(); await press(`role-continuation-${row.id}`);
    expect(latest.continuations[0][stage].transactionHash).toMatch(/^0x[\da-f]{64}$/);
    expect(live.services.txManager.publicClient.getBlock.mock.calls.filter(([arg]) => arg.includeTransactions).length).toBeLessThanOrEqual(16);
    expect(writes).toHaveBeenCalledTimes(count); expect(journal.read()).toBeNull();
  });
  it.each(['creation', 'configuration'])('keeps %s unknown after receipt unavailability without allowing a duplicate', async stage => {
    const row = await uncertainStage(stage), count = writes.mock.calls.length;
    const receipt = Object.values(receipts).at(-1); delete receipts[receipt.transactionHash];
    await press(`role-continuation-${row.id}`);
    expect(journal.read()).not.toBeNull(); expect(latest.continuations[0][stage].status).toBe('uncertain');
    await act(async () => { expect(await submit()).toBe(false); await flush(); });
    expect(writes).toHaveBeenCalledTimes(count); expect(container.textContent).not.toContain('Review a new creation vote');
    receipts[receipt.transactionHash] = receipt; await press(`role-continuation-${row.id}`);
    expect(journal.read()).toBeNull(); expect(writes).toHaveBeenCalledTimes(count);
  });
  it.each(['creation', 'configuration'])('allows an explicit rereview after confirmed %s submission revert while retaining the subject and original draft', async stage => {
    if (stage === 'configuration') {
      initial.perms = { DD_VOTE: true }; await render(); await act(async () => { await submit(); await flush(); });
      await executeCreation(); await press(`role-continuation-${latest.continuations[0].id}`);
    }
    uncertainty = true; submissionFailure = 'revert'; recoveryAvailable = false;
    if (stage === 'creation') { initial.perms = { DD_VOTE: true }; await render(); }
    await act(async () => { expect(await submit()).toBe(false); await flush(); });
    recoveryAvailable = true;
    const row = latest.continuations[0];
    await press(`role-continuation-${row.id}`);
    expect(journal.read()).toBeNull(); expect(latest.continuations[0][stage]).toMatchObject({ status: 'failed', failureKind: 'submission', transportOutcome: 'failed' });
    uncertainty = false; submissionFailure = null;
    if (stage === 'creation') await press(`role-continuation-restart-${row.id}`);
    else expect(container.textContent).toContain('Step 2 of 2');
    await act(async () => { expect(await submit()).toBe(true); await flush(); });
    expect(lastPayload.createsSubject).toBe(stage === 'creation');
    if (stage === 'configuration') expect(latest.continuations[0].configurationHistory[0].failureKind).toBe('submission');
  });
  it.each(['false', 'scope-guard', 'retain-guard', 'pre-send'])('keeps %s before transport retryable with explicit new creation review', async mode => {
    initial.perms = { DD_VOTE: true }; callbackMode = mode; retainFailure = mode === 'retain-guard'; submissionFailure = mode === 'pre-send' ? mode : null;
    await render(); await act(async () => { expect(await submit()).toBe(false); await flush(); });
    expect(writes).not.toHaveBeenCalled(); expect(journal.read()).toBeNull();
    const row = latest.continuations[0]; expect(row.creation.status).toBe('failed');
    expect(container.textContent).toContain('not submitted successfully');
    callbackMode = null; retainFailure = false; submissionFailure = null;
    await press(`role-continuation-restart-${row.id}`);
    await act(async () => { expect(await submit()).toBe(true); await flush(); });
    expect(writes).toHaveBeenCalledOnce(); expect(latest.continuations).toHaveLength(2);
  });
  it('retains an unclassified callback exception as uncertain even when there is no shared journal', async () => {
    callbackMode = 'unknown-throw'; initial.perms = { DD_VOTE: true }; await render();
    await act(async () => { expect(await submit()).toBe(false); await flush(); });
    expect(journal.read()).toBeNull(); expect(latest.continuations[0].creation.status).toBe('uncertain');
    expect(container.textContent).not.toContain('Review a new creation vote');
    callbackMode = null; await act(async () => { expect(await submit()).toBe(false); await flush(); });
    expect(writes).not.toHaveBeenCalled();
  });
  it('reopens the same confirmed subject after a configuration pre-send refusal and explicitly retries its saved settings', async () => {
    initial.perms = { DD_VOTE: true }; await render(); await act(async () => { await submit(); await flush(); });
    const id = latest.continuations[0].id; await executeCreation(); await press(`role-continuation-${id}`);
    submissionFailure = 'pre-send'; await act(async () => { expect(await submit()).toBe(false); await flush(); });
    expect(latest.continuations[0].configuration).toMatchObject({ status: 'failed', transportOutcome: 'not-submitted' });
    expect(container.textContent).toContain('configuration vote was not submitted successfully');
    submissionFailure = null; await press(`role-continuation-${id}`);
    expect(container.textContent).toContain('Step 2 of 2');
    await act(async () => { expect(await submit()).toBe(true); await flush(); });
    expect(writes).toHaveBeenCalledTimes(2); expect(lastPayload.createsSubject).toBe(false);
  });
  it.each(['creation', 'configuration'])('retries %s after the actual EOA manager records submitting then receives wallet cancellation', async stage => {
    initial.perms = { DD_VOTE: true }; await render();
    if (stage === 'configuration') {
      await act(async () => { await submit(); await flush(); }); await executeCreation();
      await press(`role-continuation-${latest.continuations[0].id}`);
    }
    const count = writes.mock.calls.length;
    const signer = { getAddress: async () => account, getChainId: async () => 100,
      getTransactionCount: async () => 12, provider: { network: { chainId: 100 } } };
    const manager = new TransactionManager(signer, { accountAddress: account, chainId: 100,
      publicClient: live.services.txManager.publicClient, submissionContext: { orgId },
      submissionStorage: window.localStorage, submissionLocks: fakeBrowserLocks() });
    let reject = true;
    const wallet = vi.fn(async (...args) => {
      expect(manager.getPendingSubmission()).toMatchObject({ phase: 'submitting', kind: 'transaction', nonce: '12' });
      if (reject) throw Object.assign(new Error('User declined'), { code: 'ACTION_REJECTED' });
      writes(); const receipt = newProposal(contract, 'createProposal', args.slice(0, -1));
      return { hash: receipt.transactionHash, wait: async () => receipt };
    });
    const contract = { address: contracts.hybridVoting, interface: interfaces.hybridVoting,
      estimateGas: { createProposal: async () => utils.parseUnits('1', 5) }, createProposal: wallet };
    const factory = { createWritable: () => contract };
    live.services = { ...live.services, txManager: manager, voting: guardService(new VotingService(factory, manager, live.ipfs), () => {}) };
    await render();
    await act(async () => { expect(await submit()).toBe(false); await flush(); });
    const row = latest.continuations.at(-1);
    expect(row[stage]).toMatchObject({ status: 'failed', transportOutcome: 'not-submitted', submission: { phase: 'submitting' } });
    expect(manager.getPendingSubmission()).toBeNull(); expect(writes).toHaveBeenCalledTimes(count); expect(wallet).toHaveBeenCalledOnce();
    reject = false;
    await press(`role-continuation-${stage === 'creation' ? 'restart-' : ''}${row.id}`);
    await act(async () => { expect(await submit()).toBe(true); await flush(); });
    expect(writes).toHaveBeenCalledTimes(count + 1); expect(wallet).toHaveBeenCalledTimes(2);
    expect(lastPayload.createsSubject).toBe(stage === 'creation'); expect(manager.getPendingSubmission()).toBeNull();
  });
  it.each(['creation', 'configuration'])('explicitly retries %s after the real manager guard fails with a submitting journal before the wallet call', async stage => {
    initial.perms = { DD_VOTE: true }; await render();
    if (stage === 'configuration') {
      await act(async () => { await submit(); await flush(); }); await executeCreation();
      await press(`role-continuation-${latest.continuations[0].id}`);
    }
    const count = writes.mock.calls.length;
    const signer = { getAddress: async () => account, getChainId: async () => 100,
      getTransactionCount: async () => 12, provider: { network: { chainId: 100 } } };
    let rejectGuard = true, guardObserved = false;
    const manager = new TransactionManager(signer, { accountAddress: account, chainId: 100,
      publicClient: live.services.txManager.publicClient, submissionContext: { orgId },
      submissionStorage: window.localStorage, submissionLocks: fakeBrowserLocks(),
      scopeGuard: () => {
        if (rejectGuard && manager.getPendingSubmission()?.phase === 'submitting') {
          guardObserved = true; throw new Error('Account scope changed before wallet call');
        }
      } });
    const wallet = vi.fn(async (...args) => {
      writes(); const receipt = newProposal(contract, 'createProposal', args.slice(0, -1));
      return { hash: receipt.transactionHash, wait: async () => receipt };
    });
    const contract = { address: contracts.hybridVoting, interface: interfaces.hybridVoting,
      estimateGas: { createProposal: async () => utils.parseUnits('1', 5) }, createProposal: wallet };
    live.services = { ...live.services, txManager: manager,
      voting: guardService(new VotingService({ createWritable: () => contract }, guardService(manager, () => {}), live.ipfs), () => {}) };
    await render();
    await act(async () => { expect(await submit()).toBe(false); await flush(); });
    const row = latest.continuations.at(-1);
    expect(guardObserved).toBe(true); expect(wallet).not.toHaveBeenCalled();
    expect(row[stage]).toMatchObject({ status: 'failed', transportOutcome: 'not-submitted', submission: { phase: 'submitting' } });
    expect(manager.getPendingSubmission()).toBeNull(); expect(writes).toHaveBeenCalledTimes(count);
    rejectGuard = false;
    await render(null); await render();
    await press(`role-continuation-${stage === 'creation' ? 'restart-' : ''}${row.id}`);
    await act(async () => { expect(await submit()).toBe(true); await flush(); });
    expect(writes).toHaveBeenCalledTimes(count + 1); expect(wallet).toHaveBeenCalledOnce();
    expect(lastPayload.createsSubject).toBe(stage === 'creation'); expect(manager.getPendingSubmission()).toBeNull();
  });
  it.each(['creation', 'configuration'])('restores storage and explicitly retries %s when exact intent binding fails before actual manager entry', async stage => {
    initial.perms = { DD_VOTE: true }; await render();
    if (stage === 'configuration') {
      await act(async () => { await submit(); await flush(); }); await executeCreation();
      await press(`role-continuation-${latest.continuations[0].id}`);
    }
    const count = writes.mock.calls.length, calls = live.services.txManager.execute.mock.calls.length;
    const setItem = window.localStorage.setItem;
    let failed = false;
    window.localStorage.setItem = (key, value) => {
      if (!failed && key.startsWith('poa:roleContinuation:') && JSON.parse(value).some(row => row[stage]?.expectedIntentKey && row[stage]?.status === 'submitting')) {
        failed = true; throw new Error('Exact intent binding storage failure');
      }
      return setItem(key, value);
    };
    await act(async () => { expect(await submit()).toBe(false); await flush(); });
    expect(failed).toBe(true); expect(writes).toHaveBeenCalledTimes(count);
    expect(live.services.txManager.execute).toHaveBeenCalledTimes(calls); expect(journal.read()).toBeNull();
    const row = latest.continuations.at(-1); expect(row[stage]).toMatchObject({ status: 'failed', transportStarted: false, transportOutcome: 'not-submitted' });
    window.localStorage.setItem = setItem;
    await render(null); await render();
    await press(`role-continuation-${stage === 'creation' ? 'restart-' : ''}${row.id}`);
    await act(async () => { expect(await submit()).toBe(true); await flush(); });
    expect(writes).toHaveBeenCalledTimes(count + 1); expect(lastPayload.createsSubject).toBe(stage === 'creation');
  });
  it.each(['creation', 'configuration'])('retains the exact %s UserOp and nonce independently, including the manager own self-funded retry callback', async stage => {
    initial.perms = { DD_VOTE: true }; await render();
    if (stage === 'configuration') {
      await act(async () => { await submit(); await flush(); }); await executeCreation(); await press(`role-continuation-${latest.continuations[0].id}`);
    }
    live.services.txManager.execute.mockImplementationOnce(async (contract, method, args, executionOptions) => {
      const release = await journal.acquire(), intentKey = roleSubmissionIntent(contract, method, args, executionOptions);
      try {
        for (const computedHash of [hashOf('a'), hashOf('f')]) {
          journal.begin(intentKey); journal.signing();
          const saved = journal.write({ phase: 'submitting', chainId: 100, entryPoint: ENTRY_POINT_ADDRESS,
            sender: account, nonce: '123456789012345678901234', computedHash });
          await executionOptions.onSubmitted({ ...saved, signature: 'SECRET_SIGNATURE', userOperation: { signature: 'SECRET_NESTED' } });
          if (computedHash === hashOf('a')) expect(journal.clear(saved)).toBe(true); // Manager positively refused admission, then rebuilt.
        }
        return { success: false, error: { category: 'submission_unknown' } };
      } finally { await release(); }
    });
    await act(async () => { expect(await submit()).toBe(false); await flush(); });
    const row = latest.continuations[0]; expect(row[stage].status).toBe('uncertain');
    expect(row[stage].submission).toMatchObject({ computedHash: hashOf('f'), sender: account, nonce: '123456789012345678901234' });
    expect(row[stage].submissionHistory[0].computedHash).toBe(hashOf('a'));
    if (stage === 'configuration') expect(row.creation.submission.kind).toBe('transaction');
    expect([...stored.values()].join()).not.toContain('SECRET_');
    await render(null); await render(); expect(latest.continuations[0][stage].submission.computedHash).toBe(hashOf('f'));
  });
  it('captures completion before later page work throws and does not downgrade a submitted vote', async () => {
    latePageFailure = true; initial.perms = { DD_VOTE: true }; await render();
    await act(async () => { expect(await submit()).toBe(false); await flush(); });
    expect(latest.continuations[0].creation).toMatchObject({ status: 'pending', transportOutcome: 'succeeded', proposalId: '7' });
    expect(journal.read()).toBeNull(); await render(null); await render();
    await press(`role-continuation-${latest.continuations[0].id}`); expect(writes).toHaveBeenCalledOnce();
  });
  it('uses the mounted proposal form guard to mark a ticket saved immediately before account change as proven unsubmitted', async () => {
    initial.perms = { DD_VOTE: true }; await render(<ProposalHarness />);
    await act(async () => { await latest.reviewRoleConfiguration(proposalForm.proposal.roleFormV2); });
    scopeChangeAfterTicket = true;
    await act(async () => { expect(await submit()).toBe(false); await flush(); });
    expect(writes).not.toHaveBeenCalled(); expect(journal.read()).toBeNull(); expect(latest.continuations).toEqual([]);
    expect(readRoleContinuations(window.localStorage, capturedTicket.scope)[0].creation).toMatchObject({ status: 'failed', transportOutcome: 'not-submitted' });
    scopeChangeAfterTicket = false; live.auth = { ...live.auth, accountAddress: account }; await render(<ProposalHarness />);
    expect(byId(`role-continuation-restart-${capturedTicket.id}`)).toBeDefined();
  });
  it('handles the actual proposal form primitive-false callback without discarding its original settings', async () => {
    callbackMode = 'false'; initial.perms = { DD_VOTE: true }; await render(<ProposalHarness />);
    await act(async () => { await latest.reviewRoleConfiguration(proposalForm.proposal.roleFormV2); });
    await act(async () => { expect(await submit()).toBe(false); await flush(); });
    expect(writes).not.toHaveBeenCalled(); expect(latest.continuations[0].creation.status).toBe('failed');
    expect(proposalForm.proposal.roleFormV2.name).toBe(initial.name); expect(proposalForm.proposal.roleFormV2.perms).toEqual(initial.perms);
    expect(live.toast.mock.calls.some(([message]) => message.status === 'success')).toBe(false);
  });
  it('blocks duplicate clicks through the actual mounted proposal form submit guard', async () => {
    await render(<ProposalHarness />);
    await act(async () => { await latest.reviewRoleConfiguration(proposalForm.proposal.roleFormV2); });
    await act(async () => { expect((await Promise.all([submit(), submit()])).sort()).toEqual([false, true]); await flush(); });
    expect(writes).toHaveBeenCalledOnce(); expect(latest.continuations).toHaveLength(1);
  });
  it('locks duplicate submit and status clicks before React can rerender', async () => {
    initial.perms = { DD_VOTE: true }; await render();
    await act(async () => { const results = await Promise.all([submit(), submit()]); expect(results.sort()).toEqual([false, true]); await flush(); });
    expect(writes).toHaveBeenCalledOnce();
    const button = byId(`role-continuation-${latest.continuations[0].id}`), oldCount = live.query.mock.calls.filter(([doc]) => /RoleContinuation/.test(doc)).length;
    await act(async () => { await Promise.all([button.press(), button.press()]); await flush(); });
    expect(live.query.mock.calls.filter(([doc]) => /RoleContinuation/.test(doc))).toHaveLength(oldCount + 1);
    expect(writes).toHaveBeenCalledOnce();
  });
  it.each(['account', 'chain', 'intent', 'organization', 'authority'])('never adopts a mismatched %s journal as this saved role operation', async mismatch => {
    const row = await uncertainStage('creation');
    const actual = journal.read();
    const bad = structuredClone(actual);
    if (mismatch === 'account') bad.accountAddress = contracts.executor;
    if (mismatch === 'chain') bad.chainId = 42161;
    if (mismatch === 'intent' || mismatch === 'authority') bad.recovery.scope.intentKey = hashOf('f');
    if (mismatch === 'organization') bad.orgId = hashOf('e');
    const key = roleContinuationKey(row.scope), records = JSON.parse(stored.get(key)); delete records[0].creation.submission;
    stored.set(key, JSON.stringify(records)); live.services.txManager.getPendingSubmission.mockReturnValue(bad);
    live.services.txManager.reconcileSubmission.mockClear();
    await render(null); await render(); await press(`role-continuation-${row.id}`);
    expect(live.services.txManager.reconcileSubmission).not.toHaveBeenCalled();
    expect(latest.continuations[0].creation.transactionHash).toBeUndefined(); expect(writes).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain('Step 2 of 2');
  });
  it.each(['wrong account', 'wrong org', 'wrong event', 'wrong proposal', 'removed receipt', 'missing indexed subject'])('keeps %s evidence from authorizing a continuation', async mode => {
    initial.perms = { DD_VOTE: true }; await render(); await act(async () => { await submit(); await flush(); });
    const row = latest.continuations[0]; await executeCreation();
    if (mode === 'wrong account') { live.auth = { ...live.auth, accountAddress: contracts.executor }; await render(); expect(latest.continuations).toEqual([]); }
    else if (mode === 'wrong org') { live.po = { ...live.po, orgId: hashOf('f') }; await render(); expect(latest.continuations).toEqual([]); }
    else {
      if (mode === 'wrong event') receipts[hashOf('d')].logs[0].address = contracts.executor;
      if (mode === 'wrong proposal') queryRows[0].batchExecutions[0].proposalId = '99';
      if (mode === 'removed receipt') receipts[hashOf('d')].logs[0].removed = true;
      if (mode === 'missing indexed subject') options.subjects.pop();
      await press(`role-continuation-${row.id}`); expect(container.textContent).not.toContain('Step 2 of 2');
    }
    expect(writes).toHaveBeenCalledTimes(1);
  });
  it('cancels a direct saved-status check on page teardown, stops later receipt work and permits reopen', async () => {
    initial.perms = { DD_VOTE: true }; await render(); await act(async () => { await submit(); await flush(); });
    const row = latest.continuations[0]; await executeCreation();
    let release, pending;
    const gate = new Promise(resolve => { release = resolve; });
    f.provider.getTransaction.mockImplementationOnce(async hash => { await gate; return txs[hash]; });
    await act(async () => { pending = byId(`role-continuation-${row.id}`).press(); await flush(); });
    await render(null);
    const callsAtClose = [f.provider.getTransaction.mock.calls.length, f.provider.getTransactionReceipt.mock.calls.length, f.provider.getBlock.mock.calls.length];
    await act(async () => { release(); await pending; await flush(); });
    expect([f.provider.getTransaction.mock.calls.length, f.provider.getTransactionReceipt.mock.calls.length, f.provider.getBlock.mock.calls.length]).toEqual(callsAtClose);
    expect(container.textContent).toBe(''); expect(writes).toHaveBeenCalledTimes(1);
    await render(); await press(`role-continuation-${row.id}`);
    expect(container.textContent).toContain('Step 2 of 2'); expect(writes).toHaveBeenCalledTimes(1);
  });
  it('edits require a fresh second-stage review; malformed saved records and storage failure never permit a write', async () => {
    initial.perms = { DD_VOTE: true }; await render(); await act(async () => { await submit(); await flush(); });
    const row = latest.continuations[0]; await executeCreation(); await press(`role-continuation-${row.id}`);
    const oldPrepare = latest.prepareReviewedRole;
    await expect(oldPrepare({ ...formValue, name: 'Unreviewed' })).rejects.toThrow();
    await update({ name: 'Reviewed edit' }); let built;
    await act(async () => { built = await latest.prepareReviewedRole(formValue); }); expect(built.plan.status).toBe('ready');
    const key = [...stored.keys()][0]; const data = JSON.parse(stored.get(key)); data[0].scope.account = contracts.executor; stored.set(key, JSON.stringify(data));
    await expect(latest.resolveContinuation(row.id)).rejects.toThrow('unavailable'); expect(writes).toHaveBeenCalledTimes(1);
    await render(null); initial = { ...initial, name: 'Other draft' }; await render();
    window.localStorage.setItem = () => { throw new Error('Storage unavailable'); };
    await act(async () => { expect(await submit()).toBe(false); await flush(); }); expect(writes).toHaveBeenCalledTimes(1);
    expect(roleContinuationKey(null)).toBeNull();
  });
});
