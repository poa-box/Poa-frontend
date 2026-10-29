import { expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { composeSubjectId } from '@poa-box/core/authority/ids';
import { taskActionPolicy } from '@/lib/tasks/actionPolicy';
import { knownFact } from '@poa-box/core/data/facts';
import { readProjectCreator } from '@/services/web3/read/projectCreator';
const address = n => `0x${n.repeat(40)}`;
const authorityAddress = address('1'), tm = address('2'), account = address('3');
const role = composeSubjectId(authorityAddress, '1'), group = composeSubjectId(authorityAddress, '2');
const block = { number: '123', hash: `0x${'a'.repeat(64)}` };
const scope = { chainId: 100, orgId: `0x${'b'.repeat(64)}`, contract: tm, account, endpoint: 'https://graph.example', contracts: { membershipAuthority: authorityAddress } };
const coverage = { status: 'complete', receivedKeys: [], missingIds: [], failedIds: [], issues: [] };
const authority = { source: { ...scope, contract: authorityAddress, indexed: true, snapshot: 'pinned', method: 'authority-snapshot', block }, coverage, data: {
  subjects: [{ subjectId: role, kind: 'Role', name: 'Members' }, { subjectId: group, kind: 'Group', name: 'Builders' }],
  groupEdges: [{ id: 'edge', roleSubjectId: role, groupSubjectId: group, isActive: true }], permissions: [],
  memberships: [{ user: account, accepted: true, acceptedAt: '1', seededWhilePaused: false, ruleKind: 'None', rule: null, pendingAction: null,
    emailVerified: false, vouchEpoch: '0', vouchCount: '0', subject: { subjectId: role, kind: 'Role', defaultAllow: true, vouchConfig: null } }],
  taskModule: { source: { ...scope, block, indexed: true, snapshot: 'pinned', method: 'task-creator-bindings' }, creatorSubjectIds: [group] },
} };
const abi = new ethers.utils.Interface(['function getLensData(uint8,bytes) view returns(bytes)']);
function rpc({ executor = address('9'), binding = authorityAddress, selectors = [group], hash = block.hash } = {}) {
  return { request: vi.fn(async ({ method, params }) => {
    if (method === 'eth_chainId') return '0x64';
    if (method === 'eth_getBlockByNumber') return { number: '0x7b', hash };
    expect(params[1]).toBe('0x7b');
    const key = Number(abi.decodeFunctionData('getLensData', params[0].data)[0]);
    return abi.encodeFunctionResult('getLensData', [ethers.utils.defaultAbiCoder.encode(key === 5 ? ['uint256[]'] : ['address'], [key === 5 ? selectors : key === 4 ? executor : binding])]);
  }) };
}
it('uses current configured group membership and module executor with preserved mixed-source proof for deletion', async () => {
  const client = rpc();
  const result = await readProjectCreator({ authority, scope, client, rpcEndpoint: 'https://rpc.example' });
  expect(result.facts.authorized).toMatchObject({ state: 'known', value: true, source: { indexed: false, endpoint: 'https://rpc.example' } });
  expect(client.request.mock.calls.filter(([call]) => call.method === 'eth_call')).toHaveLength(3);
  const projectId = `0x${'0'.repeat(63)}1`;
  const project = { id: `${tm}-${projectId}`, taskSource: { ...scope, indexed: true, snapshot: 'pinned', method: 'board', block }, taskCoverage: coverage, managerFact: knownFact(false) };
  const decisions = taskActionPolicy({ scope: { ...scope, hydrated: true }, project, authority: { scope, projectId,
    executor: knownFact(false), creator: { state: 'unknown', reason: 'not indexed' }, permissionMask: knownFact('0'), projectCreator: result.input }, now: 10000 });
  expect(decisions.deleteProject.state).toBe('allowed');
  expect(decisions.create.state).toBe('denied');
});
it('does not substitute manager or task CREATE for the configured creator selectors', async () => {
  const result = await readProjectCreator({ authority, scope, client: rpc({ selectors: [] }), rpcEndpoint: 'https://rpc.example' });
  expect(result.facts.authorized).toMatchObject({ state: 'known', value: false });
});
it('rejects block drift, incomplete authority and foreign module authority even for executor', async () => {
  await expect(readProjectCreator({ authority, scope, client: rpc({ hash: `0x${'c'.repeat(64)}` }), rpcEndpoint: 'https://rpc.example' })).rejects.toThrow();
  const result = await readProjectCreator({ authority, scope, client: rpc({ executor: account, binding: address('4') }), rpcEndpoint: 'https://rpc.example' });
  expect(result.facts.authorized.state).toBe('unknown');
  await expect(readProjectCreator({ authority: { ...authority, coverage: { ...coverage, status: 'incomplete' } }, scope, client: rpc(), rpcEndpoint: 'https://rpc.example' })).rejects.toThrow();
});
