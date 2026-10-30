import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowserLocks } from '@/services/web3/core/submissionTestHelpers';
import { ethers } from 'ethers';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';

const mocks = vi.hoisted(() => ({ build: vi.fn(), passkeySign: vi.fn(), walletSign: vi.fn(), authorize: vi.fn() }));
vi.mock('@/services/web3/passkey/userOpBuilder', async importOriginal => ({
  ...await importOriginal(), buildUserOpWithFallback: mocks.build,
}));
vi.mock('@/services/web3/passkey/passkeySign', () => ({ signUserOpWithPasskey: mocks.passkeySign }));
vi.mock('@/services/web3/eip7702/walletSigner', () => ({ signUserOpWithWallet: mocks.walletSign }));
vi.mock('@/services/web3/eip7702/authorizationBuilder', () => ({ buildEOAAuthorization: mocks.authorize }));

import { SmartAccountTransactionManager } from '@/services/web3/core/SmartAccountTransactionManager';
import { EOA7702TransactionManager } from '@/services/web3/eip7702/EOA7702TransactionManager';
import { createSubmissionJournal } from '@/services/web3/core/submissionJournal';
import { TransactionManager } from '@/services/web3/core/TransactionManager';
import { getUserOpHash } from '@/services/web3/passkey/userOpBuilder';
import { buildCreateTaskRaw } from '@poa-box/core/tx/task';
import { taskCreatedIdsFromResult } from '@/lib/tasks/receipts';

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const TARGET = '0x2222222222222222222222222222222222222222';
const PAYMASTER = '0x3333333333333333333333333333333333333333';
const FACTORY = '0x4444444444444444444444444444444444444444';
const TX_HASH = `0x${'aa'.repeat(32)}`;
const OTHER_HASH = `0x${'bb'.repeat(32)}`;
const BLOCK_HASH = `0x${'cc'.repeat(32)}`;
const events = new ethers.utils.Interface([
  'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)',
  'event UserOperationRevertReason(bytes32 indexed userOpHash, address indexed sender, uint256 nonce, bytes revertReason)',
]);
const accountInterface = new ethers.utils.Interface(['function execute(address,uint256,bytes)', 'function executeBatch(address[],uint256[],bytes[])']);
const targetContract = { address: TARGET, interface: new ethers.utils.Interface(['function deposit() payable']) };
const op = (overrides = {}) => ({
  sender: ACCOUNT, nonce: 9007199254740993123n, callData: '0x1234',
  callGasLimit: 500000n, verificationGasLimit: 500000n, preVerificationGas: 50000n,
  maxFeePerGas: 7n, maxPriorityFeePerGas: 1n, signature: '0x', ...overrides,
});
const outcomeLog = (hash, success, overrides = {}) => ({
  address: ENTRY_POINT_ADDRESS,
  ...events.encodeEventLog('UserOperationEvent', [hash, ACCOUNT, ethers.constants.AddressZero, op().nonce, success, 10, 20]),
  ...overrides,
});
const reasonLog = (hash, reason, overrides = {}) => ({
  address: ENTRY_POINT_ADDRESS,
  ...events.encodeEventLog('UserOperationRevertReason', [hash, ACCOUNT, op().nonce, reason]),
  ...overrides,
});

function setup(Manager, { receiptFactory, sendError, receiptError, managerConfig = {} } = {}) {
  let submittedOp;
  const order = [];
  const rawReceipt = { transactionHash: TX_HASH, blockNumber: 42, blockHash: BLOCK_HASH, status: 1, logs: [] };
  const bundlerClient = {
    sendUserOperation: vi.fn(async userOp => {
      order.push('send');
      submittedOp = userOp;
      if (sendError) throw sendError;
      return getUserOpHash(userOp, ENTRY_POINT_ADDRESS, 100);
    }),
    waitForUserOperationReceipt: vi.fn(async ({ hash }) => {
      order.push('wait');
      if (receiptError) throw receiptError;
      rawReceipt.logs = receiptFactory ? receiptFactory(hash) : [outcomeLog(hash, true)];
      // Contradictory bundler summary never overrides canonical target logs.
      return { success: true, reason: '0x50b2c4e1', receipt: rawReceipt };
    }),
    getUserOperationReceipt: vi.fn(async () => ({ receipt: { transactionHash: TX_HASH } })),
  };
  const publicClient = {
    getChainId: vi.fn(async () => 100),
    getBlock: vi.fn(async ({ blockNumber }) => ({ number: blockNumber, hash: BLOCK_HASH })),
    getBytecode: vi.fn(async () => '0x1234'),
    getTransactionReceipt: vi.fn(async () => ({ ...rawReceipt, logs: [outcomeLog(getUserOpHash(submittedOp, ENTRY_POINT_ADDRESS, 100), true)] })),
  };
  const fallbackTxManager = { execute: vi.fn(), executeBatch: vi.fn() };
  const manager = new Manager({
    accountAddress: ACCOUNT, rawCredentialId: 'mock-credential', walletClient: {},
    publicClient, bundlerClient, paymasterAddress: null, hatIds: [], chainId: 100,
    eoaDelegationAddress: TARGET, fallbackTxManager, ...managerConfig,
  });
  return { manager, bundlerClient, publicClient, rawReceipt, fallbackTxManager, order };
}

