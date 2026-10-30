import { expect, vi } from 'vitest';
import { constants, providers, utils } from 'ethers';
import { parse } from 'graphql';
import { getAbi } from '@poa-box/core/contracts';
import { composeSubjectId } from '@poa-box/core/authority/ids';
import { buildRoleFormBatch } from '@/lib/accessV2/roleFormBatch';
import { roleFormRequest } from '@/lib/accessV2/roleFormRequest';
import { createRoleOperationHost } from '@/lib/accessV2/roleOperationHost';
import { bytes32ToCidV0 } from '@poa-box/core/encoding/cid';
import { readAuthoritySnapshot } from '@poa-box/core/reads/authority';
import { ContractFactory } from '@/services/web3/core/ContractFactory';

const address = digit => `0x${digit.repeat(40)}`;
const contracts = { membershipAuthority: address('1'), executor: address('2'), taskManager: address('3'),
  hybridVoting: address('4'), registry: address('5'), paymaster: address('6'), email: address('7') };
const account = address('8'), otherExecutor = address('9');
const orgId = `0x${'ab'.repeat(32)}`, hash = `0x${'cd'.repeat(32)}`, root = `0x${'ef'.repeat(32)}`;
const roleId = composeSubjectId(contracts.membershipAuthority, '1');
const groupId = composeSubjectId(contracts.membershipAuthority, '2');
const scope = { chainId: 100, orgId, contract: contracts.membershipAuthority, contracts };
const coverage = { status: 'complete', receivedKeys: [], missingIds: [], failedIds: [], issues: [] };
const source = { ...scope, endpoint: 'https://index.invalid', method: 'authority-snapshot', indexed: true,
  snapshot: 'pinned', block: { number: '123', hash, timestamp: '1000' }, observedAt: 1001 };
const abiNames = { membershipAuthority: 'MembershipAuthority', executor: 'Executor', taskManager: 'TaskManagerNew',
  hybridVoting: 'HybridVotingNew', registry: 'OrgRegistry', paymaster: 'PaymasterHub', email: 'ZkEmailInvites' };
const interfaces = Object.fromEntries(Object.entries(abiNames).map(([key, name]) => [key, new utils.Interface(getAbi(name))]));

// GraphQL responses contain only requested fields, including nested metadata.
// An omitted timestamp in a production document must stay omitted in this fixture.
function selectedResponse(document, response) {
  const operation = parse(document).definitions.find(definition => definition.kind === 'OperationDefinition');
  const select = (selectionSet, value) => {
    if (value == null) return value;
    if (Array.isArray(value)) return value.map(row => select(selectionSet, row));
    return Object.fromEntries(selectionSet.selections.flatMap(field => {
      const name = field.name.value;
      if (!(name in value)) return [];
      return [[field.alias?.value || name, field.selectionSet ? select(field.selectionSet, value[name]) : value[name]]];
    }));
  };
  return select(operation.selectionSet, response);
}

/** Real ethers contracts encode and decode every call using the installed ABIs.
 * Only the transport is mocked; an absent method or wrong tuple cannot pass. */
