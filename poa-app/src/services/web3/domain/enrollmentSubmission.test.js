import { fakeBrowserLocks } from '@/services/web3/core/submissionTestHelpers';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { p256 } from '@noble/curves/p256';
import { USER_OPERATION_EVENTS } from '@poa-box/core/execute/outcome';
import { projectGroth16Proof } from '@poa-box/core/email/proof';
import { retainEmailProofProjection } from '@/lib/zkemail/proofProjection';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';
import { PasskeyOnboardingService, OnboardingStep } from '@/services/web3/domain/PasskeyOnboardingService';
import { ZkEmailOnboardingService } from '@/services/web3/domain/ZkEmailOnboardingService';
import { OrganizationService } from '@/services/web3/domain/OrganizationService';
import { getUserOpHash } from '@/services/web3/passkey/userOpBuilder';
import { getPendingCredentialForOrg } from '@/services/web3/passkey/passkeyStorage';
import { enrollmentStorageKey } from '@/services/web3/domain/enrollmentSubmission';
import { listPendingSubmissions } from '@/services/web3/core/submissionJournal';

const mocks = vi.hoisted(() => ({ build: vi.fn(), create: vi.fn(), sign: vi.fn(), register: vi.fn() }));
vi.mock('@/services/web3/passkey/userOpBuilder', async original => ({ ...await original(), buildUserOp: mocks.build, buildUserOpWithFallback: mocks.build }));
vi.mock('@/services/web3/passkey/passkeyCreate', () => ({ createPasskeyCredential: mocks.create }));
vi.mock('@/services/web3/passkey/passkeySign', () => ({ signUserOpWithPasskey: mocks.sign, signRegistrationChallenge: mocks.register }));
const ACCOUNT = '0x1111111111111111111111111111111111111111';
const FACTORY = '0x2222222222222222222222222222222222222222';
const REGISTRY = '0x3333333333333333333333333333333333333333';
const JOIN = '0x4444444444444444444444444444444444444444';
const ORG = `0x${'aa'.repeat(32)}`;
const TX = `0x${'bb'.repeat(32)}`;
const OTHER_HASH = `0x${'cc'.repeat(32)}`;
const BLOCK_HASH = `0x${'dd'.repeat(32)}`;
const NONCE = 9007199254740993123456789n;
const point = Buffer.from(p256.getPublicKey('01'.padStart(64, '0'), false)).toString('hex');
const credential = { credentialId: ethers.utils.keccak256(Buffer.from([1, 2, 3])), rawCredentialId: Buffer.from([1, 2, 3]).toString('base64url'),
  publicKeyX: `0x${point.slice(2, 66)}`, publicKeyY: `0x${point.slice(66)}`, salt: NONCE };
const registration = { authenticatorData: '0x1234', clientDataJSON: '0x73796e746865746963', challengeIndex: 3n, typeIndex: 4n, r: `0x${'55'.repeat(32)}`, s: `0x${'66'.repeat(32)}` };
function memoryStorage() {
  const records = new Map();
  return { records, get length() { return records.size; }, key: index => [...records.keys()][index],
    getItem: key => records.get(key) ?? null, setItem: vi.fn((key, value) => records.set(key, value)), removeItem: vi.fn(key => records.delete(key)) };
}
const op = params => ({ sender: params.sender, nonce: NONCE, callData: params.callData,
  ...(params.initCode !== '0x' ? { factory: params.initCode.slice(0, 42), factoryData: `0x${params.initCode.slice(42)}` } : {}),
  callGasLimit: 500000n, verificationGasLimit: 500000n, preVerificationGas: 50000n,
  maxFeePerGas: 7n, maxPriorityFeePerGas: 1n, signature: '0x' });
const event = (hash, success = true, { sender = ACCOUNT, nonce = NONCE, entryPoint = ENTRY_POINT_ADDRESS } = {}) => ({
  address: entryPoint, ...USER_OPERATION_EVENTS.encodeEventLog('UserOperationEvent', [hash, sender, ethers.constants.AddressZero, nonce, success, 10, 20]),
});
const prepared = (version = 'v2') => retainEmailProofProjection(projectGroth16Proof({ version, claimer: ACCOUNT,
  proof: { pi_a: ['1', '2', '1'], pi_b: [['3', '4'], ['5', '6'], ['1', '0']], pi_c: ['7', '8', '1'] },
  publicSignals: version === 'v2' ? ['1', '2', BigInt(ACCOUNT).toString(), '3', '4'] : ['1', '2', BigInt(ACCOUNT).toString(), '4'] }));
