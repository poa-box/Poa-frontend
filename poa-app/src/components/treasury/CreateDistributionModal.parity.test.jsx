import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeFunctionData } from 'viem';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { PaymentManagerAbi } from '@poa-box/core/abis/PaymentManager';
import { resolveTokenLabel } from '@/util/tokenLabel';
import { createParityHost } from '@/test/parityHost';
const f = vi.hoisted(() => ({ po: {}, auth: {}, client: null, apollo: null, pin: vi.fn(), propose: vi.fn(), preview: undefined }));
vi.mock('@chakra-ui/react', async () => (await import('@/test/parityHost')).parityChakra());
vi.mock('@/context/POContext', () => ({ usePOContext: () => f.po }));
vi.mock('@/context/authState', () => ({ useAuth: () => f.auth }));
vi.mock('@/context/ipfsContext', () => ({ useIPFScontext: () => ({ addToIpfs: f.pin }) }));
vi.mock('@/context/RefreshContext', () => ({ RefreshEvent: {}, useRefreshSubscription: () => {} }));
vi.mock('@/services/web3/utils/publicChainClient', () => ({ createPublicClientForChain: () => f.client }));
vi.mock('@/util/apolloClient', () => ({ getClient: () => f.apollo }));
vi.mock('@/util/tokens', () => ({ getBountyTokenOptions: () => [{ address: TOKEN, symbol: 'TESTASSET', name: 'Offline asset', decimals: 6 }] }));
vi.mock('@apollo/client', async original => ({ ...await original(), useQuery: () => ({ data: f.preview }) }));
vi.mock('@/hooks/useWeb3Services', () => ({ useWeb3: () => ({ voting: { createHybridProposal: f.propose }, isReady: true,
  executeWithNotification: callback => callback() }) }));