function fixture(options = {}) {
  const calls = [];
  class OfflineProvider extends providers.BaseProvider {
    constructor() { super({ name: 'offline', chainId: 100 }); this.connection = { url: 'https://rpc.invalid' }; }
    async detectNetwork() { return { name: 'offline', chainId: options.chainId ?? 100 }; }
    async perform(method, params) {
      if (method !== 'call') throw new Error(`Unexpected offline RPC: ${method}`);
      const moduleKey = Object.keys(contracts).find(key => contracts[key] === params.transaction.to.toLowerCase());
      const iface = interfaces[moduleKey];
      const parsed = iface.parseTransaction(params.transaction);
      const call = { module: moduleKey, method: parsed.name, args: parsed.args, ...params };
      calls.push(call);
      await options.beforeCall?.(call);
      if (options.failCall === `${moduleKey}.${parsed.name}`) throw new Error('RPC unavailable');
      const replies = {
        membershipAuthority: {
          executor: [options.authorityExecutor || contracts.executor], orgId: [options.authorityOrgId || orgId], subjectCount: [String(options.subjects?.length ?? 2)],
          getSubject: () => [{ kind: options.subjects?.find(row => row.subjectId === parsed.args[0].toString())?.kind === 'Role' || parsed.args[0].toString() === roleId ? 0 : 1,
            name: options.subjects?.find(row => row.subjectId === parsed.args[0].toString())?.name || (parsed.args[0].toString() === roleId ? 'Members' : 'Team'), metadataCID: constants.HashZero,
            imageURI: '', maxMembers: options.subjects?.find(row => row.subjectId === parsed.args[0].toString())?.maxMembers || 0, exists: true }],
          groupMemberRoles: [[roleId]], userSubjects: () => [!options.accountAcceptance || options.accountAcceptance(parsed.args[0]) ? [roleId] : []],
          memberCount: [options.memberCount || 0], getStatus: [options.acceptedInSubject || false, false, 0, 0],
        },
        taskManager: { getLensData: [options.lensPayload ?? utils.defaultAbiCoder.encode(['address'], [options.taskExecutor || contracts.executor])] },
        hybridVoting: { executor: [options.hybridExecutor || contracts.executor], getClasses: [[
          { strategy: 0, slicePct: 80, quadratic: false, minBalance: '0', asset: constants.AddressZero, hatIds: [roleId] },
          { strategy: 1, slicePct: 20, quadratic: true, minBalance: '123456789012345678901', asset: account, hatIds: [groupId] },
        ]] },
        registry: { getOrgMetadataAdminHat: [roleId], setOrgMetadataAdminHat: [] },
        paymaster: { getOrgConfig: [{ adminHatId: roleId, operatorHatId: roleId, paused: false, registeredAt: 1, bannedFromSolidarity: false }], setBudget: [], getBudget: [{ capPerEpoch: '123456789012345678901', usedInEpoch: '12', epochLen: options.epochLen ?? 3600, epochStart: 900 }] },
        email: { executor: [options.emailExecutor || contracts.executor], domainVerifier: [account], emailVerifier: [account],
          dkimRegistry: [account], accountRegistry: [account], universalFactory: [account], isEmailRegistered: [false],
          merkleRoot: [options.emailRoot ?? root], allowlistCid: [hash] },
        executor: { hats: [options.executorAuthority || contracts.membershipAuthority], isAuthorizedHatMinter: [options.minterAuthorized ?? true] },
      };
      const reply = replies[moduleKey][parsed.name];
      if (reply === undefined) throw new Error(`Unexpected ABI call: ${moduleKey}.${parsed.name}`);
      return iface.encodeFunctionResult(parsed.name, typeof reply === 'function' ? reply() : reply);
    }
  }
  const provider = new OfflineProvider();
  provider.getBlock = vi.fn(async () => ({ number: 123, hash, timestamp: 1000 }));
  const currentScope = structuredClone(scope);
  if (options.withoutTask) delete currentScope.contracts.taskManager;
  const indexedResponse = { _meta: { block: { number: 123, hash, timestamp: 1000 } }, organization: { id: orgId,
    membershipAuthority: { id: contracts.membershipAuthority }, executorContract: { id: contracts.executor },
    hybridVoting: { id: contracts.hybridVoting }, taskManager: { id: contracts.taskManager }, zkEmailInvites: { id: contracts.email } },
  poaManagerContracts: [{ orgRegistryProxy: contracts.registry, paymasterHubProxy: contracts.paymaster }], proposals: options.proposals || [] };
  const query = vi.fn(async (document, variables) => selectedResponse(document, authorityResponse(indexedResponse, input.snapshot.data, variables)));
  const input = { readFactory: new ContractFactory(null, provider), scope: currentScope, executor: contracts.executor,
    snapshot: { source: structuredClone(source), coverage, data: { subjects: options.subjects || [{ subjectId: roleId, kind: 'Role', name: 'Members' },
      { subjectId: groupId, kind: 'Group', name: 'Team' }], groupEdges: [{ groupSubjectId: groupId, roleSubjectId: roleId, isActive: true }], authority: { isRouterBound: true, cutoverAt: '1' } } },
    query, accounts: [account, account.toUpperCase()], now: () => 1001 };
  const readAuthority = async (protocolQuery = query) => readAuthoritySnapshot({ source: { ...input.snapshot.source,
    block: { number: input.snapshot.source.block.number, hash: input.snapshot.source.block.hash } },
    query: async (source, document, variables) => ({ source, data: await protocolQuery(document, variables, source), issues: [] }) });
  return { input, calls, provider, query, indexedResponse, readAuthority };
}

