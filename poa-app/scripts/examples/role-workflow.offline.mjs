/** Runnable offline adapter. All external I/O is synthetic; core and the workflow are real.
 * Run with an explicit --approve and a NEW directory for review → submit → reload/recover. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { ethers } from 'ethers';
import { getAbi } from '@poa-box/core/contracts';
import { readAuthoritySnapshot } from '@poa-box/core/reads/authority';
import { buildGovernanceProposal } from '@poa-box/core/tx/governance';

const { utils, constants, providers } = ethers;
const address = n => `0x${n.repeat(40)}`, account = address('8'), orgId = utils.id('offline org');
const contracts = { membershipAuthority: address('1'), executor: address('2'), hybridVoting: address('4') };
const scope = { chainId: 100, orgId, contract: contracts.membershipAuthority, contracts, account };
const block = { number: 123, hash: utils.id('offline block'), timestamp: 1000 };
const abi = { membershipAuthority: new utils.Interface(getAbi('MembershipAuthority')),
  hybridVoting: new utils.Interface(getAbi('HybridVotingNew')), executor: new utils.Interface(getAbi('Executor')) };
const statePath = process.env.POA_ROLE_DEMO_STATE;
const state = statePath && existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { rows: [], proposals: [], txs: {}, receipts: {} };
const persist = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
const source = { ...scope, endpoint: 'https://offline.invalid', method: 'authority-snapshot', indexed: true,
  snapshot: 'pinned', block, observedAt: 1001 };
const query = async (_source, _document, variables) => ({ source: _source, issues: [], data: {
  _meta: { block }, organization: { id: orgId, membershipAuthority: { id: contracts.membershipAuthority,
    isRouterBound: true, cutoverAt: '1', paused: false, subjectCount: '0', roleSubjectCount: '0', groupSubjectCount: '0', acceptedMembershipCount: '0' },
  executorContract: { id: contracts.executor }, hybridVoting: { id: contracts.hybridVoting } },
  subjects: [], subjectMemberships: [], groupCompositions: [], permRows: [], accessRules: [], subjectVouchRecords: [], pendingActions: [],
  proposals: state.proposals.filter(row => row.id === variables.id),
} });
class OfflineProvider extends providers.BaseProvider {
  constructor() { super({ name: 'offline', chainId: 100 }); }
  async detectNetwork() { return { name: 'offline', chainId: 100 }; }
  async getBlock() { return block; }
  async getTransaction(hash) { return state.txs[hash]; }
  async getTransactionReceipt(hash) { return state.receipts[hash]; }
  async perform(method, params) {
    if (method !== 'call') throw new Error(`Unexpected offline RPC: ${method}`);
    const moduleKey = Object.keys(contracts).find(key => contracts[key] === params.transaction.to.toLowerCase());
    const parsed = abi[moduleKey].parseTransaction(params.transaction);
    const replies = { membershipAuthority: { executor: [contracts.executor], orgId: [orgId], subjectCount: [0] },
      hybridVoting: { executor: [contracts.executor] }, executor: { hats: [contracts.membershipAuthority], isAuthorizedHatMinter: [true] } };
    const reply = replies[moduleKey][parsed.name];
    if (!reply) throw new Error(`Unexpected offline ABI: ${moduleKey}.${parsed.name}`);
    return abi[moduleKey].encodeFunctionResult(parsed.name, reply);
  }
}
const lease = Object.freeze({}), provider = new OfflineProvider();
const ports = {
  approve: async (_review, proposal) => process.env.POA_ROLE_DEMO_APPROVE === 'yes' && proposal.title === 'Offline portable role',
  observe: async () => ({ scope, authoritySnapshot: await readAuthoritySnapshot({ source, query }),
    sources: { indexed: { endpoint: source.endpoint, query }, rpc: { endpoint: 'https://offline.invalid', provider }, now: () => 1001 } }),
  store: { read: () => structuredClone(state.rows), save: row => {
    const index = state.rows.findIndex(item => item.id === row.id);
    if (index < 0) state.rows.push(row); else state.rows[index] = row;
    persist(); return structuredClone(row);
  } },
  // This demo is serial and has no real signer. Production adapters use the shared controller.
  submission: { session: run => run(lease), withLease: run => run(), pending: () => null,
    recover: () => { throw new Error('No uncertain submission is injected in this example'); } },
  propose: async (operation, proposal, lifecycle) => {
    await lifecycle.beforeExecute();
    const intent = buildGovernanceProposal({ votingAddress: contracts.hybridVoting, votingAbiName: 'HybridVotingNew',
      title: proposal.title, descriptionHash: constants.HashZero, durationMinutes: 10, numOptions: 2, batches: [operation.data.batch, []], subjectIds: [] });
    await lifecycle.onIntent(utils.id('offline intent'), lease);
    const id = String(state.proposals.length + 1), hash = utils.id(`offline proposal ${id}`);
    const data = abi.hybridVoting.encodeFunctionData(intent.method, intent.args);
    const args = abi.hybridVoting.parseTransaction({ data }).args;
    const event = abi.hybridVoting.encodeEventLog('NewProposal', [id, args.title, args.descriptionHash, 2, 1600, 1000]);
    state.txs[hash] = { hash, to: contracts.hybridVoting, from: account, chainId: 100, nonce: 1, value: '0', data, blockNumber: block.number, blockHash: block.hash };
    const receipt = state.receipts[hash] = { status: 1, transactionHash: hash, blockNumber: block.number, blockHash: block.hash,
      logs: [{ ...event, address: contracts.hybridVoting, transactionHash: hash, blockNumber: block.number, blockHash: block.hash, removed: false }] };
    state.proposals.push({ id: `${contracts.hybridVoting}-${id}`, proposalId: id, transactionHash: hash, createdAtBlock: String(block.number),
      wasExecuted: false, executionFailed: false, isValid: null, winningOption: null, status: 'Active', batchExecutions: [],
      hybridVoting: { id: contracts.hybridVoting, organization: { id: orgId } } });
    persist(); await lifecycle.onOutcome({ success: true, receipt }); return { success: true, receipt };
  },
};
export default ports;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const destination = process.argv[2];
  if (!destination || process.argv[3] !== '--approve') throw new Error('Usage: node role-workflow.offline.mjs NEW_OUTPUT_DIRECTORY --approve');
  if (existsSync(destination)) throw new Error('Use a new directory; existing saved work will not be overwritten.');
  mkdirSync(destination, { recursive: true });
  const env = { ...process.env, POA_ROLE_DEMO_STATE: resolve(destination, 'state.json'), POA_ROLE_DEMO_APPROVE: 'yes' };
  const input = { request: { mode: 'create', role: { kind: 'Role', name: 'Offline portable role', maxMembers: '0' } },
    draft: { name: 'Offline portable role' }, draftKey: 'offline-example' };
  const run = (action, extra) => {
    const requestPath = resolve(destination, `${action}-request.json`);
    writeFileSync(requestPath, JSON.stringify({ action, ...extra }, null, 2));
    const output = execFileSync(process.execPath, [resolve(dirname(fileURLToPath(import.meta.url)), 'role-workflow.mjs'), fileURLToPath(import.meta.url), requestPath], { env, encoding: 'utf8' });
    writeFileSync(resolve(destination, `${action}-output.json`), output); return JSON.parse(output);
  };
  const review = run('review', { input });
  const submitted = run('submit', { input, proposal: { title: 'Offline portable role' } });
  const recovered = run('recover', { id: submitted.continuationId });
  if (review.status !== 'ready' || !submitted.success || recovered.proof.state !== 'pending') throw new Error('Offline lifecycle did not verify');
  console.log(JSON.stringify({ offline: true, separateNodeProcesses: 3, review: review.status, approved: true,
    submitted: submitted.success, recovered: recovered.proof.state, proposalId: recovered.proof.proposalId,
    savedOriginal: recovered.originalForm, simulatedSends: JSON.parse(readFileSync(env.POA_ROLE_DEMO_STATE)).proposals.length }, null, 2));
}
