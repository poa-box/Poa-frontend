import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { p256 } from '@noble/curves/p256';
import { USER_OPERATION_EVENTS } from '@poa-box/core/execute/outcome';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';
import AuthorityABI from '../../../../abi/MembershipAuthority.json';
import QuickJoinABI from '../../../../abi/QuickJoinNew.json';
import AccountABI from '../../../../abi/PasskeyAccount.json';
import EmailABI from '../../../../abi/ZkEmailInvites.json';
import FactoryABI from '../../../../abi/PasskeyAccountFactory.json';
import { projectGroth16Proof } from '@poa-box/core/email/proof';
import { retainEmailProofProjection } from '@/lib/zkemail/proofProjection';
import { MembershipAuthorityService } from '@/services/web3/domain/MembershipAuthorityService';
import { TokenRequestService } from '@/services/web3/domain/TokenRequestService';
import { UserService } from '@/services/web3/domain/UserService';
import { OrganizationService } from '@/services/web3/domain/OrganizationService';
import { PasskeyOnboardingService } from '@/services/web3/domain/PasskeyOnboardingService';
import { ZkEmailOnboardingService } from '@/services/web3/domain/ZkEmailOnboardingService';
import { buildUserOpWithFallback, getUserOpHash } from '@/services/web3/passkey/userOpBuilder';
import { ZkEmailInvitesService } from '@/services/web3/domain/ZkEmailInvitesService';
import { signRegistrationChallenge, signUserOpWithPasskey } from '@/services/web3/passkey/passkeySign';

vi.mock('@/services/web3/passkey/passkeySign', () => ({ signRegistrationChallenge: vi.fn(), signUserOpWithPasskey: vi.fn() }));
vi.mock('@/services/web3/passkey/passkeyCreate', () => ({ createPasskeyCredential: vi.fn() }));
vi.mock('@/services/web3/passkey/userOpBuilder', () => ({ buildUserOp: vi.fn(), buildUserOpWithFallback: vi.fn(), getUserOpHash: vi.fn() }));