beforeEach(() => {
  vi.stubGlobal('navigator', { locks: fakeBrowserLocks() });
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.build.mockImplementation(async params => op({ callData: params.callData }));
  mocks.passkeySign.mockResolvedValue('0x1234');
  mocks.walletSign.mockResolvedValue('0x5678');
  mocks.authorize.mockResolvedValue({ address: TARGET });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe.each([['passkey', SmartAccountTransactionManager], ['wallet 7702', EOA7702TransactionManager]])('%s host with core protocol evidence', (_name, Manager) => {
  it.each(['single', 'batch'])('delivers the %s settled outcome once before clear despite later observer rejection', async mode => {
    const { manager, bundlerClient, rawReceipt } = setup(Manager);
    const onOutcome = vi.fn(async result => {
      if (onOutcome.mock.calls.length > 1) throw new Error('Second persistence attempt failed');
      expect(result.outcome.status).toBe('succeeded'); expect(result.receipt).toBe(rawReceipt);
      expect(manager.getPendingSubmission().computedHash).toBeTruthy();
      await Promise.resolve(); expect(manager.getPendingSubmission()).not.toBeNull();
    });
    const options = { onOutcome, onStateChange: async state => { if (state === 'success') throw new Error('WALLET_7702_UNSUPPORTED'); } };
    const result = mode === 'single' ? await manager.execute(targetContract, 'deposit', [], options)
      : await manager.executeBatch([{ contract: targetContract, method: 'deposit' }], options);
    expect(result.success).toBe(true); expect(result.receipt).toBe(rawReceipt);
    expect(onOutcome).toHaveBeenCalledOnce(); expect(bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
    expect(manager.getPendingSubmission()).toBeNull();
  });

  it('keeps a rejected durable settlement blocked without invoking the sink twice', async () => {
    const { manager, bundlerClient } = setup(Manager);
    const onOutcome = vi.fn(async () => { throw new Error('Durable outcome unavailable'); });
    const result = await manager.execute(targetContract, 'deposit', [], { onOutcome });
    expect(result.error.category).toBe('submission_unknown'); expect(onOutcome).toHaveBeenCalledOnce();
    expect(manager.getPendingSubmission().computedHash).toBeTruthy();
    expect((await manager.execute(targetContract, 'deposit')).error.category).toBe('submission_unknown');
    expect(bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
  });

  it('preserves native amount, gas policy, callbacks and raw receipt while journaling before send/wait', async () => {
    const { manager, rawReceipt, order, bundlerClient } = setup(Manager);
    const onStateChange = vi.fn();
    const journal = [];
    const onSubmitted = vi.fn(submission => { journal.push(submission); order.push(submission.phase); });
    const value = '9007199254740993123456789';
    const result = await manager.execute(targetContract, 'deposit', [], { value, onStateChange, onSubmitted, callGasLimitFloor: 1234567n });
    expect(result.success).toBe(true);
    expect(result.receipt).toBe(rawReceipt);
    expect(result.txHash).toBe(TX_HASH);
    expect(accountInterface.decodeFunctionData('execute', mocks.build.mock.calls[0][0].callData)[1].toString()).toBe(value);
    expect(mocks.build.mock.calls[0][0].gasOverrides.callGasLimitFloor).toBe(1234567n);
    expect(order).toEqual(['submitting', 'send', 'submitted', 'wait']);
    expect(journal.every(entry => !('signature' in entry) && !('callData' in entry))).toBe(true);
    expect(onStateChange.mock.calls.map(call => call[0])).toEqual(['estimating', 'awaiting_signature', 'pending', 'confirming', 'success']);
    expect(bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retains nested reviewed arguments across asynchronous browser lock acquisition', async () => {
    const { manager } = setup(Manager);
    const values = ['1', '2'];
    const acquire = manager.submissionJournal.acquire.bind(manager.submissionJournal);
    manager.submissionJournal.acquire = async () => { values[0] = '9'; return acquire(); };
    const target = { address: TARGET, interface: new ethers.utils.Interface(['function depositMany(uint256[] amounts)']) };
    expect((await manager.execute(target, 'depositMany', [values])).success).toBe(true);
    const inner = accountInterface.decodeFunctionData('execute', mocks.build.mock.calls[0][0].callData)[2];
    expect(target.interface.decodeFunctionData('depositMany', inner)[0].map(value => value.toString())).toEqual(['1', '2']);
  });

  it.each(['single', 'batch'])('awaits rejected final review before any signing or dispatch for %s calls', async mode => {
    const { manager, bundlerClient, fallbackTxManager } = setup(Manager);
    const beforeSend = vi.fn(async () => { await Promise.resolve(); throw new Error('The reviewed proposal changed.'); });
    const result = mode === 'single'
      ? await manager.execute(targetContract, 'deposit', [], { beforeSend })
      : await manager.executeBatch([{ contract: targetContract, method: 'deposit' }], { beforeSend });
    expect(result.success).toBe(false);
    expect(mocks.passkeySign).not.toHaveBeenCalled();
    expect(mocks.walletSign).not.toHaveBeenCalled();
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(bundlerClient.sendUserOperation).not.toHaveBeenCalled();
    expect(fallbackTxManager.execute).not.toHaveBeenCalled();
    expect(manager.getPendingSubmission()).toBeNull();
    expect((await manager.execute(targetContract, 'deposit')).success).toBe(true);
  });

  it.each(['account', 'chain'])('rechecks %s scope after the awaited review before signing', async scope => {
    let current = true;
    const { manager, bundlerClient } = setup(Manager, { managerConfig: {
      scopeGuard: () => { if (!current) throw new Error(`${scope} changed`); },
    } });
    const result = await manager.execute(targetContract, 'deposit', [], {
      beforeSend: async () => { await Promise.resolve(); current = false; },
    });
    expect(result.success).toBe(false);
    expect(mocks.passkeySign).not.toHaveBeenCalled();
    expect(mocks.walletSign).not.toHaveBeenCalled();
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(bundlerClient.sendUserOperation).not.toHaveBeenCalled();
    expect(manager.getPendingSubmission()).toBeNull();
  });

  it.each(['single', 'batch'])('revalidates after the signing prompt and refuses stale %s dispatch without an uncertain barrier', async mode => {
    const { manager, bundlerClient, fallbackTxManager } = setup(Manager);
    let reviewed = true;
    (Manager === SmartAccountTransactionManager ? mocks.passkeySign : mocks.walletSign).mockImplementationOnce(async () => {
      reviewed = false; return '0x1234';
    });
    const beforeSend = vi.fn(async () => { if (!reviewed) throw new Error('The reviewed proposal expired.'); });
    const result = mode === 'single'
      ? await manager.execute(targetContract, 'deposit', [], { beforeSend })
      : await manager.executeBatch([{ contract: targetContract, method: 'deposit' }], { beforeSend });
    expect(result.success).toBe(false);
    expect(result.error.category).not.toBe('submission_unknown');
    expect(bundlerClient.sendUserOperation).not.toHaveBeenCalled();
    expect(fallbackTxManager.execute).not.toHaveBeenCalled();
    expect(manager.getPendingSubmission()).toBeNull();
    expect(beforeSend).toHaveBeenCalledTimes(Manager === SmartAccountTransactionManager ? 2 : 3);
  });

  it('does not prompt or submit again when signing is cancelled', async () => {
    const { manager, bundlerClient, fallbackTxManager } = setup(Manager);
    const sign = Manager === SmartAccountTransactionManager ? mocks.passkeySign : mocks.walletSign;
    sign.mockRejectedValueOnce(Object.assign(new Error('User rejected the request.'), { code: 4001, name: 'NotAllowedError' }));
    expect((await manager.execute(targetContract, 'deposit')).success).toBe(false);
    expect(sign).toHaveBeenCalledOnce();
    expect(bundlerClient.sendUserOperation).not.toHaveBeenCalled();
    expect(fallbackTxManager.execute).not.toHaveBeenCalled();
    expect(manager.getPendingSubmission()).toBeNull();
  });

  if (Manager === EOA7702TransactionManager) {
    it.each(['account', 'chain'])('rejects a wrong ambient wallet %s before any authorization or dispatch', async field => {
      const walletClient = { account: { address: field === 'account' ? TARGET : ACCOUNT }, chain: { id: field === 'chain' ? 42161 : 100 } };
      const { manager, bundlerClient } = setup(Manager, { managerConfig: { walletClient } });
      expect((await manager.execute(targetContract, 'deposit')).success).toBe(false);
      expect(mocks.authorize).not.toHaveBeenCalled(); expect(mocks.walletSign).not.toHaveBeenCalled();
      expect(bundlerClient.sendUserOperation).not.toHaveBeenCalled();
      expect(manager.getPendingSubmission()).toBeNull();
    });
    it.each(['account', 'chain'])('rechecks the active wallet %s after its signing prompt before bundler dispatch', async field => {
      const walletClient = { account: { address: ACCOUNT }, chain: { id: 100 } };
      const { manager, bundlerClient, fallbackTxManager } = setup(Manager, { managerConfig: { walletClient } });
      mocks.walletSign.mockImplementationOnce(async () => {
        if (field === 'account') walletClient.account.address = TARGET;
        else walletClient.chain.id = 42161;
        return '0x1234';
      });
      expect((await manager.execute(targetContract, 'deposit')).success).toBe(false);
      expect(mocks.walletSign).toHaveBeenCalledOnce();
      expect(bundlerClient.sendUserOperation).not.toHaveBeenCalled();
      expect(fallbackTxManager.execute).not.toHaveBeenCalled();
      expect(manager.getPendingSubmission()).toBeNull();
    });
    it('treats rejected delegation as final without personal signing or direct fallback', async () => {
      const { manager, bundlerClient, fallbackTxManager } = setup(Manager);
      mocks.authorize.mockRejectedValueOnce(Object.assign(new Error('User rejected delegation'), { code: 4001 }));
      expect((await manager.execute(targetContract, 'deposit')).error.category).toBe('user_rejected');
      expect(mocks.authorize).toHaveBeenCalledOnce(); expect(mocks.walletSign).not.toHaveBeenCalled();
      expect(bundlerClient.sendUserOperation).not.toHaveBeenCalled();
      expect(fallbackTxManager.execute).not.toHaveBeenCalled();
      expect(manager.getPendingSubmission()).toBeNull();
    });
  }

  it('encodes exact native values for each atomic batch action and rejects unallocated batch value', async () => {
    const { manager, bundlerClient } = setup(Manager);
    const result = await manager.executeBatch([
      { contract: targetContract, method: 'deposit', options: { value: ethers.BigNumber.from('9007199254740993123456789') } },
      { contract: targetContract, method: 'deposit', options: { value: 7n } },
    ]);
    expect(result.success).toBe(true);
    const decoded = accountInterface.decodeFunctionData('executeBatch', mocks.build.mock.calls[0][0].callData);
    expect(decoded[1].map(value => value.toString())).toEqual(['9007199254740993123456789', '7']);
    const invalid = await manager.executeBatch([{ contract: targetContract, method: 'deposit' }], { value: '1' });
    expect(invalid.success).toBe(false);
    expect(bundlerClient.sendUserOperation).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('uses only the matching operation in a mixed receipt (reversed=%s)', async reverse => {
    const { manager, bundlerClient } = setup(Manager, { receiptFactory: hash => {
      const logs = [outcomeLog(OTHER_HASH, false), reasonLog(OTHER_HASH, '0x50b2c4e1'), outcomeLog(hash, true)];
      return reverse ? logs.reverse() : logs;
    } });
    const result = await manager.execute(targetContract, 'deposit');
    expect(result.success).toBe(true);
    expect(bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
  });

  it('retains unknown task IDs for identical creations across two bundled operations without inventing operation log scope', async () => {
    const draft = { projectId: `0x${'01'.repeat(32)}`, payoutRaw: '9007199254740993', title: 'Repeated draft',
      metadataHash: `0x${'ab'.repeat(32)}`, bountyToken: ethers.constants.AddressZero, bountyPayoutRaw: '0', requiresApplication: false };
    const intent = buildCreateTaskRaw({ ...draft, taskManagerAddress: TARGET, features: { deadlines: true } });
    const contract = { address: TARGET, interface: new ethers.utils.Interface(intent.abi) };
    const taskLog = id => ({ address: TARGET, ...contract.interface.encodeEventLog('TaskCreated', [id, draft.projectId,
      draft.payoutRaw, draft.bountyToken, draft.bountyPayoutRaw, false, ethers.utils.toUtf8Bytes(draft.title), draft.metadataHash]) });
    const { manager, rawReceipt } = setup(Manager, { receiptFactory: hash => [taskLog('7'), taskLog('8'), outcomeLog(OTHER_HASH, true),
      taskLog('9'), taskLog('10'), outcomeLog(hash, true)] });
    const result = await manager.executeBatch([1, 2].map(() => ({ contract, method: intent.method, args: intent.args })));
    expect(result.success).toBe(true); expect(result.receipt).toBe(rawReceipt);
    expect(result.receipt.logs).toHaveLength(6); expect(result).not.toHaveProperty('creationOperation');
    expect(taskCreatedIdsFromResult(result, TARGET, [draft, draft], { requiresOperationScope: true }))
      .toMatchObject({ state: 'unknown', code: 'CREATION_OPERATION_SCOPE_UNAVAILABLE' });
  });

  it('surfaces the matching inner failure and ignores unrelated and wrong-emitter reasons without retry', async () => {
    const { manager, bundlerClient, fallbackTxManager } = setup(Manager, { receiptFactory: hash => [
      outcomeLog(OTHER_HASH, true), outcomeLog(hash, false),
      reasonLog(OTHER_HASH, '0x50b2c4e1'), reasonLog(hash, '0x50b2c4e1', { address: TARGET }), reasonLog(hash, '0x5c975bda'),
    ] });
    const result = await manager.execute(targetContract, 'deposit');
    expect(result.success).toBe(false);
    expect(result.error.userMessage).toMatch(/right state/i);
    expect(result.error.userMessage).not.toMatch(/budget/i);
    expect(bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
    expect(fallbackTxManager.execute).not.toHaveBeenCalled();
  });

  it.each(['missing', 'wrong-emitter', 'duplicate', 'malformed'])('keeps %s target evidence unknown and prevents a new send until read-only recovery settles it', async mode => {
    const { manager, bundlerClient, publicClient, fallbackTxManager } = setup(Manager, { receiptFactory: hash => {
      if (mode === 'missing') return [outcomeLog(OTHER_HASH, true)];
      if (mode === 'wrong-emitter') return [outcomeLog(hash, true, { address: TARGET })];
      if (mode === 'duplicate') return [outcomeLog(hash, true), outcomeLog(hash, false)];
      return [outcomeLog(hash, true, { data: '0xab' })];
    } });
    const first = await manager.execute(targetContract, 'deposit');
    expect(first.success).toBe(false);
    expect(first.error.category).toBe('submission_unknown');
    const second = await manager.execute(targetContract, 'deposit');
    expect(second.error.category).toBe('submission_unknown');
    expect(bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
    const recovered = await manager.reconcileSubmission();
    expect(recovered.outcome.status).toBe('succeeded');
    expect(publicClient.getTransactionReceipt).toHaveBeenCalledTimes(2);
    expect(publicClient.getTransactionReceipt).toHaveBeenCalledWith({ hash: TX_HASH });
    expect(publicClient.getBlock).toHaveBeenCalledTimes(2);
    expect(bundlerClient.getUserOperationReceipt).toHaveBeenCalledExactlyOnceWith({ hash: first.error.submission.computedHash });
    expect(bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
    expect(fallbackTxManager.execute).not.toHaveBeenCalled();
  });

  it.each(['send-timeout', 'receipt-timeout', 'callback-after-send', 'hash-mismatch', 'capture-after-send', 'capture-before-clear'])('retains identity and sends once after %s even with paymaster context', async mode => {
    const timeout = new Error('HTTP request timed out. Details: AA33 validatePaymasterUserOp');
    const { manager, bundlerClient, fallbackTxManager } = setup(Manager, {
      sendError: mode === 'send-timeout' ? timeout : null,
      receiptError: mode === 'receipt-timeout' ? timeout : null,
    });
    mocks.build.mockImplementation(async params => op({ callData: params.callData, paymaster: PAYMASTER, paymasterData: '0x', paymasterVerificationGasLimit: 1n, paymasterPostOpGasLimit: 1n }));
    if (mode === 'hash-mismatch') bundlerClient.sendUserOperation.mockResolvedValueOnce(OTHER_HASH);
    const result = await manager.execute(targetContract, 'deposit', [], {
      onRecoveryRecord: async submission => {
        await Promise.resolve();
        if (mode === 'capture-after-send' && submission.phase === 'submitted') throw new Error('Host capture failed');
      },
      onOutcome: async result => { if (mode === 'capture-before-clear' && result?.receipt) throw new Error('Host outcome failed'); },
      onSubmitted: submission => { if (mode === 'callback-after-send' && submission.phase === 'submitted') throw new Error('AA33 WALLET_7702_UNSUPPORTED'); },
    });
    expect(result.success).toBe(false);
    expect(result.error.category).toBe('submission_unknown');
    expect(result.error.submission.computedHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
    expect(mocks.build).toHaveBeenCalledOnce();
    expect(fallbackTxManager.execute).not.toHaveBeenCalled();
    await manager.executeBatch([{ contract: targetContract, method: 'deposit' }]);
    expect(bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
  });

  it('awaits recovery capture and refuses any dispatch when durable capture fails', async () => {
    const { manager, bundlerClient, fallbackTxManager } = setup(Manager);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const capture = vi.fn(async () => { await gate; throw new Error('Host persistence unavailable'); });
    const pending = manager.execute(targetContract, 'deposit', [], { onRecoveryRecord: capture });
    await vi.waitFor(() => expect(capture).toHaveBeenCalled());
    expect(bundlerClient.sendUserOperation).not.toHaveBeenCalled();
    release(); expect((await pending).success).toBe(false);
    expect(bundlerClient.sendUserOperation).not.toHaveBeenCalled(); expect(fallbackTxManager.execute).not.toHaveBeenCalled();
  });

  it('rebuilds and re-signs once for an explicit paymaster admission refusal, retaining deployment data and gas policy', async () => {
    const { manager, bundlerClient } = setup(Manager);
    bundlerClient.sendUserOperation.mockRejectedValueOnce(new Error('AA33 validatePaymasterUserOp reverted\nDocs: https://bundler.test/errors'));
    mocks.build
      .mockResolvedValueOnce(op({ paymaster: PAYMASTER, paymasterData: '0x', paymasterVerificationGasLimit: 1n, paymasterPostOpGasLimit: 1n, factory: FACTORY, factoryData: '0x1234' }))
      .mockImplementationOnce(async params => op({ callData: params.callData, factory: FACTORY, factoryData: '0x1234' }));
    const attempts = [], outcomes = [];
    const result = await manager.execute(targetContract, 'deposit', [], { callGasLimitFloor: 1234567n,
      onOutcome: async result => { attempts.push(manager.getPendingSubmission().recovery.attemptId); outcomes.push(result); } });
    expect(result.success).toBe(true);
    expect(outcomes).toHaveLength(2);
    expect(outcomes[0]).toMatchObject({ success: false, submissionState: 'not-submitted' });
    expect(outcomes[1].outcome.status).toBe('succeeded'); expect(new Set(attempts).size).toBe(2);
    expect(bundlerClient.sendUserOperation).toHaveBeenCalledTimes(2);
    expect(mocks.build.mock.calls[1][0].gasOverrides.callGasLimitFloor).toBe(1234567n);
    if (Manager === SmartAccountTransactionManager) {
      expect(mocks.build.mock.calls[1][0].initCode).toBe(`${FACTORY}1234`);
      expect(mocks.passkeySign).toHaveBeenCalledTimes(2);
    } else expect(mocks.walletSign).toHaveBeenCalledTimes(2);
  });

  it('revalidates an explicit sponsorship retry before requesting another signature', async () => {
    const { manager, bundlerClient, fallbackTxManager } = setup(Manager);
    bundlerClient.sendUserOperation.mockRejectedValueOnce(new Error('AA33 validatePaymasterUserOp reverted'));
    mocks.build.mockResolvedValueOnce(op({ paymaster: PAYMASTER, paymasterData: '0x', paymasterVerificationGasLimit: 1n, paymasterPostOpGasLimit: 1n }));
    const beforeSend = async () => { if (bundlerClient.sendUserOperation.mock.calls.length) throw new Error('The reviewed proposal changed.'); };
    expect((await manager.execute(targetContract, 'deposit', [], { beforeSend })).success).toBe(false);
    expect(Manager === SmartAccountTransactionManager ? mocks.passkeySign : mocks.walletSign).toHaveBeenCalledOnce();
    expect(bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
    expect(fallbackTxManager.execute).not.toHaveBeenCalled();
    expect(manager.getPendingSubmission()).toBeNull();
  });

  it.each(['missing-block', 'orphaned-block', 'changed-receipt', 'changed-chain'])('retains the nonce barrier for %s recovery evidence without resubmitting', async mode => {
    const { manager, bundlerClient, publicClient, rawReceipt } = setup(Manager, { receiptError: new Error('Receipt timed out') });
    expect((await manager.execute(targetContract, 'deposit')).error.category).toBe('submission_unknown');
    if (mode === 'missing-block') delete rawReceipt.blockHash;
    if (mode === 'orphaned-block') publicClient.getBlock.mockResolvedValue({ number: 42n, hash: OTHER_HASH });
    if (mode === 'changed-receipt') publicClient.getTransactionReceipt.mockImplementationOnce(async () => ({ ...rawReceipt,
      logs: [outcomeLog(manager.getPendingSubmission().computedHash, true)] })).mockImplementationOnce(async () => ({ ...rawReceipt,
      blockHash: OTHER_HASH, logs: [outcomeLog(manager.getPendingSubmission().computedHash, true)] }));
    if (mode === 'changed-chain') publicClient.getChainId.mockResolvedValueOnce(100).mockResolvedValueOnce(42161);
    expect((await manager.reconcileSubmission()).outcome.status).toBe('unknown');
    expect(manager.getPendingSubmission()).not.toBeNull();
    expect((await manager.execute(targetContract, 'deposit')).error.category).toBe('submission_unknown');
    expect(bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
  });

  it('never treats a journal callback failure as a paymaster admission refusal', async () => {
    const { manager, bundlerClient, fallbackTxManager } = setup(Manager);
    mocks.build.mockResolvedValueOnce(op({ paymaster: PAYMASTER, paymasterData: '0x', paymasterVerificationGasLimit: 1n, paymasterPostOpGasLimit: 1n }));
    const result = await manager.execute(targetContract, 'deposit', [], {
      onSubmitted: () => { throw new Error('AA33 validatePaymasterUserOp reverted'); },
    });
    expect(result.success).toBe(false);
    expect(mocks.build).toHaveBeenCalledOnce();
    expect(bundlerClient.sendUserOperation).not.toHaveBeenCalled();
    expect(fallbackTxManager.execute).not.toHaveBeenCalled();
  });

  it('never triggers direct fallback from a lifecycle callback after a confirmed send', async () => {
    const { manager, bundlerClient, fallbackTxManager } = setup(Manager);
    const result = await manager.execute(targetContract, 'deposit', [], {
      onStateChange: state => { if (state === 'success') throw new Error('WALLET_7702_UNSUPPORTED'); },
    });
    expect(result.success).toBe(true); // An observer failure cannot replace the confirmed outcome.
    expect(bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
    expect(fallbackTxManager.execute).not.toHaveBeenCalled();
  });

  it('rejects recovery against a different chain before consulting any receipt reader', async () => {
    const { manager, bundlerClient, publicClient } = setup(Manager);
    await expect(manager.reconcileSubmission({ chainId: 42161, entryPoint: ENTRY_POINT_ADDRESS, computedHash: OTHER_HASH })).rejects.toThrow('network where it was submitted');
    expect(bundlerClient.getUserOperationReceipt).not.toHaveBeenCalled();
    expect(publicClient.getTransactionReceipt).not.toHaveBeenCalled();
  });
});

it('shares one durable settlement delivery across 7702 and its actual direct fallback', async () => {
  const signer = { getAddress: async () => ACCOUNT, getChainId: async () => 100, getTransactionCount: async () => 7 };
  const receipt = { transactionHash: TX_HASH, blockNumber: 42, status: 1 };
  const contract = { ...targetContract, estimateGas: { deposit: async () => ethers.BigNumber.from(100000) },
    deposit: vi.fn(async () => ({ hash: TX_HASH, wait: async () => receipt })) };
  const fallbackTxManager = new TransactionManager(signer, { accountAddress: ACCOUNT, chainId: 100,
    publicClient: { getBlockNumber: async () => 40n } });
  const { manager, bundlerClient } = setup(EOA7702TransactionManager, { managerConfig: { fallbackTxManager } });
  mocks.authorize.mockRejectedValueOnce(new Error('WALLET_7702_UNSUPPORTED'));
  const onOutcome = vi.fn(async result => {
    if (onOutcome.mock.calls.length > 1) throw new Error('Second persistence attempt failed');
    expect(result.outcome.status).toBe('succeeded'); expect(manager.getPendingSubmission().txHash).toBe(TX_HASH);
  });
  const result = await manager.execute(contract, 'deposit', [], { onOutcome });
  expect(result, JSON.stringify(result)).toMatchObject({ success: true }); expect(result.receipt).toBe(receipt); expect(onOutcome).toHaveBeenCalledOnce();
  expect(contract.deposit).toHaveBeenCalledOnce(); expect(bundlerClient.sendUserOperation).not.toHaveBeenCalled();
  expect(manager.getPendingSubmission()).toBeNull();
});

function browserStorage() {
  const rows = new Map();
  return { getItem: key => rows.get(key) || null, setItem: (key, value) => rows.set(key, value), removeItem: key => rows.delete(key), rows };
}
describe.each([['passkey', SmartAccountTransactionManager], ['EOA 7702', EOA7702TransactionManager]])('%s durable host integration', (_name, Manager) => {
  it('survives manager recreation and prevents resubmission until read-only recovery', async () => {
    const storage = browserStorage();
    vi.stubGlobal('window', { localStorage: storage });
    const first = setup(Manager, { sendError: new Error('response lost') });
    const failed = await first.manager.execute(targetContract, 'deposit');
    expect(failed.error.category).toBe('submission_unknown');
    expect([...storage.rows.values()][0]).not.toMatch(/signature|callData|rawCredentialId|publicKey|apikey|rpcUrl/);
    const restored = setup(Manager);
    expect((await restored.manager.execute(targetContract, 'deposit')).error.submission.computedHash).toBe(failed.error.submission.computedHash);
    expect(restored.bundlerClient.sendUserOperation).not.toHaveBeenCalled();
    expect(mocks.build).toHaveBeenCalledOnce();
    restored.publicClient.getTransactionReceipt.mockResolvedValue({ status: 1, transactionHash: TX_HASH, blockNumber: 42, blockHash: BLOCK_HASH, logs: [outcomeLog(failed.error.submission.computedHash, true)] });
    expect((await restored.manager.reconcileSubmission()).outcome.status).toBe('succeeded');
    expect(storage.rows.size).toBe(0);
    expect(restored.bundlerClient.sendUserOperation).not.toHaveBeenCalled();
    expect((await restored.manager.execute(targetContract, 'deposit')).success).toBe(true);
  });
  it('also blocks direct EOA sends while an earlier UserOp remains unresolved', async () => {
    vi.stubGlobal('window', { localStorage: browserStorage() });
    await setup(Manager, { receiptError: new Error('offline') }).manager.execute(targetContract, 'deposit');
    const send = vi.fn();
    const direct = new TransactionManager({}, { accountAddress: ACCOUNT, chainId: 100 });
    expect((await direct.execute({ ...targetContract, deposit: send }, 'deposit')).error.category).toBe('submission_unknown');
    expect(send).not.toHaveBeenCalled();
  });
  it('refuses persistence failure before transport', async () => {
    const storage = browserStorage();
    storage.setItem = () => { throw new Error('storage unavailable'); };
    const journal = createSubmissionJournal({ accountAddress: ACCOUNT, chainId: 100, entryPoint: ENTRY_POINT_ADDRESS, storage });
    const { manager, bundlerClient } = setup(Manager, { managerConfig: { submissionJournal: journal } });
    expect((await manager.execute(targetContract, 'deposit')).success).toBe(false);
    expect(bundlerClient.sendUserOperation).not.toHaveBeenCalled();
  });
  it.each(['building', 'signing', 'receipt'])('invalidates changed account during %s and suppresses stale callbacks', async stage => {
    let current = true;
    const guard = () => { if (!current) throw new Error('Account changed'); };
    const { manager, bundlerClient } = setup(Manager, { managerConfig: { scopeGuard: guard } });
    if (stage === 'building') mocks.build.mockImplementation(async params => { current = false; return op({ callData: params.callData }); });
    if (stage === 'signing') (Manager === SmartAccountTransactionManager ? mocks.passkeySign : mocks.walletSign).mockImplementation(async () => { current = false; return '0x1234'; });
    if (stage === 'receipt') bundlerClient.waitForUserOperationReceipt.mockImplementation(async ({ hash }) => { current = false; return { receipt: { status: 1, logs: [outcomeLog(hash, true)], transactionHash: TX_HASH } }; });
    const callback = vi.fn();
    expect((await manager.execute(targetContract, 'deposit', [], { onStateChange: callback })).success).toBe(stage === 'receipt');
    expect(callback.mock.calls.map(([state]) => state)).not.toContain('success');
    expect(callback.mock.calls.map(([state]) => state)).not.toContain('error');
    expect(bundlerClient.sendUserOperation).toHaveBeenCalledTimes(stage === 'receipt' ? 1 : 0);
  });
});
