import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { p256 } from '@noble/curves/p256';
import { USER_OPERATION_EVENTS } from '@poa-box/core/execute/outcome';
import { PasskeyOnboardingService } from '@/services/web3/domain/PasskeyOnboardingService';
import { getUserOpHash } from '@/services/web3/passkey/userOpBuilder';
import { readPendingEnrollment, savePendingCredential } from '@/services/web3/passkey/passkeyStorage';
import { enrollmentJournal } from '@/services/web3/domain/enrollmentSubmission';
import { fakeBrowserLocks, recoveryTestStorage, deferredRecoveryTest } from '@/services/web3/core/submissionTestHelpers';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';

const f = vi.hoisted(() => ({ create: vi.fn(), build: vi.fn(), register: vi.fn(), sign: vi.fn() }));
vi.mock('@/services/web3/passkey/passkeyCreate', () => ({ createPasskeyCredential: f.create }));
vi.mock('@/services/web3/passkey/passkeySign', () => ({ signRegistrationChallenge: f.register, signUserOpWithPasskey: f.sign }));
vi.mock('@/services/web3/passkey/userOpBuilder', async original => ({ ...await original(), buildUserOp: f.build }));
const addr = n => `0x${n.repeat(20)}`, hash = n => `0x${n.repeat(32)}`;
const ACCOUNT = addr('11'), FACTORY = addr('22'), REGISTRY = addr('33'), JOIN = addr('44'), OTHER = addr('55');
const point = Buffer.from(p256.getPublicKey('01'.padStart(64, '0'), false)).toString('hex');
const credential = { credentialId: ethers.utils.keccak256(Buffer.from([1, 2, 3])), rawCredentialId: Buffer.from([1, 2, 3]).toString('base64url'),
  publicKeyX: `0x${point.slice(2, 66)}`, publicKeyY: `0x${point.slice(66)}`, salt: 12345678901234567890n };
const registration = { authenticatorData: '0x1234', clientDataJSON: '0x73796e746865746963', challengeIndex: 3n, typeIndex: 4n, r: hash('55'), s: hash('66') };
let storage;
function setup(mode = 'org') {
  const state = { owners: new Map(), sendFailure: null, innerSuccess: true, sent: [], receipts: new Map(), active: true, deployed: false };
  const guard = () => { if (!state.active) throw new Error('Stale account session'); };
  const publicClient = { getChainId: vi.fn(async () => 100), getBytecode: vi.fn(async ({ address }) => address.toLowerCase() === ACCOUNT && !state.deployed ? '0x' : '0x1234'),
    readContract: vi.fn(async ({ functionName, args }) => {
      if (functionName === 'getAddressOfUsername') return state.owners.get(args[0]) || ethers.constants.AddressZero;
      if (functionName === 'getAddress') return ACCOUNT;
      if (functionName === 'nonces') return 0n;
      throw new Error('Unexpected read: ' + functionName);
    }),
    getBlock: vi.fn(async ({ blockNumber }) => ({ number: blockNumber, hash: hash('bb') })),
    getTransactionReceipt: vi.fn(async ({ hash: tx }) => [...state.receipts.values()].find(r => r.transactionHash === tx)) };
  const bundlerClient = {
    sendUserOperation: vi.fn(async operation => {
      const computed = getUserOpHash(operation, ENTRY_POINT_ADDRESS, 100); state.sent.push(operation);
      if (state.sendFailure) throw new Error(state.sendFailure);
      const log = { address: ENTRY_POINT_ADDRESS, ...USER_OPERATION_EVENTS.encodeEventLog('UserOperationEvent',
        [computed, ACCOUNT, ethers.constants.AddressZero, operation.nonce, state.innerSuccess, 10, 20]) };
      state.receipts.set(computed, { transactionHash: hash(state.sent.length.toString(16).padStart(2, '0')), blockNumber: 123n,
        blockHash: hash('bb'), status: 'success', logs: [log] });
      return computed;
    }),
    waitForUserOperationReceipt: vi.fn(async ({ hash: computed }) => { state.deployed = true; return { receipt: state.receipts.get(computed) }; }),
    getUserOperationReceipt: vi.fn(async ({ hash: computed }) => ({ receipt: state.receipts.get(computed) })),
  };
  const params = { publicClient, bundlerClient, factoryAddress: FACTORY, registryAddress: REGISTRY, quickJoinAddress: mode === 'org' ? JOIN : null,
    paymasterAddress: JOIN, orgId: mode === 'org' ? hash('aa') : null, hatId: '7', chainId: 100, mode, scopeGuard: guard,
    initiator: { account: null, authType: null } };
  f.build.mockImplementation(async p => ({ sender: p.sender, nonce: BigInt(state.sent.length), callData: p.callData,
    ...(p.initCode === '0x' ? {} : { factory: FACTORY, factoryData: '0x1234' }),
    callGasLimit: 500000n, verificationGasLimit: 500000n, preVerificationGas: 50000n, maxFeePerGas: 7n, maxPriorityFeePerGas: 1n, signature: '0x' }));
  return { state, publicClient, bundlerClient, params, service: new PasskeyOnboardingService(params), recreate: change => new PasskeyOnboardingService({ ...params, ...change }) };
}
const pending = service => readPendingEnrollment(service)?.credential;
const stableIdentity = record => Object.fromEntries(['credentialId', 'rawCredentialId', 'publicKeyX', 'publicKeyY', 'salt', 'accountAddress',
  'credentialChainId', 'registryAddress', 'factoryAddress', 'orgId', 'targetAddress', 'flow', 'initiator'].map(key => [key, record[key]]));