const AUTH = `0x${'11'.repeat(20)}`;
const USER = `0x${'22'.repeat(20)}`;
const REGISTRY = `0x${'33'.repeat(20)}`;
const LARGE = ((1n << 224n) | (1n << 208n)).toString();
const auth = { authenticatorData: '0x1234', clientDataJSON: '0x73796e746865746963', challengeIndex: 3n, typeIndex: 4n, r: `0x${'55'.repeat(32)}`, s: `0x${'66'.repeat(32)}` };
const point = Buffer.from(p256.getPublicKey('01'.padStart(64, '0'), false)).toString('hex');
const credential = { credentialId: ethers.utils.keccak256(Buffer.from([1, 2, 3])), publicKeyX: `0x${point.slice(2, 66)}`, publicKeyY: `0x${point.slice(66)}`, salt: (2n ** 100n + 9n).toString(), rawCredentialId: 'AQID' };
const receipt = { receipt: { synthetic: true }, success: true };
function host() {
  const contract = { address: AUTH };
  const factory = { createWritable: vi.fn(() => contract), createReadOnly: vi.fn() };
  const manager = { execute: vi.fn(async () => receipt) };
  return { contract, factory, manager };
}
function proof(version = 'v2', claimer = USER) {
  return retainEmailProofProjection(projectGroth16Proof({
    version, claimer,
    proof: { pi_a: ['1', '2', '1'], pi_b: [['3', '4'], ['5', '6'], ['1', '0']], pi_c: ['7', '8', '1'] },
    publicSignals: version === 'v2' ? ['1', '2', BigInt(claimer).toString(), '3', '4'] : ['1', '2', BigInt(claimer).toString(), '4'],
  }));
}
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden in focused tests'); }));
  signRegistrationChallenge.mockReset().mockResolvedValue(auth);
  const records = new Map();
  vi.stubGlobal('localStorage', { getItem: key => records.get(key) || null, setItem: vi.fn((key, value) => records.set(key, value)), removeItem: vi.fn(key => records.delete(key)) });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('authority service protocol and host parity', () => {
  it.each([
    ['claim', [LARGE], 'claim', [LARGE]],
    ['renounce', [LARGE], 'renounce', [LARGE]],
    ['vouch', [LARGE, USER], 'vouch', [LARGE, USER]],
    ['revokeVouch', [LARGE, USER], 'revokeVouch', [LARGE, USER]],
    ['delegatedGrant', [LARGE, USER], 'delegatedGrant', [LARGE, USER]],
    ['delegatedOffer', [LARGE, USER], 'delegatedOffer', [LARGE, USER]],
    ['delegatedRemove', [LARGE, USER, true], 'delegatedRemove', [LARGE, USER, true]],
    ['delegatedUnremove', [LARGE, USER], 'delegatedUnremove', [LARGE, USER]],
    ['finalize', [LARGE], 'finalize', [LARGE]],
    ['cancel', [LARGE], 'cancel', [LARGE]],
    ['reconcile', [LARGE, [USER]], 'reconcile(uint256,address[])', [LARGE, [USER]]],
  ])('%s preserves large IDs, host callbacks and the raw result', async (action, args, method, expected) => {
    const { factory, manager, contract } = host();
    const options = { gasLimit: 900000, isCurrent: () => true, onSuccess: vi.fn(), scopeKey: 'synthetic-scope' };
    expect(await new MembershipAuthorityService(factory, manager)[action](AUTH, ...args, options)).toBe(receipt);
    const [, actualMethod, actualArgs, actualOptions] = manager.execute.mock.calls[0];
    expect(actualMethod).toBe(method);
    expect(new ethers.utils.Interface(factory.createWritable.mock.calls[0][1]).encodeFunctionData(method, actualArgs))
      .toBe(new ethers.utils.Interface(AuthorityABI).encodeFunctionData(method, expected));
    expect(actualOptions).toMatchObject({ ...options, value: '0' });
    expect(actualOptions.onSuccess).toBe(options.onSuccess);
    expect(actualOptions.meta).toBeUndefined();
    expect(manager.execute.mock.calls[0][0]).toBe(contract);
    if (action === 'claim') expect(actualOptions.paymasterHatIds).toEqual([LARGE]);
  });

  it('rejects missing/unsafe/negative IDs and zero authority before host execution', async () => {
    const { factory, manager } = host();
    const service = new MembershipAuthorityService(factory, manager);
    for (const id of [null, '', -1, Number.MAX_SAFE_INTEGER + 1, '1.5']) {
      await expect(service.claim(AUTH, id)).rejects.toThrow();
    }
    await expect(service.claim(`0x${'00'.repeat(20)}`, LARGE)).rejects.toThrow();
    expect(manager.execute).not.toHaveBeenCalled();
  });
});

describe('user and Shares requests', () => {
  it('preserves the selected registry and raw service result', async () => {
    const { factory, manager } = host();
    const service = new UserService(factory, manager, REGISTRY);
    expect(await service.createNewUser('alice_2')).toBe(receipt);
    expect(await service.changeUsername('alice_3')).toBe(receipt);
    expect(factory.createWritable.mock.calls.map(call => call[0])).toEqual([REGISTRY, REGISTRY]);
    expect(manager.execute.mock.calls.map(call => call[1])).toEqual(['registerAccount', 'changeUsername']);
  });

  it('parses exact 18 decimal amounts once, preserving seconds metadata', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-02T03:04:05Z'));
    const { factory, manager } = host();
    const storage = { addToIpfs: vi.fn(async () => ({ path: 'QmSyntheticForMockStorage' })) };
    const service = new TokenRequestService(factory, manager, storage);
    expect(await service.requestTokens(AUTH, '12345678901.123456789123456789', { reason: 'Worked together' })).toBe(receipt);
    expect(manager.execute.mock.calls[0][2][0].toString()).toBe('12345678901123456789123456789');
    expect(manager.execute.mock.calls[0][2][1]).toBe('QmSyntheticForMockStorage');
    expect(storage.addToIpfs.mock.calls[0][0]).toBe('{"reason":"Worked together","submittedAt":1767323045}');
  });

  it('rejects invalid/overflow amounts before upload or execution', async () => {
    const { factory, manager } = host();
    const storage = { addToIpfs: vi.fn() };
    const service = new TokenRequestService(factory, manager, storage);
    for (const amount of ['0', '-1', '79228162514.264337593543950336', '0.0000000000000000001', '1e30']) {
      await expect(service.requestTokens(AUTH, amount, { reason: 'valid reason' })).rejects.toThrow();
    }
    expect(storage.addToIpfs).not.toHaveBeenCalled(); expect(manager.execute).not.toHaveBeenCalled();
  });

  it('preserves uint256 approval and cancellation IDs', async () => {
    const { factory, manager } = host();
    const service = new TokenRequestService(factory, manager);
    await service.approveRequest(AUTH, LARGE); await service.cancelRequest(AUTH, LARGE);
    expect(manager.execute.mock.calls.map(call => call[2][0].toString())).toEqual([LARGE, LARGE]);
  });
});