const host = { authority: contracts.membershipAuthority, executor: contracts.executor, orgId,
  hybridVoting: contracts.hybridVoting, taskManagerAddress: contracts.taskManager, orgRegistry: contracts.registry,
  paymasterHub: contracts.paymaster, zkEmailAddress: contracts.email };
const roleForm = { name: 'Builders', groupIds: [groupId], holders: [{ address: account }], canCreateTasks: true,
  canOrganizeFolders: true, bindingVote: true, bindingClassIdx: 0, editOrgDetails: true,
  sponsorship: { enabled: true, capNative: '0.25', epochDays: 30, supportPasskeys: true, includeConfiguredEmailRules: true } };
// Packed API integration helpers: only the real installed shared operation decides readiness.
const contexts = new WeakMap();
async function operationFixture(options = {}, form = roleForm) {
  const f = fixture(options);
  f.input.snapshot = await f.readAuthority();
  f.input.scope = { ...f.input.scope, account };
  f.input.endpoint = f.input.snapshot.source.endpoint;
  f.input.request = roleFormRequest({ ...form, creationMode: form.creationMode || 'compound' });
  return f;
}
async function observe(input) {
  const result = await createRoleOperationHost(input.readFactory).read(input);
  if (result.status === 'ready') contexts.set(result.data, input);
  return result;
}
async function build(evidence, form = roleForm) {
  const input = contexts.get(evidence);
  if (!input) throw new Error('No observed operation context');
  return prepareFixture(input, form);
}
async function prepareFixture(input, form = roleForm) {
  const operationHost = createRoleOperationHost(input.readFactory);
  const request = roleFormRequest({ ...form, creationMode: form.creationMode || 'compound' });
  const operation = await operationHost.review({ ...input, request });
  if (operation.status !== 'ready') return buildRoleFormBatch({ ...host, form, operation });
  const prepared = await operationHost.prepare({ ...input, review: operation.data, currentRequest: request,
    publishDocument: async () => ({ cid: bytes32ToCidV0(hash) }) });
  return buildRoleFormBatch({ ...host, form, operation: prepared, review: operation.data, preview: false });
}

/** Explicit indexed fixture rows, fed through the installed authority reader rather than
 * inventing collection coverage on a projected snapshot. Pagination uses real query cursors. */
function authorityResponse(response, data, variables = {}) {
  const subjects = data.subjects.map(row => ({ id: row.subjectId, subjectId: row.subjectId, kind: row.kind,
    name: row.name, defaultAllow: false, maxMembers: row.maxMembers || '0', memberCount: row.memberCount || '0',
    activeMemberCount: row.memberCount || '0', createdAt: '1', vouchConfig: null, managerConfig: null }));
  const edges = (data.groupEdges || []).map(row => ({ id: `${row.groupSubjectId}-${row.roleSubjectId}`, ...row }));
  const membershipAuthority = { ...response.organization.membershipAuthority, isRouterBound: true, cutoverAt: '1', paused: false,
    subjectCount: String(subjects.length), roleSubjectCount: String(subjects.filter(row => row.kind === 'Role').length),
    groupSubjectCount: String(subjects.filter(row => row.kind === 'Group').length), acceptedMembershipCount: '0' };
  const page = rows => rows.filter(row => row.id > (variables.lastId || '')).sort((a, b) => a.id.localeCompare(b.id)).slice(0, variables.first || 1000);
  return { ...response, organization: { ...response.organization, membershipAuthority }, subjects: page(subjects),
    subjectMemberships: [], groupCompositions: page(edges), permRows: [], accessRules: [], subjectVouchRecords: [], pendingActions: [] };
}

