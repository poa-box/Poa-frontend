import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BigNumber, utils } from 'ethers';
import { getAbi } from '@poa-box/core/contracts';
import { bytes32ToCidV0 } from '@poa-box/core/encoding/cid';
import { RoleCreationService } from '@/services/web3/domain/RoleCreationService';
import { VotingService } from '@/services/web3/domain/VotingService';
import { TransactionManager } from '@/services/web3/core/TransactionManager';
import { SmartAccountTransactionManager } from '@/services/web3/core/SmartAccountTransactionManager';
import { operationFixture } from '@/lib/accessV2/roleObservationFixtures';
import { roleContinuationScope } from '@/lib/accessV2/roleContinuationDraft';
import { fakeBrowserLocks, recoveryTestStorage } from '@/services/web3/core/submissionTestHelpers';
import { createSubmissionJournal } from '@/services/web3/core/submissionJournal';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';

const sign = vi.hoisted(() => vi.fn());
vi.mock('@/services/web3/passkey/passkeySign', () => ({ signUserOpWithPasskey: sign }));
const form = { name: 'Builders', sponsorship: { enabled: false } };
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('OFFLINE_NETWORK_FORBIDDEN'); }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** These are the actual core facade, service envelope and manager boundaries. Only
 * external source/wallet/bundler behavior is mocked, including the delayed clock. */
describe('role submission renews prepared evidence at actual EOA and sponsored dispatch', () => {
  it.each(['EOA gas', 'EOA nonce', 'sponsored gas', 'sponsored signing', 'EOA module', 'sponsored module', 'envelope'])('blocks stale evidence after %s without sending or publishing twice', async boundary => {
    const f = await operationFixture({}, form);
    let now = 1001; f.input.now = () => now;
    const expire = () => {
      if (boundary.endsWith('module')) {
        const block = { number: 124, hash: utils.id('changed modules'), timestamp: 1001 };
        f.indexedResponse._meta.block = block;
        f.indexedResponse.organization.executorContract.id = f.input.scope.contracts.membershipAuthority;
        f.provider.getBlock.mockResolvedValue(block);
      } else now = 1032;
    };
    const { account, contracts, orgId, chainId } = f.input.scope;
    const storage = recoveryTestStorage(), locks = fakeBrowserLocks();
    const send = vi.fn();
    const contract = { address: contracts.hybridVoting, interface: new utils.Interface(getAbi('HybridVotingNew')),
      estimateGas: { createProposal: async () => { if (['EOA gas', 'EOA module'].includes(boundary)) expire(); return BigNumber.from(100000); } }, createProposal: send };
    const publicClient = { getBlockNumber: async () => 123n };
    let manager;
    if (boundary.startsWith('sponsored')) {
      const journal = createSubmissionJournal({ accountAddress: account, chainId, entryPoint: ENTRY_POINT_ADDRESS, storage, locks });
      manager = new SmartAccountTransactionManager({ accountAddress: account, chainId, publicClient, bundlerClient: { sendUserOperation: send }, submissionJournal: journal });
      manager._buildUserOpWithFallback = async callData => {
        if (boundary === 'sponsored gas') expire();
        return { sender: account, nonce: 1n, callData, callGasLimit: 500000n, verificationGasLimit: 500000n,
          preVerificationGas: 50000n, maxFeePerGas: 7n, maxPriorityFeePerGas: 1n, signature: '0x' };
      };
      sign.mockImplementation(async () => { if (['sponsored signing', 'sponsored module'].includes(boundary)) expire(); return '0x1234'; });
    } else {
      manager = new TransactionManager({ getAddress: async () => account, getChainId: async () => chainId,
        getTransactionCount: async () => { if (boundary === 'EOA nonce') expire(); return 1; } },
      { accountAddress: account, chainId, publicClient, submissionStorage: storage, submissionLocks: locks });
    }
    const upload = vi.fn(async () => { if (boundary === 'envelope') expire(); return { path: bytes32ToCidV0(utils.id('ballot')) }; });
    const voting = new VotingService({ createWritable: () => contract }, manager, { addToIpfs: upload });
    const workflow = new RoleCreationService(f.input.readFactory).createWorkflow({
      scope: roleContinuationScope({ chainId, orgId, account, endpoint: f.input.endpoint,
        authority: contracts.membershipAuthority, hybridVoting: contracts.hybridVoting, executor: contracts.executor }),
      observe: async () => f.input, storage: () => storage, txManager: manager, voting,
      display: { uploadDocument: upload },
    });
    expect((await workflow.review(form)).plan.status).toBe('ready');
    const result = await workflow.submit({ form, proposal: { name: 'Builders', description: 'Ballot', durationMinutes: 60 } }).catch(error => error);
    expect(result.success).not.toBe(true); expect(send).not.toHaveBeenCalled(); expect(upload).toHaveBeenCalledOnce();
    expect(manager.getPendingSubmission()).toBeNull();
    await expect(workflow.submit({ form, proposal: { name: 'Builders', durationMinutes: 60 } })).rejects.toThrow('Review the current');
    expect(upload).toHaveBeenCalledOnce();
  });
});