vi.mock('@/components/shared/PulseLoader', () => ({ default: () => null }));
import CreateDistributionModal from '@/components/treasury/CreateDistributionModal';
import { readOrgPotBalances } from '@/hooks/useOrgPotBalances';
import { buildTreasuryTransferBatch, resolveTransferSource, TRANSFER_SOURCE } from '@/lib/voting/treasuryBatches';
const address = n => `0x${n.toString(16).padStart(40, '0')}`;
const ORG = `0x${'ab'.repeat(32)}`, HASH = `0x${'cd'.repeat(32)}`, ROOT = `0x${'ef'.repeat(32)}`;
const PM = address(2000), PT = address(2001), EXEC = address(2002), TASK = address(2003), TOKEN = address(2004), VOTE = address(2005), USER = address(1);
const height = 60000000n, CID = 'QmYwAPJzv5CZsnAzt8auVZRnGi2CJLNm5KWCVUPnZTkqmn';
let host;
const props = () => ({ isOpen: true, onClose: vi.fn(), paymentManagerAddress: f.po.paymentManagerAddress, orgChainId: f.po.orgChainId, votingContractAddress: VOTE });
const render = extra => host.render(<CreateDistributionModal {...props()} {...extra} />);
async function fill() {
  await host.change(host.nodes().find(node => node.tagName === 'SELECT'), TOKEN);
  await act(async () => { await vi.waitFor(() => expect(host.container.textContent).toContain('Treasury: 0.001')); });
  await host.change(host.nodes().find(node => node.tagName === 'INPUT'), '0.00001');
}
beforeEach(() => {
  vi.clearAllMocks(); f.preview = undefined;
  f.auth = { accountAddress: USER, isAuthHydrated: true, sessionGeneration: 1 };
  f.po = { orgId: ORG, subgraphUrl: 'https://index.invalid/graphql', orgChainId: 100, participationTokenAddress: PT,
    paymentManagerAddress: PM, executorContractAddress: EXEC, taskManagerContractAddress: TASK, tokenLabel: 'Shares' };
  f.pin.mockResolvedValue({ path: CID }); f.propose.mockResolvedValue({ success: true });
  const meta = { block: { number: Number(height), hash: HASH }, hasIndexingErrors: false };
  const parent = { id: ORG, paymentManager: { id: PM, organization: { id: ORG } }, participationToken: { id: PT } };
  f.apollo = { query: vi.fn(async ({ query, variables }) => {
    const text = query.loc.source.body;
    if (text.includes('FetchMembersAtBlock')) return { data: { _meta: meta, organization: { ...parent,
      users: [1, 2, 3].map(n => ({ address: address(n), participationTokenBalance: String(n), membershipStatus: 'Active' })) } } };
    if (text.includes('FetchDistributionsPage')) return { data: { _meta: meta, organization: parent, distributions: [{
      id: `${PM}-1`, distributionId: '1', payoutToken: TOKEN, totalAmount: '100', totalClaimed: '100', checkpointBlock: '10',
      merkleRoot: ROOT, createdAtBlock: '20', status: 'Active', paymentManager: { id: PM, organization: { id: ORG } },
    }] } };
    expect(variables).toBeUndefined(); return { data: { _meta: meta } };
  }) };
  f.client = { request: vi.fn(async ({ method }) => method === 'eth_chainId' ? '0x64' : { number: `0x${height.toString(16)}`, hash: HASH }),
    readContract: vi.fn(async ({ functionName, args }) => {
      if (functionName === 'distributionCounter') return 1n;
      if (functionName === 'balanceOf') return { [EXEC]: 700n, [PM]: 1000n, [TASK]: 300n }[args[0].toLowerCase()];
      throw new Error('Unexpected individual read');
    }),
    multicall: vi.fn(async ({ contracts }) => contracts.map(call => ({ status: 'success', result: call.functionName === 'getDistribution'
      ? [TOKEN, 100n, 10n, ROOT, 100n, false] : call.args[0].toLowerCase() === address(1) }))) };
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); })); host = createParityHost();
});
afterEach(async () => { await host.unmount(); expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe('mounted funded treasury and distribution preparation', () => {
  it('observes all three funded pots and prepares actual core close-before-send calldata', async () => {
    const observed = await readOrgPotBalances({ client: f.client, apollo: f.apollo, network: { chainId: 100, rpcUrl: 'https://rpc.invalid', subgraphUrl: f.po.subgraphUrl },
      orgId: ORG, token: TOKEN, decimals: 6, executor: EXEC, paymentManager: PM, bountyPool: TASK });
    expect(observed).toMatchObject({ executor: '700', paymentManager: '1000', bountyPool: '300' });
    const choice = resolveTransferSource({ amountWei: '950', evidence: observed.planningEvidence, recipient: TASK, preferred: TRANSFER_SOURCE.PAYMENT_MANAGER });
    expect(choice).toMatchObject({ ok: true, source: 'paymentManager', finalizeIds: ['1'] });
    const plan = buildTreasuryTransferBatch({ source: choice.source, evidence: observed.planningEvidence, amount: '0.00095',
      token: TOKEN, decimals: 6, symbol: 'TESTASSET', recipient: TASK, destination: 'bountyPool', bountyPoolAddress: TASK, paymentManagerAddress: PM, finalizeIds: choice.finalizeIds });
    const calls = plan.batch.map(call => decodeFunctionData({ abi: PaymentManagerAbi, data: call.data }));
    expect(calls.map(call => call.functionName)).toEqual(['finalizeDistribution', 'withdraw']);
    expect(calls[1].args.map(String)).toEqual([TOKEN, TASK, '950']);
    expect(f.client.multicall.mock.calls[0][0].contracts.map(call => call.functionName)).toEqual(['getDistribution']);
  });

  // Root/core owns this repair. The full current enumeration proves 900 units
  // uncommitted; the missing creation fact only prevents automatically closing
  // round 1. Convert to a normal test when core permits the already-free spend.
  it('missing round creation history must not block a proven uncommitted spend', async () => {
    const query = f.apollo.query.getMockImplementation();
    f.apollo.query.mockImplementation(async args => {
      const result = await query(args);
      if (args.query.loc.source.body.includes('FetchDistributionsPage')) result.data.distributions = [];
      return result;
    });
    const observed = await readOrgPotBalances({ client: f.client, apollo: f.apollo,
      network: { chainId: 100, rpcUrl: 'https://rpc.invalid', subgraphUrl: f.po.subgraphUrl }, orgId: ORG,
      token: TOKEN, decimals: 6, executor: EXEC, paymentManager: PM, bountyPool: TASK });
    expect(observed.planningEvidence.paymentManager.coverage.status).toBe('complete');
    expect(observed.planningEvidence.paymentManager.data.balanceRaw).toBe('1000');
    expect(observed.planningEvidence.paymentManager.data.rounds[0].creationBlock.state).toBe('unknown');
    expect(resolveTransferSource({ amountWei: '10', evidence: observed.planningEvidence, recipient: TASK,
      preferred: TRANSFER_SOURCE.PAYMENT_MANAGER })).toMatchObject({ ok: true, source: 'paymentManager', finalizeIds: [] });
  });

  it.each([[undefined, 'ALT', 'Shares'], [false, 'ALT', 'Shares'], [true, 'MiXeD', 'MiXeD'], [true, '', 'Shares'], [true, undefined, 'Shares']])(
    'prepares a distribution with no preview rows for flag %s and symbol %s', async (flag, symbol, label) => {
      f.po.tokenLabel = resolveTokenLabel({ useTokenSymbol: flag, symbol });
      await render(); await fill();
      expect(host.button('Create Proposal').disabled).toBe(false);
      await host.click(host.button('Create Proposal'));
      expect(f.propose).toHaveBeenCalledOnce();
      const [target, proposal] = f.propose.mock.calls[0]; expect(target).toBe(VOTE);
      expect(proposal.description).toContain(`2 ${label} holders`); expect(proposal.batches[1]).toEqual([]);
      const call = decodeFunctionData({ abi: PaymentManagerAbi, data: proposal.batches[0][0].data });
      expect(call.functionName).toBe('createDistribution');
      expect(call.args.map(String)).toEqual([TOKEN, '10', JSON.parse(f.pin.mock.calls[0][0]).merkleRoot, String(height)]);
      const document = JSON.parse(f.pin.mock.calls[0][0]); expect(document.claims[address(1)]).toBeUndefined();
      expect(Object.values(document.claims).reduce((sum, row) => sum + BigInt(row.amount), 0n)).toBe(10n);
      for (const [who, claim] of Object.entries(document.claims)) expect(StandardMerkleTree.verify(document.merkleRoot, ['address', 'uint256'], [who, claim.amount], claim.proof)).toBe(true);
      expect(host.container.textContent).toContain('Proposal Created!');
    });

  it('reports preparation failure with retry and keeps missing balances unavailable', async () => {
    await render(); await fill();
    f.client.multicall.mockRejectedValueOnce(new Error('Mock round outage'));
    await host.click(host.button('Create Proposal'));
    expect(host.container.textContent).toContain('Payout details could not be prepared');
    expect(f.pin).not.toHaveBeenCalled(); expect(f.propose).not.toHaveBeenCalled();
    await host.click(host.button('Refresh treasury details'));
    await act(async () => { await vi.waitFor(() => expect(host.button('Create Proposal').disabled).toBe(false)); });
    f.client.readContract.mockRejectedValue(new Error('Mock balance outage'));
    await host.click(host.button('Create Proposal'));
    expect(host.container.textContent).toContain('Treasury: Unavailable');
    expect(host.container.textContent).not.toContain('Treasury: 0 TESTASSET');
    expect(host.button('Create Proposal').disabled).toBe(true);
  });

  it.each(['orgId', 'subgraphUrl', 'endpoint-roundtrip', 'accountAddress', 'sessionGeneration', 'unmount'])('abandons prepared storage completion after %s changes and suppresses duplicates', async field => {
    await render(); await fill();
    let finish;
    f.pin.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const submit = host.props(host.button('Create Proposal')).onClick;
    let pending;
    await act(async () => {
      pending = submit(); await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
      await submit();
    });
    expect(f.pin).toHaveBeenCalledOnce();
    if (field === 'unmount') await host.render(null);
    else {
      if (field === 'orgId') f.po = { ...f.po, orgId: `0x${'12'.repeat(32)}` };
      if (field === 'subgraphUrl' || field === 'endpoint-roundtrip') f.po = { ...f.po, subgraphUrl: 'https://other.invalid/graphql' };
      if (field === 'accountAddress') f.auth = { ...f.auth, accountAddress: address(4) };
      if (field === 'sessionGeneration') f.auth = { ...f.auth, sessionGeneration: 2 };
      await render();
      if (field === 'endpoint-roundtrip') {
        f.po = { ...f.po, subgraphUrl: 'https://index.invalid/graphql' };
        await render(); await fill();
      }
    }
    await act(async () => { finish({ path: CID }); await pending; await submit(); });
    expect(f.pin).toHaveBeenCalledOnce(); expect(f.propose).not.toHaveBeenCalled();
  });
});