// The complete host observer, installed ABI and installed provenance reader share
// only mocked transports. Exact historical calls/events are independently encoded.
function historicalFixture(createsSubject = false) {
  const transactionHash = `0x${'12'.repeat(32)}`, oldHash = `0x${'34'.repeat(32)}`;
  const title = utils.hexlify(utils.toUtf8Bytes('Historical authority action'));
  const action = createsSubject
    ? interfaces.membershipAuthority.encodeFunctionData('createRole', ['Builders', root, '', 0])
    : interfaces.membershipAuthority.encodeFunctionData('renameSubject', [roleId, 'Members', root, '']);
  const f = fixture();
  const row = { id: `${contracts.hybridVoting}-9`, proposalId: '9', title: 'Historical authority action',
    createdAtBlock: '100', transactionHash, status: 'Ended', wasExecuted: false, descriptionHash: root, numOptions: 2,
    hybridVoting: { id: contracts.hybridVoting, organization: { id: orgId } } };
  f.indexedResponse.proposals = [row];
  const tx = { hash: transactionHash, blockNumber: 100, blockHash: oldHash, from: account,
    to: contracts.hybridVoting, chainId: 100, value: constants.Zero,
    data: interfaces.hybridVoting.encodeFunctionData('createProposal', [title, root, 10, 2,
      [[[contracts.membershipAuthority, 0, action]], []], []]) };
  const event = interfaces.hybridVoting.encodeEventLog(interfaces.hybridVoting.getEvent('NewProposal'),
    [9, title, root, 2, 1500, 900]);
  const receipt = { status: 1, transactionHash, blockNumber: 100, blockHash: oldHash,
    logs: [{ ...event, address: contracts.hybridVoting, transactionHash, blockNumber: 100, blockHash: oldHash, removed: false }] };
  f.provider.getTransaction = vi.fn(async () => tx);
  f.provider.getTransactionReceipt = vi.fn(async () => receipt);
  f.provider.getBlock.mockImplementation(async tag => tag === '0x64'
    ? { number: 100, hash: oldHash, timestamp: 900 } : { number: 123, hash, timestamp: 1000 });
  const exactResponse = structuredClone(f.indexedResponse);
  const responses = [];
  f.query.mockImplementation(async (document, variables) => {
    expect(variables.block).toEqual({ hash });
    const exact = parse(document).definitions[0].name.value === 'RecoverSubjectCreation';
    if (exact) expect(variables).toEqual({ orgId, id: row.id, block: { hash } });
    const response = selectedResponse(document, authorityResponse(exact ? exactResponse : f.indexedResponse, f.input.snapshot.data, variables));
    responses.push(response);
    return response;
  });
  return { ...f, row, tx, receipt, exactResponse, responses, transactionHash, oldHash, title, action };
}

async function operationHistoricalFixture(createsSubject = false) {
  const f = historicalFixture(createsSubject);
  f.input.snapshot = await f.readAuthority();
  f.input.scope = { ...f.input.scope, account };
  f.input.endpoint = f.input.snapshot.source.endpoint;
  f.input.request = roleFormRequest({ ...roleForm, creationMode: 'compound' });
  f.query.mockClear(); f.responses.length = 0;
  return f;
}

export { operationFixture, operationHistoricalFixture, observe, prepareFixture, authorityResponse, fixture, historicalFixture, contracts, account, otherExecutor, orgId, hash, root, roleId, groupId, scope, coverage, source, interfaces, host, roleForm, build, selectedResponse };
