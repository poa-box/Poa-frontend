import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { p256 } from '@noble/curves/p256';
import { ethers } from 'ethers';
import { createPublicClient, custom } from 'viem';
import { restoreCredentialKeys, resolveAccountDeployment } from '@/services/web3/passkey/accountReadiness';
const ACCOUNT = '0x1111111111111111111111111111111111111111';
const FACTORY = '0x2222222222222222222222222222222222222222';
const credentialId = ethers.utils.keccak256(Buffer.from([1, 2, 3]));
const point = Buffer.from(p256.getPublicKey('01'.padStart(64, '0'), false)).toString('hex');
const keys = { publicKeyX: `0x${point.slice(2, 66)}`, publicKeyY: `0x${point.slice(66)}` };
const credential = { ...keys, credentialId, rawCredentialId: Buffer.from([1, 2, 3]).toString('base64url'), accountAddress: ACCOUNT, salt: '9007199254740993123456789', credentialChainId: 100 };
const sourceClient = () => ({ getChainId: vi.fn(async () => 100), getBytecode: vi.fn(async () => '0x1234'), readContract: vi.fn(async () => ({ ...keys, active: true })) });
beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); })));
afterEach(() => vi.unstubAllGlobals());
describe('observed-source credential restoration', () => {
  it('restores only an active source P256 key, preserving identity and exact salt', async () => {
    const client = sourceClient();
    const clientForChain = vi.fn(() => client);
    expect(await restoreCredentialKeys({ ...credential, publicKeyX: undefined, publicKeyY: undefined }, { clientForChain })).toEqual(credential);
    expect(clientForChain).toHaveBeenCalledExactlyOnceWith(100);
    expect(client.readContract).toHaveBeenCalledWith(expect.objectContaining({ address: ACCOUNT, functionName: 'getCredential', args: [credentialId] }));
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['outage', 'wrong-chain', 'undeployed', 'inactive', 'invalid-point', 'mismatched-raw-id', 'missing-source'])('keeps %s unresolved without synthetic keys', async mode => {
    const client = sourceClient();
    const partial = { ...credential, publicKeyX: undefined, publicKeyY: undefined };
    if (mode === 'outage') client.readContract.mockRejectedValue(new Error('Offline'));
    if (mode === 'wrong-chain') client.getChainId.mockResolvedValue(42161);
    if (mode === 'undeployed') client.getBytecode.mockResolvedValue('0x');
    if (mode === 'inactive') client.readContract.mockResolvedValue({ ...keys, active: false });
    if (mode === 'invalid-point') client.readContract.mockResolvedValue({ publicKeyX: `0x${'11'.repeat(32)}`, publicKeyY: `0x${'22'.repeat(32)}`, active: true });
    if (mode === 'mismatched-raw-id') partial.rawCredentialId = 'BAUG';
    if (mode === 'missing-source') delete partial.credentialChainId;
    await expect(restoreCredentialKeys(partial, { clientForChain: () => client })).rejects.toThrow();
    expect(partial.publicKeyX).toBeUndefined();
  });
  it('rejects a late source read after account scope changes', async () => {
    let current = true;
    const client = sourceClient();
    client.readContract.mockImplementation(async () => { current = false; return { ...keys, active: true }; });
    await expect(restoreCredentialKeys({ ...credential, publicKeyX: undefined }, { clientForChain: () => client, guard: () => { if (!current) throw new Error('stale'); } })).rejects.toThrow('stale');
  });
});
describe('positive deployment readiness', () => {
  it('accepts deployed account bytecode without requiring a factory', async () => {
    const client = sourceClient();
    expect(await resolveAccountDeployment({ credential, publicClient: client, chainId: 100 })).toEqual({ status: 'deployed', initCode: '0x' });
    expect(client.readContract).not.toHaveBeenCalled();
  });
  it('accepts viem’s actual undefined result for an empty account while retaining factory and address checks', async () => {
    const rpc = vi.fn(async ({ method, params }) => {
      if (method === 'eth_chainId') return '0x64';
      if (method === 'eth_getCode') return params[0].toLowerCase() === ACCOUNT ? '0x' : '0x1234';
      if (method === 'eth_call') return ethers.utils.defaultAbiCoder.encode(['address'], [ACCOUNT]);
      throw new Error('Unexpected offline RPC: ' + method);
    });
    const client = createPublicClient({ transport: custom({ request: rpc }) });
    expect(await client.getBytecode({ address: ACCOUNT })).toBeUndefined();
    const ready = await resolveAccountDeployment({ credential, factoryAddress: FACTORY, publicClient: client, chainId: 100 });
    expect(ready.status).toBe('deployable');
    expect(ready.initCode.slice(0, 42)).toBe(FACTORY);
    expect(rpc.mock.calls.some(([request]) => request.method === 'eth_call')).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('builds initCode only after chain, factory code and identical CREATE2 address checks', async () => {
    const client = sourceClient();
    client.getBytecode.mockImplementation(async ({ address }) => address === ACCOUNT ? '0x' : '0x1234');
    client.readContract.mockResolvedValue(ACCOUNT);
    const ready = await resolveAccountDeployment({ credential, factoryAddress: FACTORY, publicClient: client, chainId: 100 });
    expect(ready.status).toBe('deployable');
    const factoryAbi = new ethers.utils.Interface(['function createAccount(bytes32,bytes32,bytes32,uint256)']);
    const decoded = factoryAbi.decodeFunctionData('createAccount', `0x${ready.initCode.slice(42)}`);
    expect(decoded.map(value => value.toString())).toEqual([credentialId, keys.publicKeyX, keys.publicKeyY, credential.salt]);
  });
  it.each([ACCOUNT, '0xd2441d12038b79cdde3765b1ccba80368245389f', FACTORY])('accepts any existing account %s without a product blacklist', async accountAddress => {
    expect(await resolveAccountDeployment({ credential: { ...credential, accountAddress }, publicClient: sourceClient(), chainId: 100 }))
      .toEqual({ status: 'deployed', initCode: '0x' });
  });
  it.each(['missing-factory', 'factory-no-code', 'mismatch', 'read-outage', 'wrong-chain', 'retired-fixture-mismatch'])('never marks %s ready with empty initCode', async mode => {
    const client = sourceClient();
    client.getBytecode.mockImplementation(async ({ address }) => address === FACTORY && mode !== 'factory-no-code' ? '0x1234' : '0x');
    client.readContract.mockResolvedValue(mode === 'mismatch' ? FACTORY : ACCOUNT);
    if (mode === 'read-outage') client.readContract.mockRejectedValue(new Error('Offline'));
    if (mode === 'wrong-chain') client.getChainId.mockResolvedValue(42161);
    await expect(resolveAccountDeployment({ credential: mode === 'retired-fixture-mismatch' ? { ...credential, accountAddress: '0xd2441d12038B79CddE3765B1CCBA80368245389f' } : credential, factoryAddress: mode === 'missing-factory' ? null : FACTORY, publicClient: client, chainId: 100 })).rejects.toThrow();
    if (mode === 'retired-fixture-mismatch') expect(client.readContract).toHaveBeenCalled();
  });
});
