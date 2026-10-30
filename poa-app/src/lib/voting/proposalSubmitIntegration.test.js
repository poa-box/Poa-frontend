import { describe, expect, it, vi } from 'vitest';
import { constants } from 'ethers';
import { submitProposalRuntime } from '@/hooks/runtime/proposalSubmitRuntime';
import { refreshReviewedTreasuryTransfer } from '@/lib/voting/treasurySubmitEvidence';

const address = digit => `0x${digit.repeat(40)}`;
const executor = address('1'), paymentManager = address('2'), authority = address('3'), recipient = address('4');
const orgId = `0x${'5'.repeat(64)}`;
const scope = { chainId: 100, orgId, contracts: { executor, paymentManager } };
const block = { number: '123', hash: `0x${'6'.repeat(64)}` };
const asset = { chainId: 100, address: constants.AddressZero, decimals: 18 };
const coverage = { status: 'complete', receivedKeys: ['balance'], missingIds: [], failedIds: [], issues: [] };
const evidence = () => ({ scope, block, asset, executor: { coverage,
  source: { ...scope, contract: executor, endpoint: 'https://rpc.example', method: 'eth_getBalance', indexed: false, snapshot: 'pinned', block },
  data: { asset, rawAmount: '1' } } });
const request = { source: 'executor', token: '', decimals: 18, amount: '0.000000000000000001', recipient, paymentManagerAddress: paymentManager };
function context(proposal) {
  return { proposal: { name: 'A reviewed choice', time: '1', ...proposal }, orgChainId: 100,
    orgNetwork: { nativeCurrency: { decimals: 18 } }, nativeCurrencySymbol: 'XDAI',
    setLoadingSubmit: vi.fn(), toast: vi.fn(), resetForm: vi.fn(), onSubmit: vi.fn(async () => true),
    validateBasicFields: () => true, validateTransferProposal: () => true, validateCreateRoleProposal: () => true,
    buildActionSummaries: () => [] };
}
const contracts = { membershipAuthorityAddress: authority, executorContractAddress: executor, paymentManagerAddress: paymentManager };
describe('proposal host evidence handoff', () => {
  it('submits exactly 1 wei using newly observed treasury evidence without persisting it in the payload', async () => {
    const ctx = context({ type: 'transferFunds', transferSource: 'executor', transferToken: '',
      transferAddress: recipient, transferAmount: request.amount });
    const refetch = vi.fn(async () => ({ planningEvidence: evidence() }));
    expect(await submitProposalRuntime(ctx, null, contracts, {
      accessV2: { enabled: true, orgId }, treasury: { planningEvidence: evidence(), refetch, transferDecimals: 18 },
    })).toBe(true);
    const payload = ctx.onSubmit.mock.calls[0][0];
    expect(payload.batches[0]).toEqual([{ target: recipient, value: '1', data: '0x' }]);
    expect(payload).not.toHaveProperty('treasury');
    expect(payload).not.toHaveProperty('planningEvidence');
    expect(refetch).toHaveBeenCalledOnce();
  });
  it('refuses a refetch that supplies no new evidence and leaves the draft intact', async () => {
    const ctx = context({ type: 'transferFunds', transferSource: 'executor', transferToken: '',
      transferAddress: recipient, transferAmount: request.amount });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await submitProposalRuntime(ctx, null, contracts, { accessV2: { enabled: true, orgId },
        treasury: { planningEvidence: evidence(), refetch: async () => undefined, transferDecimals: 18 } })).toBe(false);
      expect(ctx.onSubmit).not.toHaveBeenCalled();
      expect(ctx.resetForm).not.toHaveBeenCalled();
    } finally { warning.mockRestore(); }
  });
  it('rejects cross-chain refreshed evidence before producing calls', async () => {
    const fresh = evidence(); fresh.scope = { ...scope, chainId: 42161 };
    await expect(refreshReviewedTreasuryTransfer({ reviewed: evidence(), refetch: async () => ({ planningEvidence: fresh }),
      request, scope })).rejects.toThrow('organization changed');
  });
  it('uses the reviewed prepared role directly, preserving creation metadata and manager result flow', async () => {
    const ctx = context({ type: 'createRole', roleFormV2: { name: 'Builders' } });
    const prepared = { createsSubject: true, stage: 'create', batch: [{ target: authority, value: '0', data: '0x1234' }],
      submittable: { ok: true }, warnings: [], summaries: ['Create the role “Builders”'], gasLimit: 1000000, revalidate: vi.fn(async () => {}) };
    const prepareReviewedRole = vi.fn(async () => prepared);
    expect(await submitProposalRuntime(ctx, null, contracts,
      { accessV2: { enabled: true, roleCreation: { prepareReviewedRole } } })).toBe(true);
    expect(prepareReviewedRole).toHaveBeenCalledOnce();
    expect(ctx.onSubmit.mock.calls[0][0]).toMatchObject({ createsSubject: true, actionSummaries: prepared.summaries,
      batches: [prepared.batch, []], gasLimit: prepared.gasLimit });
  });
});