describe('prepared email proof boundary', () => {
  it('retains G2 order and exact committed role order through the actual claim builder', async () => {
    const { factory, manager } = host();
    const prepared = proof();
    await new ZkEmailInvitesService(factory, manager).claimRoleByEmail(AUTH, prepared, USER, [LARGE, '1'], [], { paymasterClaimTarget: AUTH });
    const args = manager.execute.mock.calls[0][2];
    expect(args[0].pB).toEqual([['0x4', '0x3'], ['0x6', '0x5']]);
    expect(args[2]).toEqual([LARGE, '1']);
  });

  it('rejects forged projections, changed identities and wrong circuit versions before execution', async () => {
    const { factory, manager } = host(); const service = new ZkEmailInvitesService(factory, manager);
    await expect(service.claimRoleByEmail(AUTH, { ...proof() }, USER, ['1'], [])).rejects.toThrow('Prepare');
    await expect(service.claimRoleByEmail(AUTH, proof(), REGISTRY, ['1'], [])).rejects.toThrow();
    await expect(service.claimRoleByDomain(AUTH, proof(), USER, ['1'], [])).rejects.toThrow();
    expect(manager.execute).not.toHaveBeenCalled();
  });
});

describe('atomic QuickJoin onboarding codecs with mocked prompts', () => {
  it('encodes the passkey registration payload with the actual core digest and original primary type', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-02T03:04:05Z'));
    const nonce = 2n ** 120n + 3n;
    const publicClient = { readContract: vi.fn(async () => nonce) };
    const service = new PasskeyOnboardingService({ publicClient, registryAddress: REGISTRY, quickJoinAddress: AUTH, chainId: 100 });
    const calldata = await service._buildOrgModeCallData(credential, USER, 'alice_2', vi.fn());
    const execute = new ethers.utils.Interface(AccountABI).decodeFunctionData('execute', calldata);
    expect(execute[0]).toBe(ethers.utils.getAddress(AUTH));
    const decoded = new ethers.utils.Interface(QuickJoinABI).decodeFunctionData('registerAndQuickJoinWithPasskey', execute[2]);
    expect(decoded[0].salt.toString()).toBe(credential.salt);
    expect(decoded[3].toString()).toBe(nonce.toString());
    const deadline = 1767323045n + 1209600n;
    expect(decoded[2].toString()).toBe(deadline.toString());
    const expectedHash = ethers.utils._TypedDataEncoder.hash({ name: 'UniversalAccountRegistry', version: '1', chainId: 100, verifyingContract: REGISTRY }, {
      RegisterPasskeyAccount: [{ name: 'user', type: 'address' }, { name: 'username', type: 'string' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }],
    }, { user: USER, username: 'alice_2', nonce: nonce.toString(), deadline: deadline.toString() });
    expect(signRegistrationChallenge).toHaveBeenCalledWith(expectedHash, credential.rawCredentialId);
  });

  it('keeps registration and joining atomic in the manager path', async () => {
    const { factory, manager } = host();
    manager.publicClient = { readContract: vi.fn(async () => 2n ** 90n) }; manager.accountAddress = USER;
    const options = { paymasterHatIds: [LARGE], onSuccess: vi.fn() };
    const service = new OrganizationService(factory, manager, REGISTRY, 100);
    expect(await service.registerAndJoinNewUser(AUTH, 'alice_2', credential, options)).toBe(receipt);
    expect(manager.execute).toHaveBeenCalledTimes(1);
    expect(manager.execute.mock.calls[0][1]).toBe('registerAndQuickJoinWithPasskey');
    expect(manager.execute.mock.calls[0][2][0][3].toString()).toBe(credential.salt);
    const args = manager.execute.mock.calls[0][2];
    const expected = ethers.utils._TypedDataEncoder.hash({ name: 'UniversalAccountRegistry', version: '1', chainId: 100, verifyingContract: REGISTRY }, {
      RegisterPasskeyAccount: [{ name: 'user', type: 'address' }, { name: 'username', type: 'string' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }],
    }, { user: USER, username: 'alice_2', nonce: args[3].toString(), deadline: args[2].toString() });
    expect(signRegistrationChallenge).toHaveBeenCalledWith(expected, credential.rawCredentialId);
    expect(manager.execute.mock.calls[0][3]).toMatchObject(options);
  });
});


