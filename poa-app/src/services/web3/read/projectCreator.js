import { encodeLensCall, decodeLensResult } from '@poa-box/core/task-lens';
import { knownFact, requireCompleteSnapshot, assertSourceBlock } from '@poa-box/core/data/facts';
import { authorityAccountMembershipFacts } from '@poa-box/core/reads/authority';
import { deriveProjectCreatorAuthorization } from '@poa-box/core/tasks/project-creator';
import { ethers } from 'ethers';
import { getNetworkByChainId } from '@/config/networks';
import { createPublicClientForChain } from '@/services/web3/utils/publicChainClient';

/** Module settings at the indexer's independently verified canonical block.
 * Core requires one original source for these three module fields; membership/group
 * enumeration stays indexed, with no authority tree or per-task RPC scan. */
export async function readProjectCreator({ authority, scope, client = createPublicClientForChain(scope.chainId), rpcEndpoint = getNetworkByChainId(scope.chainId)?.rpcUrl }) {
  requireCompleteSnapshot(authority, { scope: { chainId: scope.chainId, orgId: scope.orgId,
    contract: scope.contracts.membershipAuthority, endpoint: scope.endpoint, method: 'authority-snapshot' }, indexed: true, snapshot: 'pinned' });
  const binding = authority.data.taskModule;
  if (!binding) throw new Error('Project settings are unavailable.');
  requireCompleteSnapshot({ source: binding.source, coverage: authority.coverage, data: null }, {
    scope: { chainId: scope.chainId, orgId: scope.orgId, contract: scope.contract, endpoint: scope.endpoint, method: 'task-creator-bindings' },
    indexed: true, snapshot: 'pinned', block: authority.source.block,
  });
  const block = authority.source.block;
  if (!/^0x[\da-f]{64}$/i.test(block?.hash || '') || !client || !rpcEndpoint) throw new Error('Project settings are unavailable.');
  const tag = `0x${BigInt(block.number).toString(16)}`;
  const verify = async () => {
    const observed = await client.request({ method: 'eth_getBlockByNumber', params: [tag, false] });
    assertSourceBlock(observed ? { number: BigInt(observed.number).toString(), hash: observed.hash } : undefined, block);
  };
  if (BigInt(await client.request({ method: 'eth_chainId' })) !== BigInt(scope.chainId)) throw new Error('Project network changed.');
  await verify();
  const values = await Promise.all([4, 12, 5].map(async key => {
    const result = await client.request({ method: 'eth_call', params: [{ to: scope.contract, data: encodeLensCall(key) }, tag] });
    return ethers.utils.defaultAbiCoder.decode(key === 5 ? ['uint256[]'] : ['address'], decodeLensResult(result))[0];
  }));
  await verify();
  const memberships = authorityAccountMembershipFacts(authority, scope.account);
  const source = { ...scope, endpoint: rpcEndpoint, method: 'eth_call', indexed: false, snapshot: 'pinned', block };
  const taskManager = { source, coverage: { status: 'complete', receivedKeys: ['creatorSubjectIds', 'executor', 'membershipAuthority'], missingIds: [], failedIds: [], issues: [] }, data: {
    creatorSubjectIds: knownFact(values[2].map(String), source),
    executor: knownFact(values[0], source), membershipAuthority: knownFact(values[1], source),
  } };
  const input = { scope, authority, memberships, taskManager, sources: {
    taskManager: { endpoint: rpcEndpoint, method: 'eth_call', indexed: false },
    authority: { endpoint: scope.endpoint, method: 'authority-snapshot', indexed: true },
    memberships: { endpoint: scope.endpoint, method: 'authority-snapshot', indexed: true }, block,
  } };
  return { input, facts: deriveProjectCreatorAuthorization(input) };
}
