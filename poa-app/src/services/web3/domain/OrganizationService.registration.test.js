import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { QuickJoinNewAbi } from '@poa-box/core/abis/QuickJoinNew';
import { OrganizationService } from '@/services/web3/domain/OrganizationService';
import { signRegistrationChallenge } from '@/services/web3/passkey/passkeySign';
import { signRegistration } from '@/services/web3/utils/registrySigner';

vi.mock('@/services/web3/passkey/passkeySign', () => ({ signRegistrationChallenge: vi.fn() }));
vi.mock('@/services/web3/utils/registrySigner', () => ({ signRegistration: vi.fn() }));
const JOIN = `0x${'11'.repeat(20)}`;
const REGISTRY = `0x${'22'.repeat(20)}`;
const USER = `0x${'33'.repeat(20)}`;
const NONCE = 2n ** 120n + 17n;
const credential = { credentialId: `0x${'44'.repeat(32)}`, publicKeyX: `0x${'55'.repeat(32)}`,
  publicKeyY: `0x${'66'.repeat(32)}`, salt: (2n ** 200n + 3n).toString(), rawCredentialId: 'synthetic' };
const auth = { authenticatorData: '0x123456', clientDataJSON: '0x73796e746865746963', challengeIndex: 13n,
  typeIndex: 27n, r: `0x${'77'.repeat(32)}`, s: `0x${'88'.repeat(32)}` };
const abi = new ethers.utils.Interface(QuickJoinNewAbi);
const result = { success: true, receipt: { transactionHash: `0x${'99'.repeat(32)}` } };
function host() {
  const contract = { interface: abi };
  const factory = { createWritable: vi.fn(() => contract), createReadOnly: vi.fn(() => ({ nonces: vi.fn(async () => NONCE) })) };
  const manager = { assertCurrent: vi.fn(), getPendingSubmission: vi.fn(() => null), accountAddress: USER,
    publicClient: { readContract: vi.fn(async () => NONCE) },
    execute: vi.fn(async (_contract, _method, _args, options) => { options.onStateChange?.('confirming'); return result; }) };
  return { factory, manager, service: new OrganizationService(factory, manager, REGISTRY, 100) };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-02T03:04:05Z'));
  signRegistrationChallenge.mockResolvedValue(auth);
  signRegistration.mockResolvedValue({ deadline: ethers.BigNumber.from('9007199254740993123'),
    nonce: ethers.BigNumber.from(NONCE.toString()), signature: '0x123456' });
});
afterEach(() => { vi.useRealTimers(); });