describe('atomic email enrollment encoding with all transports mocked', () => {
  it.each([['domain', 'v1', undefined], ['email', 'v2', '0x1234']])('preserves %s proof, salt, leaf order and deployed-account handling', async (mode, version, bytecode) => {
    const userOp = { sender: USER, nonce: 2n ** 120n + 1n, callData: '0x' };
    const operationHash = `0x${'01'.repeat(32)}`;
    const transactionHash = `0x${'02'.repeat(32)}`;
    getUserOpHash.mockReturnValue(operationHash);
    buildUserOpWithFallback.mockReset().mockResolvedValue(userOp);
    signUserOpWithPasskey.mockReset().mockResolvedValue('0x1234');
    const publicClient = {
      getChainId: vi.fn(async () => 100),
      getBytecode: vi.fn(async ({ address }) => address === REGISTRY ? '0x1234' : bytecode),
      readContract: vi.fn(async ({ functionName }) => functionName === 'getAddress' ? USER : 2n ** 120n + 1n),
    };
    const bundlerClient = {
      sendUserOperation: vi.fn(async () => operationHash),
      waitForUserOperationReceipt: vi.fn(async () => ({ success: true, receipt: { transactionHash, blockNumber: 123n, status: 'success',
        logs: [{ address: ENTRY_POINT_ADDRESS, ...USER_OPERATION_EVENTS.encodeEventLog('UserOperationEvent', [operationHash, USER, ethers.constants.AddressZero, userOp.nonce, true, 10, 20]) }],
      } })),
    };
    const service = new ZkEmailOnboardingService({ publicClient, bundlerClient,
      factoryAddress: REGISTRY, registryAddress: REGISTRY, zkEmailInvitesAddress: AUTH,
      paymasterAddress: AUTH, orgId: `0x${'aa'.repeat(32)}`, chainId: 100 });
    const prepared = proof(version);
    const result = await service.registerAndClaim({ credential, accountAddress: USER,
      username: 'alice_2', mode, proof: prepared, hatIds: [LARGE, '1'], merkleProof: [] });
    expect(result).toEqual({ accountAddress: USER, transactionHash, blockNumber: 123 });
    const options = buildUserOpWithFallback.mock.calls[0][0];
    const execute = new ethers.utils.Interface(AccountABI).decodeFunctionData('execute', options.callData);
    const method = mode === 'email' ? 'registerAndClaimByEmailWithPasskey' : 'registerAndClaimByDomainWithPasskey';
    const decoded = new ethers.utils.Interface(EmailABI).decodeFunctionData(method, execute[2]);
    expect(decoded[0].salt.toString()).toBe(credential.salt);
    expect(decoded[3].toString()).toBe((2n ** 120n + 1n).toString());
    expect(decoded[6].map(id => id.toString())).toEqual([LARGE, '1']);
    expect(decoded[5].pB[0].map(n => n.toString())).toEqual(['4', '3']);
    if (bytecode) expect(options.initCode).toBe('0x');
    else {
      expect(options.initCode.slice(0, 42)).toBe(REGISTRY);
      const created = new ethers.utils.Interface(FactoryABI).decodeFunctionData('createAccount', `0x${options.initCode.slice(42)}`);
      expect(created[3].toString()).toBe(credential.salt);
    }
    // CLAIM subject precedes HAT fallbacks for an account's first membership.
    expect(options.paymasterDataEntries.map(entry => entry.slice(68, 70))).toEqual(['05', '01', '01']);
    expect(bundlerClient.sendUserOperation).toHaveBeenCalledTimes(1);
  });
});