async function raceCollision(h) {
  f.create.mockImplementationOnce(async () => { h.state.owners.set('taken_name', OTHER); return credential; });
  await expect(h.service.onboard('taken_name')).rejects.toMatchObject({ code: 'USERNAME_TAKEN' });
  expect(f.create).toHaveBeenCalledOnce(); expect(h.bundlerClient.sendUserOperation).not.toHaveBeenCalled();
  return pending(h.service);
}
beforeEach(() => {
  vi.clearAllMocks(); storage = recoveryTestStorage();
  vi.stubGlobal('localStorage', storage); vi.stubGlobal('window', { localStorage: storage, dispatchEvent: vi.fn() });
  vi.stubGlobal('navigator', { locks: fakeBrowserLocks() }); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden'); }));
  f.create.mockResolvedValue(credential); f.register.mockResolvedValue(registration); f.sign.mockResolvedValue('0xabcdef');
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe.each(['org', 'solidarity'])('%s username onboarding recovery', mode => {
  it('rejects a taken name before a ceremony or saved setup, then accepts a free name', async () => {
    const h = setup(mode); h.state.owners.set('taken_name', OTHER);
    await expect(h.service.onboard('taken_name')).rejects.toMatchObject({ code: 'USERNAME_TAKEN' });
    expect(f.create).not.toHaveBeenCalled(); expect(pending(h.service)).toBeUndefined();
    expect(await h.service.onboard('new_free_name')).toMatchObject({ accountAddress: ACCOUNT });
    expect(f.create).toHaveBeenCalledOnce(); expect(h.bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
  });
  it('recovers a collision during the ceremony after reload, reusing the same saved credential and account', async () => {
    const h = setup(mode), original = await raceCollision(h), identity = stableIdentity(original);
    expect(f.register).not.toHaveBeenCalled(); expect(f.sign).not.toHaveBeenCalled();
    expect(await h.recreate().onboard('new_free_name')).toMatchObject({ accountAddress: ACCOUNT, credentialId: credential.credentialId });
    expect(stableIdentity(pending(h.service))).toEqual(identity); expect(pending(h.service).username).toBe('new_free_name');
    expect(f.create).toHaveBeenCalledOnce(); expect(h.bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
  });
  it('reuses a credential after a known pre-dispatch registration refusal without another ceremony', async () => {
    const h = setup(mode); f.build.mockRejectedValueOnce(new Error('UsernameTaken'));
    await expect(h.service.onboard('taken_name')).rejects.toThrow('UsernameTaken');
    expect(enrollmentJournal(h.service, ACCOUNT).read()).toBeNull(); const identity = stableIdentity(pending(h.service));
    expect(await h.recreate().onboard('new_free_name')).toMatchObject({ accountAddress: ACCOUNT });
    expect(stableIdentity(pending(h.service))).toEqual(identity); expect(f.create).toHaveBeenCalledOnce();
    expect(h.bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
  });
  it('never renames or retries an unknown send', async () => {
    const h = setup(mode); h.state.sendFailure = 'Network response lost';
    await expect(h.service.onboard('taken_name')).rejects.toMatchObject({ category: 'submission_unknown' });
    const before = JSON.stringify(pending(h.service)), journal = enrollmentJournal(h.service, ACCOUNT).read();
    await expect(h.recreate().onboard('new_free_name')).rejects.toThrow();
    expect(JSON.stringify(pending(h.service))).toBe(before); expect(enrollmentJournal(h.service, ACCOUNT).read()).toEqual(journal);
    expect(f.create).toHaveBeenCalledOnce(); expect(f.sign).toHaveBeenCalledOnce(); expect(h.bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
  });
  it('requires a canonical original failed receipt before changing a confirmed failure', async () => {
    const h = setup(mode); h.state.innerSuccess = false;
    await expect(h.service.onboard('taken_name')).rejects.toMatchObject({ category: 'contract_revert' });
    const failed = pending(h.service); expect(failed.confirmation.status).toBe('failed');
    h.state.innerSuccess = true;
    expect(await h.recreate().onboard('new_free_name')).toMatchObject({ accountAddress: ACCOUNT });
    expect(h.publicClient.getTransactionReceipt).toHaveBeenCalled(); expect(stableIdentity(pending(h.service))).toEqual(stableIdentity(failed));
    expect(f.create).toHaveBeenCalledOnce(); expect(h.bundlerClient.sendUserOperation).toHaveBeenCalledTimes(2);
  });
  it('cannot rename a successful setup', async () => {
    const h = setup(mode); await h.service.onboard('taken_name'); const before = JSON.stringify(pending(h.service));
    await expect(h.recreate().onboard('new_free_name')).rejects.toThrow('confirmed');
    expect(JSON.stringify(pending(h.service))).toBe(before); expect(f.create).toHaveBeenCalledOnce();
    expect(h.bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
  });
});

it.each([{}, { status: 'unknown' }, { status: 'failed' }])('refuses malformed or unverifiable saved confirmation %j', async confirmation => {
  const h = setup(), original = await raceCollision(h); savePendingCredential({ ...original, confirmation });
  const before = JSON.stringify(pending(h.service));
  await expect(h.recreate().onboard('new_free_name')).rejects.toThrow();
  expect(JSON.stringify(pending(h.service))).toBe(before); expect(h.bundlerClient.sendUserOperation).not.toHaveBeenCalled();
});
it('refuses a failed marker whose fresh original receipt now has unknown inner identity', async () => {
  const h = setup(); h.state.innerSuccess = false; await expect(h.service.onboard('taken_name')).rejects.toThrow();
  const failed = pending(h.service); h.state.receipts.get(failed.confirmation.computedHash).logs = [];
  const before = JSON.stringify(pending(h.service));
  await expect(h.recreate().onboard('new_free_name')).rejects.toThrow();
  expect(JSON.stringify(pending(h.service))).toBe(before); expect(h.bundlerClient.sendUserOperation).toHaveBeenCalledOnce();
});
it.each(['session', 'source', 'initiator', 'legacy'])('preserves the saved setup for a stale/different %s', async change => {
  const h = setup(), original = await raceCollision(h), before = JSON.stringify(original);
  let service = h.recreate();
  if (change === 'source') service = h.recreate({ orgId: hash('dd') });
  if (change === 'initiator') service = h.recreate({ initiator: { account: OTHER, authType: 'eoa' } });
  if (change === 'legacy') { savePendingCredential({ ...original, initiator: null }); service = h.recreate(); }
  if (change === 'session') {
    const wait = deferredRecoveryTest(), read = h.publicClient.readContract.getMockImplementation();
    h.publicClient.readContract.mockImplementation(async p => { if (p.functionName === 'getAddressOfUsername') return wait.promise; return read(p); });
    const attempt = service.onboard('new_free_name'); await vi.waitFor(() => expect(h.publicClient.readContract.mock.calls.some(([p]) => p.functionName === 'getAddressOfUsername' && p.args[0] === 'new_free_name')).toBe(true));
    h.state.active = false; wait.resolve(ethers.constants.AddressZero); await expect(attempt).rejects.toThrow('Stale');
  } else await expect(service.onboard('new_free_name')).rejects.toThrow();
  if (change !== 'legacy') expect(JSON.stringify(pending(h.service))).toBe(before);
  expect(f.create).toHaveBeenCalledOnce(); expect(h.bundlerClient.sendUserOperation).not.toHaveBeenCalled();
});
it('does not overwrite a newer pending edit while its availability read is pending', async () => {
  const h = setup(), original = await raceCollision(h), wait = deferredRecoveryTest(), read = h.publicClient.readContract.getMockImplementation();
  h.publicClient.readContract.mockImplementation(async p => p.functionName === 'getAddressOfUsername' ? wait.promise : read(p));
  const attempt = h.recreate().onboard('new_free_name'); await vi.waitFor(() => expect(h.publicClient.readContract.mock.calls.some(([p]) => p.functionName === 'getAddressOfUsername' && p.args[0] === 'new_free_name')).toBe(true));
  savePendingCredential({ ...original, username: 'newer_name' }); wait.resolve(ethers.constants.AddressZero);
  await expect(attempt).rejects.toThrow(); expect(pending(h.service).username).toBe('newer_name'); expect(h.bundlerClient.sendUserOperation).not.toHaveBeenCalled();
});