describe('atomic organization enrollment through installed core builders', () => {
  it.each(['viem', 'ethers'])('preserves the full passkey payload and one-operation callbacks with the %s nonce reader', async reader => {
    const { factory, manager, service } = host();
    if (reader === 'ethers') delete manager.publicClient;
    const options = { onStateChange: vi.fn(), onSuccess: vi.fn(), paymasterHatIds: [NONCE.toString()] };
    expect(await service.registerAndJoinNewUser(JOIN, 'member_2', credential, options)).toBe(result);
    expect(manager.execute).toHaveBeenCalledTimes(1);
    const [contract, method, args, forwarded] = manager.execute.mock.calls[0];
    expect(method).toBe('registerAndQuickJoinWithPasskey');
    const decoded = abi.decodeFunctionData(method, abi.encodeFunctionData(method, args));
    expect(decoded[0].credentialId).toBe(credential.credentialId);
    expect(decoded[0][1]).toBe(credential.publicKeyX);
    expect(decoded[0][2]).toBe(credential.publicKeyY);
    expect(decoded[0].salt.toString()).toBe(credential.salt);
    expect(decoded[1]).toBe('member_2');
    expect(decoded[2].toString()).toBe('1768532645');
    expect(decoded[3].toString()).toBe(NONCE.toString());
    expect(decoded[4].map(value => value.toString())).toEqual([
      auth.authenticatorData, auth.clientDataJSON, '13', '27', auth.r, auth.s,
    ]);
    const digest = ethers.utils._TypedDataEncoder.hash({ name: 'UniversalAccountRegistry', version: '1', chainId: 100, verifyingContract: REGISTRY }, {
      RegisterPasskeyAccount: [{ name: 'user', type: 'address' }, { name: 'username', type: 'string' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }],
    }, { user: USER, username: 'member_2', nonce: NONCE.toString(), deadline: decoded[2].toString() });
    expect(signRegistrationChallenge).toHaveBeenCalledWith(digest, credential.rawCredentialId);
    expect(factory.createWritable).toHaveBeenCalledWith(JOIN, expect.any(Array));
    expect(contract.interface).toBe(abi);
    expect(forwarded.onSuccess).toBe(options.onSuccess);
    expect(forwarded.paymasterHatIds).toBe(options.paymasterHatIds);
    expect(options.onStateChange).toHaveBeenCalledWith('confirming');
  });

  it('preserves exact EOA registration values, result identity and transaction options', async () => {
    const { service, manager } = host();
    const signer = { getAddress: vi.fn(async () => USER) };
    const options = { onStateChange: vi.fn(), confirmations: 2 };
    expect(await service.registerAndJoinEOA(JOIN, 'member_2', signer, options)).toBe(result);
    expect(manager.execute).toHaveBeenCalledTimes(1);
    const [, method, args, forwarded] = manager.execute.mock.calls[0];
    const decoded = abi.decodeFunctionData(method, abi.encodeFunctionData(method, args));
    expect(method).toBe('registerAndQuickJoin');
    expect(decoded.map(value => value.toString())).toEqual([USER, 'member_2', '9007199254740993123', NONCE.toString(), '0x123456']);
    expect(signRegistration).toHaveBeenCalledWith(expect.objectContaining({ signer, registryAddress: REGISTRY, username: 'member_2', guard: expect.any(Function) }));
    expect(forwarded).toMatchObject(options);
  });

  it.each(['passkey', 'eoa'])('blocks %s signing when a previous submission is unresolved', async mode => {
    const { service, manager } = host();
    const pending = { kind: 'transaction', nonce: NONCE.toString(), phase: 'submitted' };
    manager.getPendingSubmission.mockReturnValue(pending);
    const operation = mode === 'passkey' ? service.registerAndJoinNewUser(JOIN, 'member_2', credential)
      : service.registerAndJoinEOA(JOIN, 'member_2', { getAddress: vi.fn() });
    await expect(operation).rejects.toMatchObject({ nativeSubmission: pending });
    expect(signRegistration).not.toHaveBeenCalled();
    expect(signRegistrationChallenge).not.toHaveBeenCalled();
    expect(manager.publicClient.readContract).not.toHaveBeenCalled();
    expect(manager.execute).not.toHaveBeenCalled();
  });

  it('rechecks unresolved submissions after the nonce read, before a biometric prompt', async () => {
    const { service, manager } = host();
    manager.publicClient.readContract.mockImplementation(async () => {
      manager.getPendingSubmission.mockReturnValue({ kind: 'transaction', nonce: '1' }); return NONCE;
    });
    await expect(service.registerAndJoinNewUser(JOIN, 'member_2', credential)).rejects.toThrow('earlier transaction');
    expect(signRegistrationChallenge).not.toHaveBeenCalled();
    expect(manager.execute).not.toHaveBeenCalled();
  });

  it.each(['passkey', 'eoa'])('rejects stale %s completions before execution', async mode => {
    const { service, manager } = host();
    const stale = () => { manager.assertCurrent.mockImplementation(() => { throw new Error('stale account'); }); };
    signRegistrationChallenge.mockImplementation(async () => { stale(); return auth; });
    signRegistration.mockImplementation(async ({ guard }) => { stale(); guard(); });
    const operation = mode === 'passkey' ? service.registerAndJoinNewUser(JOIN, 'member_2', credential)
      : service.registerAndJoinEOA(JOIN, 'member_2', { getAddress: vi.fn(async () => USER) });
    await expect(operation).rejects.toThrow('stale account');
    expect(manager.execute).not.toHaveBeenCalled();
  });
});