let storage;
function setup(kind, { failure, logs, status = 'success', guard = () => {}, deployed = false } = {}) {
  let hash;
  const rawReceipt = { transactionHash: TX, blockNumber: 123n, blockHash: BLOCK_HASH, status, logs: [] };
  const publicClient = { getChainId: vi.fn(async () => 100),
    getBlock: vi.fn(async ({ blockNumber }) => ({ number: blockNumber, hash: BLOCK_HASH })),
    getBytecode: vi.fn(async ({ address }) => address.toLowerCase() === ACCOUNT && !deployed ? '0x' : '0x1234'),
    readContract: vi.fn(async ({ functionName }) => functionName === 'getAddress' ? ACCOUNT
      : functionName === 'getAddressOfUsername' ? ethers.constants.AddressZero : NONCE),
    getTransactionReceipt: vi.fn(async () => rawReceipt) };
  const bundlerClient = {
    sendUserOperation: vi.fn(async userOp => {
      hash = getUserOpHash(userOp, ENTRY_POINT_ADDRESS, 100);
      // Browser persistence precedes every possible transport outcome.
      expect(listPendingSubmissions(ACCOUNT)).toEqual([expect.objectContaining({ phase: 'submitting', computedHash: hash, sender: ACCOUNT, nonce: NONCE.toString(), chainId: 100 })]);
      const pending = getPendingCredentialForOrg(ORG);
      expect(pending).toMatchObject({ accountAddress: ACCOUNT, credentialChainId: 100, registryAddress: REGISTRY, factoryAddress: FACTORY, salt: NONCE.toString() });
      if (failure === 'lost-response') throw new Error('Network response lost');
      if (failure === 'refused') throw new Error('AA33 paymaster validation reverted');
      return failure === 'mismatched-hash' ? OTHER_HASH : hash;
    }),
    waitForUserOperationReceipt: vi.fn(async () => {
      if (failure === 'timeout') throw new Error('Receipt timeout');
      rawReceipt.logs = logs ? logs(hash) : [event(OTHER_HASH, false), event(hash)];
      return { success: true, receipt: rawReceipt };
    }),
    getUserOperationReceipt: vi.fn(async () => ({ receipt: { transactionHash: TX } })),
  };
  const params = { publicClient, bundlerClient, factoryAddress: FACTORY, registryAddress: REGISTRY, quickJoinAddress: JOIN, zkEmailInvitesAddress: JOIN,
    paymasterAddress: JOIN, orgId: ORG, hatId: '7', chainId: 100, scopeGuard: guard };
  const create = () => kind === 'email' ? new ZkEmailOnboardingService(params) : new PasskeyOnboardingService({ ...params, mode: kind === 'solidarity' ? 'solidarity' : 'org' });
  const service = create();
  const onStep = vi.fn();
  const invoke = (instance = service, mode = 'email') => kind === 'email'
    ? instance.registerAndClaim({ credential, accountAddress: ACCOUNT, username: 'member', mode, proof: prepared(mode === 'email' ? 'v2' : 'v1'), hatIds: ['7'], merkleProof: [], onStep })
    : instance.onboard('member', onStep);
  return { service, invoke, create, params, onStep, publicClient, bundlerClient, rawReceipt, getHash: () => hash };
}
beforeEach(() => {
  vi.stubGlobal('navigator', { locks: fakeBrowserLocks() });
  vi.clearAllMocks(); storage = memoryStorage(); vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage, dispatchEvent: vi.fn() });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
  mocks.build.mockImplementation(async params => op(params)); mocks.create.mockResolvedValue(credential);
  mocks.sign.mockResolvedValue('0xabcdef'); mocks.register.mockResolvedValue(registration);
});
afterEach(() => vi.unstubAllGlobals());
describe.each(['org', 'solidarity', 'email'])('%s enrollment submission lifecycle', kind => {
  it('requires canonical inner success, preserves public result/progress, and clears only the matched journal', async () => {
    const h = setup(kind);
    expect(await h.invoke()).toMatchObject({ accountAddress: ACCOUNT, transactionHash: TX });
    expect(h.onStep.mock.calls.map(([step]) => step)).toContain('confirming');
    if (kind !== 'email') expect(h.onStep.mock.calls.at(-1)).toEqual([OnboardingStep.SUCCESS, expect.objectContaining({ salt: NONCE.toString(), rawCredentialId: credential.rawCredentialId })]);
    expect(listPendingSubmissions(ACCOUNT)).toEqual([]);
    expect(h.bundlerClient.sendUserOperation).toHaveBeenCalledOnce(); expect(fetch).not.toHaveBeenCalled();
    // No signatures, proof payloads or operation body are written to either store.
    const persisted = storage.setItem.mock.calls.map(([, value]) => value).join('\n');
    expect(persisted).not.toMatch(/signature|callData|authenticatorData|clientDataJSON|0xabcdef|pA|pB/);
  });
  it.each(['lost-response', 'timeout', 'mismatched-hash'])('keeps %s unknown across service recreation without another signature/send', async failure => {
    const h = setup(kind, { failure });
    await expect(h.invoke()).rejects.toMatchObject({ category: 'submission_unknown', userMessage: expect.stringContaining('status') });
    const record = h.service.getPendingSubmission(ACCOUNT);
    expect(record).toMatchObject({ computedHash: h.getHash(), sender: ACCOUNT, nonce: NONCE.toString() });
    await expect(h.invoke(h.create())).rejects.toMatchObject({ category: 'submission_unknown' });
    expect(h.bundlerClient.sendUserOperation).toHaveBeenCalledOnce(); expect(mocks.sign).toHaveBeenCalledOnce();
    if (kind !== 'email') expect(mocks.create).toHaveBeenCalledOnce();
  });
  it.each(['missing', 'wrong-sender', 'wrong-nonce', 'wrong-entrypoint', 'duplicate', 'invalid-outer', 'missing-outer-hash'])('never accepts receipt.success for %s target evidence', async variant => {
    const logs = hash => variant === 'missing' ? [] : variant === 'wrong-sender' ? [event(hash, true, { sender: JOIN })]
      : variant === 'wrong-nonce' ? [event(hash, true, { nonce: NONCE + 1n })]
        : variant === 'wrong-entrypoint' ? [event(hash, true, { entryPoint: JOIN })]
          : variant === 'duplicate' ? [event(hash), event(hash)] : [event(hash)];
    const h = setup(kind, { logs, status: variant === 'invalid-outer' ? 2 : 'success' });
    if (variant === 'missing-outer-hash') delete h.rawReceipt.transactionHash;
    await expect(h.invoke()).rejects.toMatchObject({ category: 'submission_unknown' });
    expect(h.service.getPendingSubmission(ACCOUNT)).not.toBeNull();
    if (kind !== 'email') expect(h.onStep.mock.calls.some(([step]) => step === OnboardingStep.SUCCESS)).toBe(false);
  });
  it('accepts only canonical inner success even when a contradictory bundler summary says failure', async () => {
    const h = setup(kind);
    const wait = h.bundlerClient.waitForUserOperationReceipt.getMockImplementation();
    h.bundlerClient.waitForUserOperationReceipt.mockImplementation(async (...args) => ({ ...await wait(...args), success: false }));
    expect(await h.invoke()).toMatchObject({ transactionHash: TX });
    expect(listPendingSubmissions(ACCOUNT)).toEqual([]);
  });
  it('clears a definite pre-admission refusal, without automatically signing or sending a replacement', async () => {
    const h = setup(kind, { failure: 'refused' });
    await expect(h.invoke()).rejects.toMatchObject({ submission: { phase: 'pre-submit' } });
    expect(listPendingSubmissions(ACCOUNT)).toEqual([]);
    expect(h.bundlerClient.sendUserOperation).toHaveBeenCalledOnce(); expect(mocks.sign).toHaveBeenCalledOnce();
    expect(h.bundlerClient.waitForUserOperationReceipt).not.toHaveBeenCalled();
  });
  it('surfaces a decoded inner failure and settles despite a successful bundler summary', async () => {
    const reason = '0x50b2c4e1';
    const h = setup(kind, { logs: hash => [event(hash, false), { address: ENTRY_POINT_ADDRESS,
      ...USER_OPERATION_EVENTS.encodeEventLog('UserOperationRevertReason', [hash, ACCOUNT, NONCE, reason]) }] });
    await expect(h.invoke()).rejects.toMatchObject({ category: 'contract_revert', outcome: { status: 'failed', revertReason: reason } });
    expect(listPendingSubmissions(ACCOUNT)).toEqual([]); expect(h.bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
  });
  it('reconciles only exact sender/nonce/outer receipt on the original network, with reads only', async () => {
    const h = setup(kind, { failure: 'timeout' }); await expect(h.invoke()).rejects.toMatchObject({ category: 'submission_unknown' });
    const record = h.service.getPendingSubmission(ACCOUNT); const restored = h.create();
    h.rawReceipt.logs = [event(h.getHash(), true, { nonce: NONCE + 1n })];
    expect((await restored.reconcileSubmission(record)).outcome.status).toBe('unknown');
    expect(restored.getPendingSubmission(ACCOUNT)).not.toBeNull();
    h.rawReceipt.logs = [event(OTHER_HASH, false), event(h.getHash())];
    h.rawReceipt.transactionHash = OTHER_HASH;
    expect((await restored.reconcileSubmission(record)).outcome.status).toBe('unknown');
    h.rawReceipt.transactionHash = TX;
    const recovered = await restored.reconcileSubmission(record);
    expect(recovered.outcome).toMatchObject({ status: 'succeeded', sender: ACCOUNT, nonce: NONCE.toString() });
    expect(recovered.receipt).toBe(h.rawReceipt);
    expect(restored.getPendingSubmission(ACCOUNT)).toBeNull();
    expect(h.bundlerClient.sendUserOperation).toHaveBeenCalledOnce(); expect(mocks.sign).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledTimes(kind === 'email' ? 0 : 1);
  });
  it('keeps pending original status if a progress scope expires during dispatch', async () => {
    let current = true;
    const h = setup(kind, { guard: () => { if (!current) throw new Error('stale'); } });
    const send = h.bundlerClient.sendUserOperation.getMockImplementation();
    h.bundlerClient.sendUserOperation.mockImplementation(async operation => { const hash = await send(operation); current = false; return hash; });
    await expect(h.invoke()).rejects.toMatchObject({ category: 'submission_unknown' });
    expect(h.service.getPendingSubmission(ACCOUNT)).toMatchObject({ phase: 'submitted' });
    expect(h.bundlerClient.waitForUserOperationReceipt).not.toHaveBeenCalled();
    if (kind !== 'email') expect(h.onStep.mock.calls.some(([step]) => step === OnboardingStep.SUCCESS)).toBe(false);
  });
  it.each(['missing', 'orphaned'])('retains the original enrollment barrier when canonical inclusion is %s', async proof => {
    const h = setup(kind, { failure: 'timeout' });
    await expect(h.invoke()).rejects.toMatchObject({ category: 'submission_unknown' });
    const record = h.service.getPendingSubmission(ACCOUNT);
    const credentialBefore = getPendingCredentialForOrg(ORG);
    h.rawReceipt.logs = [event(h.getHash())];
    if (proof === 'missing') delete h.rawReceipt.blockHash;
    else h.publicClient.getBlock.mockResolvedValue({ number: 123n, hash: OTHER_HASH });
    const restored = h.create();
    expect((await restored.reconcileSubmission(record)).outcome).toMatchObject({ status: 'unknown',
      code: proof === 'missing' ? 'TRANSACTION_INCLUSION_MISMATCH' : 'NONCANONICAL_TRANSACTION_INCLUSION' });
    expect(restored.getPendingSubmission(ACCOUNT)).toEqual(record);
    expect(getPendingCredentialForOrg(ORG)).toEqual(credentialBefore);
    await expect(h.invoke(restored)).rejects.toMatchObject({ category: 'submission_unknown' });
    expect(h.bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
    expect(mocks.sign).toHaveBeenCalledOnce();
  });
  it('returns the canonical original success after scope changes during confirmation, without publishing stale success progress', async () => {
    let current = true;
    const h = setup(kind, { guard: () => { if (!current) throw new Error('stale'); } });
    const wait = h.bundlerClient.waitForUserOperationReceipt.getMockImplementation();
    h.bundlerClient.waitForUserOperationReceipt.mockImplementation(async (...args) => { const receipt = await wait(...args); current = false; return receipt; });
    expect(await h.invoke()).toMatchObject({ transactionHash: TX });
    expect(listPendingSubmissions(ACCOUNT)).toEqual([]);
    if (kind !== 'email') expect(h.onStep.mock.calls.some(([step]) => step === OnboardingStep.SUCCESS)).toBe(false);
  });
  it('fails closed before sending when persistence is unavailable', async () => {
    const h = setup(kind);
    const set = storage.setItem.getMockImplementation();
    storage.setItem.mockImplementation((key, value) => { if (key.startsWith('poa:submission:')) throw new Error('storage unavailable'); set(key, value); });
    await expect(h.invoke()).rejects.toThrow('could not be saved');
    expect(h.bundlerClient.sendUserOperation).not.toHaveBeenCalled();
  });
});
describe('enrollment infrastructure, source and atomic tuple preservation', () => {
  it.each(['wrong-chain', 'factory-outage', 'counterfactual-mismatch', 'invalid-key'])('rejects %s before signing an undeployed email-bound identity', async mode => {
    const h = setup('email');
    if (mode === 'wrong-chain') h.publicClient.getChainId.mockResolvedValue(42161);
    if (mode === 'factory-outage') h.publicClient.getBytecode.mockResolvedValue('0x');
    if (mode === 'counterfactual-mismatch') h.publicClient.readContract.mockResolvedValue(JOIN);
    if (mode === 'invalid-key') h.publicClient.readContract.mockRejectedValue(new Error('offline'));
    if (mode === 'invalid-key') {
      await expect(h.service.registerAndClaim({ credential: { ...credential, publicKeyX: `0x${'ff'.repeat(32)}` }, accountAddress: ACCOUNT,
        username: 'member', mode: 'email', proof: prepared(), hatIds: ['7'], merkleProof: [] })).rejects.toThrow();
    } else await expect(h.invoke()).rejects.toThrow();
    expect(mocks.sign).not.toHaveBeenCalled(); expect(mocks.register).not.toHaveBeenCalled(); expect(h.bundlerClient.sendUserOperation).not.toHaveBeenCalled();
  });
  it('preserves exact email/domain tuples and skips deployment only for existing bytecode', async () => {
    const h = setup('email', { deployed: true });
    await h.invoke(h.service, 'domain');
    const build = mocks.build.mock.calls[0][0];
    expect(build.initCode).toBe('0x');
    const accountAbi = new ethers.utils.Interface(['function execute(address,uint256,bytes)']);
    const { ZkEmailInvitesAbi } = await import('@poa-box/core/abis/ZkEmailInvites');
    const inner = accountAbi.decodeFunctionData('execute', build.callData)[2];
    const decoded = new ethers.utils.Interface(ZkEmailInvitesAbi).decodeFunctionData('registerAndClaimByDomainWithPasskey', inner);
    expect(decoded[0].salt.toString()).toBe(NONCE.toString()); expect(decoded[3].toString()).toBe(NONCE.toString());
    expect(decoded[5].pB[0].map(value => value.toString())).toEqual(['4', '3']);
    expect(decoded[6].map(value => value.toString())).toEqual(['7']);
  });
  it('blocks a registration challenge from a stale OrganizationService before any passkey ceremony', async () => {
    let current = true;
    const manager = { accountAddress: ACCOUNT, assertCurrent: () => { if (!current) throw new Error('stale'); },
      publicClient: { readContract: vi.fn(async () => { current = false; return NONCE; }) }, execute: vi.fn() };
    const service = new OrganizationService({}, manager, REGISTRY, 100);
    await expect(service.registerAndJoinNewUser(JOIN, 'member', credential)).rejects.toThrow('stale');
    expect(mocks.register).not.toHaveBeenCalled(); expect(manager.execute).not.toHaveBeenCalled();
  });
});

describe('email uncertainty across enrollment navigation/reload', () => {
  it.each(['org', 'solidarity'])('blocks %s enrollment without another credential or signature', async mode => {
    const h = setup('email', { failure: 'lost-response' });
    h.service.orgName = 'A display name';
    await expect(h.invoke()).rejects.toMatchObject({ category: 'submission_unknown' });
    expect(getPendingCredentialForOrg('A display name')).toMatchObject({ flow: 'zkemail', credentialChainId: 100 });
    const other = new PasskeyOnboardingService({ ...h.params, mode });
    await expect(other.onboard('member')).rejects.toThrow('earlier account setup');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.sign).toHaveBeenCalledOnce();
    expect(h.bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
    expect(other.getPendingSubmission(ACCOUNT)).not.toBeNull();
  });
});

describe('v2 enrollment intent and signing fences', () => {
  it.each(['org', 'solidarity', 'email'])('saves deterministic %s identity before the operation ceremony', async kind => {
    const h = setup(kind);
    mocks.sign.mockImplementation(async hash => {
      const saved = h.service.getPendingSubmission(ACCOUNT);
      expect(saved).toMatchObject({ phase: 'prepared', computedHash: hash, sender: ACCOUNT, nonce: NONCE.toString(), recovery: { version: 2, phase: 'prepared' } });
      return '0xabcdef';
    });
    await h.invoke();
    expect(listPendingSubmissions(ACCOUNT)).toEqual([]);
  });
  it('cancels before broadcast without losing the saved credential, and retries without a new credential', async () => {
    const h = setup('org');
    mocks.sign.mockRejectedValueOnce(Object.assign(new Error('cancelled'), { name: 'NotAllowedError' }));
    await expect(h.invoke()).rejects.toThrow('cancelled');
    expect(listPendingSubmissions(ACCOUNT)).toEqual([]);
    expect(getPendingCredentialForOrg(ORG)).not.toBeNull();
    expect(h.bundlerClient.sendUserOperation).not.toHaveBeenCalled();
    await h.invoke(h.create());
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(h.bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
  });
  it('rechecks the captured session after asynchronous lock acquisition', async () => {
    let current = true;
    const h = setup('email', { guard: () => { if (!current) throw new Error('stale'); } });
    const { enrollmentJournal } = await import('@/services/web3/domain/enrollmentSubmission');
    const journal = enrollmentJournal(h.service, ACCOUNT);
    const acquire = journal.acquire.bind(journal);
    journal.acquire = async () => { const release = await acquire(); current = false; return release; };
    h.service.submissionJournal = journal;
    await expect(h.invoke()).rejects.toThrow('stale');
    expect(mocks.register).not.toHaveBeenCalled(); expect(mocks.sign).not.toHaveBeenCalled();
    expect(h.bundlerClient.sendUserOperation).not.toHaveBeenCalled();
  });
  it('does not save an old confirmation or clear a newer attempt during read-only recovery', async () => {
    const h = setup('email', { failure: 'timeout' });
    await expect(h.invoke()).rejects.toMatchObject({ category: 'submission_unknown' });
    const record = h.service.getPendingSubmission(ACCOUNT);
    const before = storage.getItem('poa-passkey-pending');
    const { enrollmentJournal } = await import('@/services/web3/domain/enrollmentSubmission');
    const journal = enrollmentJournal(h.service, ACCOUNT);
    h.rawReceipt.logs = [event(h.getHash())];
    h.publicClient.getTransactionReceipt.mockImplementationOnce(async () => {
      expect(await journal.clear(record)).toBe(true);
      const release = await journal.acquire(); journal.begin(OTHER_HASH); await release();
      return h.rawReceipt;
    });
    await expect(h.create().reconcileSubmission(record)).rejects.toThrow('saved action changed');
    expect(storage.getItem('poa-passkey-pending')).toBe(before);
    expect(h.service.getPendingSubmission(ACCOUNT).recovery.attemptId).not.toBe(record.recovery.attemptId);
    expect(h.bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
  });
});
