/** Treasury allocation policy and stored-claim verification are core-owned. */
import { allocateDistribution } from '@poa-box/core/treasury/distributions';
import { buildDistributionTree as coreTree } from '@poa-box/core/tx/treasury';
import { requireRawUint } from '@poa-box/core/amounts';
import { knownFact } from '@poa-box/core/data/facts';

/** Preserve the old result shape, selecting the existing sorted-last dust policy explicitly. */
export function buildDistributionTree(holders, totalAmount, evidence) {
  if (!evidence) throw new Error('Distribution snapshot unavailable');
  const observed = evidence.holders?.data;
  if (!Array.isArray(holders) || !Array.isArray(observed) || holders.length !== observed.length || holders.some(holder => {
    const row = observed.find(r => r.address.toLowerCase() === holder.address.toLowerCase());
    return !row || row.participationTokenBalance !== holder.balance || row.membershipStatus !== holder.membershipStatus;
  })) throw new Error('Distribution holders changed');
  const allocation = allocateDistribution({ ...evidence, policy: 'sorted-last-omit-zero', totalRaw: requireRawUint(totalAmount) });
  const tree = coreTree(allocation.allocations.map(a => ({ address: a.address, amount: a.amountRaw })));
  return { root: allocation.merkleRoot, claims: allocation.claims, treeData: tree.dump(),
    holderCount: allocation.allocations.length, totalDistributed: allocation.totalRaw };
}

/** Legacy lookup API; mounted claim UI verifies the complete stored document before lookup. */
export function getClaimData(claims, address) {
  if (!claims || !address) return null;
  const key = Object.keys(claims).find(k => k.toLowerCase() === address.toLowerCase());
  return key ? claims[key] : null;
}

/** Action-only snapshot. Indexed holdings and actual opt-outs share an independently observed block. */
export async function prepareDistributionSnapshot({ apollo, client, chainId, orgId, holderContract, paymentManager, endpoint, rpcEndpoint }) {
  const [{ FETCH_MEMBERS_AT_BLOCK }, { PaymentManagerAbi }, { gql }, { getAddress }] = await Promise.all([
    import('@poa-box/core/reads/treasury'), import('@poa-box/core/abis/PaymentManager'), import('@apollo/client'), import('viem'),
  ]);
  const headQuery = gql`query DistributionSnapshotHead { _meta { block { number hash } hasIndexingErrors } }`;
  const head = await apollo.query({ query: headQuery, fetchPolicy: 'network-only' });
  if (head.errors?.length || head.data?._meta?.hasIndexingErrors) throw new Error('Distribution snapshot unavailable');
  const number = requireRawUint(head.data?._meta?.block?.number);
  if (BigInt(number) > 2147483647n) throw new Error('Distribution checkpoint unavailable');
  if (BigInt(await client.request({ method: 'eth_chainId' })) !== BigInt(chainId)) throw new Error('Distribution chain changed');
  const observed = await client.request({ method: 'eth_getBlockByNumber', params: [`0x${BigInt(number).toString(16)}`, false] });
  if (!observed || BigInt(observed.number).toString() !== number || !/^0x[\da-fA-F]{64}$/.test(observed.hash)
      || (head.data._meta.block.hash && head.data._meta.block.hash.toLowerCase() !== observed.hash.toLowerCase())) throw new Error('Distribution checkpoint changed');
  let checkpoint = { number };
  // Add independently returned block/module proof to the canonical holder selection.
  const query = gql(FETCH_MEMBERS_AT_BLOCK.replace('participationToken { totalSupply }', 'id paymentManager { id } participationToken { id totalSupply }')
    .replace(/\n  }\n$/, '\n    _meta(block: { number: $block }) { block { number hash } hasIndexingErrors }\n  }\n'));
  const result = await apollo.query({ query, variables: { orgId, block: Number(number), paymentManager: paymentManager.toLowerCase() }, fetchPolicy: 'network-only' });
  const data = result.data, meta = data?._meta;
  if (result.errors?.length || meta?.hasIndexingErrors || String(meta?.block?.number) !== number ||
      (meta.block.hash && meta.block.hash.toLowerCase() !== observed.hash.toLowerCase()) ||
      data?.organization?.id?.toLowerCase() !== orgId.toLowerCase() || data.organization.paymentManager?.id?.toLowerCase() !== paymentManager.toLowerCase() ||
      data.organization.participationToken?.id?.toLowerCase() !== holderContract.toLowerCase()
      || !Array.isArray(data.organization.users) || data.organization.users.length >= 1000) throw new Error('Distribution holders incomplete');
  checkpoint = { number, ...(meta.block.hash ? { hash: meta.block.hash } : {}) };
  const holders = data.organization.users.map(u => ({ address: getAddress(u.address.toLowerCase()), balance: requireRawUint(u.participationTokenBalance),
    membershipStatus: u.membershipStatus, username: u.account?.username || null }));
  const contracts = { participationToken: holderContract, paymentManager };
  const source = { chainId, orgId, contracts, contract: holderContract, endpoint, method: 'graphql', indexed: true, snapshot: 'pinned', block: checkpoint };
  const optSource = { ...source, block: { number, hash: observed.hash }, contract: paymentManager, endpoint: rpcEndpoint, method: 'eth_call', indexed: false };
  const eligible = holders.filter(h => h.membershipStatus === 'Active' && h.balance !== '0');
  // Wallet-independent clients expose only lightweight actions. Batch the
  // bounded holder snapshot explicitly, keeping the exact checkpoint for every
  // eligibility read and at most three batches in flight.
  const batches = [];
  for (let start = 0; start < eligible.length; start += 20) batches.push(eligible.slice(start, start + 20));
  let batchRead = args => client.multicall(args);
  if (eligible.length && !client.multicall) {
    const [{ multicall }, { arbitrum, gnosis, sepolia, baseSepolia }] = await Promise.all([import('viem/actions'), import('viem/chains')]);
    const deployment = [arbitrum, gnosis, sepolia, baseSepolia].find(chain => chain.id === chainId)?.contracts?.multicall3;
    if (!deployment || BigInt(number) < BigInt(deployment.blockCreated)) throw new Error('Distribution batch reader unavailable');
    batchRead = args => multicall(client, { ...args, multicallAddress: deployment.address, batchSize: 0 });
  }
  const opts = [];
  for (let start = 0; start < batches.length; start += 3) {
    const results = await Promise.all(batches.slice(start, start + 3).map(async batch => {
      const rows = await batchRead({ blockNumber: BigInt(number), allowFailure: true,
        contracts: batch.map(holder => ({ address: getAddress(paymentManager.toLowerCase()), abi: PaymentManagerAbi,
          functionName: 'isOptedOut', args: [holder.address] })) });
      if (rows.length !== batch.length || rows.some(row => row.status !== 'success' || typeof row.result !== 'boolean')) {
        throw new Error('Distribution eligibility unavailable');
      }
      return batch.map((holder, index) => ({ address: holder.address, optedOut: rows[index].result }));
    }));
    opts.push(...results.flat());
  }
  const again = await client.request({ method: 'eth_getBlockByNumber', params: [`0x${BigInt(number).toString(16)}`, false] });
  if (again?.hash?.toLowerCase() !== observed.hash.toLowerCase()) throw new Error('Distribution checkpoint changed');
  const coverage = rows => ({ status: 'complete', receivedKeys: rows.map(r => r.address.toLowerCase()), missingIds: [], failedIds: [], issues: [] });
  return { holders, evidence: { chainId, orgId, holderContract, paymentManager, checkpoint,
    holders: { source, data: holders.map(h => ({ address: h.address, participationTokenBalance: h.balance, membershipStatus: h.membershipStatus, username: h.username })), coverage: coverage(holders) },
    optOutFacts: { source: optSource, data: opts, coverage: coverage(opts) } },
    checkpoint: knownFact(checkpoint, source) };
}
