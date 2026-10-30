import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { executeProfileUpdate, executeUsernameUpdate } from '@/services/web3/core/accountActions';
import { signRegistration } from '@/services/web3/utils/registrySigner';
const ACCOUNT = '0x1111111111111111111111111111111111111111';
const REGISTRY = '0x2222222222222222222222222222222222222222';
const CID = 'QmYwAPJzv5CZsnAzt8auVZRnGi2Cjz5mPfYvJuLtLMgHNS';
const source = { account: ACCOUNT, contract: REGISTRY, chainId: 100, endpoint: 'https://gnosis.test', indexed: true, snapshot: 'latest', method: 'graph' };
const setup = () => {
  const result = { success: true, receipt: { logs: ['raw'] }, txHash: `0x${'aa'.repeat(32)}` };
  const factory = { createWritable: vi.fn((address, abi) => ({ address, interface: new ethers.utils.Interface(abi) })) };
  const manager = { execute: vi.fn(async () => result) };
  const params = { profileData: { bio: 'new', avatar: '', twitter: undefined, extension: 'excluded' }, resolveSource: vi.fn(async () => ({ source, metadata: { bio: 'old', github: 'old-github' } })), upload: vi.fn(async () => CID), createHost: vi.fn(async () => ({ factory, manager })), guard: vi.fn(), onStep: vi.fn() };
  return { params, result, factory, manager };
};
beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); })));
afterEach(() => vi.unstubAllGlobals());
describe('account mutation bridge', () => {
  it('uses full-form replacement with clears and canonical intent through the existing manager', async () => {
    const { params, result, factory, manager } = setup();
    expect(await executeProfileUpdate(params)).toEqual({ result, cid: CID, source });
    expect(params.upload).toHaveBeenCalledExactlyOnceWith('{"bio":"new","avatar":"","github":"","twitter":"","website":""}');
    const [contract, method, args, options] = manager.execute.mock.calls[0];
    expect(contract.address).toBe(REGISTRY);
    expect(method).toBe('setProfileMetadata');
    expect(args[0]).toMatch(/^0x[0-9a-f]{64}$/);
    expect(options.value).toBe('0');
    expect(factory.createWritable).toHaveBeenCalledOnce();
  });
  it.each(['invalid', 'source', 'upload', 'stale-upload', 'stale-host'])('never signs/sends after %s failure', async mode => {
    const { params, manager } = setup();
    let current = true;
    params.guard = () => { if (!current) throw new Error('stale'); };
    if (mode === 'invalid') params.profileData.bio = 'b'.repeat(281);
    if (mode === 'source') params.resolveSource.mockRejectedValue(new Error('partial'));
    if (mode === 'upload') params.upload.mockRejectedValue(new Error('offline'));
    if (mode === 'stale-upload') params.upload.mockImplementation(async () => { current = false; return CID; });
    if (mode === 'stale-host') params.createHost.mockImplementation(async () => { current = false; return {}; });
    await expect(executeProfileUpdate(params)).rejects.toThrow();
    expect(manager.execute).not.toHaveBeenCalled();
    if (mode === 'invalid' || mode === 'source') expect(params.upload).not.toHaveBeenCalled();
  });
  it.each(['submission_unknown', 'contract_revert'])('propagates %s as failed without success/fallback', async category => {
    const { params, manager } = setup();
    const error = { category, userMessage: 'Check transaction status.' };
    manager.execute.mockResolvedValue({ success: false, error });
    await expect(executeProfileUpdate(params)).rejects.toMatchObject({ message: error.userMessage, result: { success: false, error } });
    expect(manager.execute).toHaveBeenCalledOnce();
  });
  it('renames through actual registration source and retains original result/options', async () => {
    const { params, manager, result } = setup();
    const options = { onStateChange: vi.fn(), confirmations: 3 };
    expect(await executeUsernameUpdate({ ...params, username: 'new_member', options })).toBe(result);
    expect(params.resolveSource).toHaveBeenCalledWith('username');
    expect(params.createHost).toHaveBeenCalledExactlyOnceWith(source);
    expect(manager.execute).toHaveBeenCalledWith(expect.objectContaining({ address: REGISTRY }), 'changeUsername', ['new_member'], { ...options, value: '0' });
  });
  it('hands off the selected write source before host creation and omits the host-only callback from transport', async () => {
    const { params, manager, result } = setup();
    const order = [];
    const originalHost = params.createHost.getMockImplementation();
    params.createHost.mockImplementation(async selected => { order.push('host'); return originalHost(selected); });
    const onWriteSource = vi.fn(selected => { expect(selected).toBe(source); order.push('source'); });
    expect(await executeUsernameUpdate({ ...params, username: 'new_member', options: { onWriteSource } })).toBe(result);
    expect(order).toEqual(['source', 'host']);
    expect(manager.execute.mock.calls[0][3]).not.toHaveProperty('onWriteSource');
  });
  it('rejects a source callback whose asynchronous work crosses an identity change before host creation', async () => {
    const { params, manager } = setup(); let current = true;
    params.guard = () => { if (!current) throw new Error('stale'); };
    await expect(executeUsernameUpdate({ ...params, username: 'new_member', options: { onWriteSource: async () => { current = false; } } })).rejects.toThrow('stale');
    expect(params.createHost).not.toHaveBeenCalled(); expect(manager.execute).not.toHaveBeenCalled();
  });
});
describe('registration EOA typed-data codec', () => {
  it('signs core domain/types with exact nonce and host block deadline', async () => {
    const nonce = ethers.BigNumber.from('9007199254740993123456789');
    const contract = vi.spyOn(ethers, 'Contract', 'get').mockReturnValue(class { nonces = async () => nonce; });
    const signer = { getAddress: vi.fn(async () => ACCOUNT), getChainId: vi.fn(async () => 42161), _signTypedData: vi.fn(async () => '0x1234') };
    const provider = { getBlock: vi.fn(async () => ({ timestamp: 12345678 })) };
    try {
      const result = await signRegistration({ signer, registryAddress: REGISTRY, username: 'member', chainId: 100, readProvider: provider });
      const [domain, types, value] = signer._signTypedData.mock.calls[0];
      expect(domain).toEqual({ name: 'UniversalAccountRegistry', version: '1', chainId: '100', verifyingContract: REGISTRY });
      expect(types.RegisterAccount.map(row => row.name)).toEqual(['user', 'username', 'nonce', 'deadline']);
      expect(value.nonce.toString()).toBe(nonce.toString());
      expect(value.deadline.toString()).toBe('12345978');
      expect(result.signature).toBe('0x1234');
      expect(signer.getChainId).not.toHaveBeenCalled();
    } finally { contract.mockRestore(); }
  });
  it('does not sign typed data when a nonce read crosses the captured account scope', async () => {
    let current = true;
    const contract = vi.spyOn(ethers, 'Contract', 'get').mockReturnValue(class { nonces = async () => { current = false; return 0; }; });
    const signer = { getAddress: vi.fn(async () => ACCOUNT), getChainId: vi.fn(async () => 100), _signTypedData: vi.fn() };
    try {
      await expect(signRegistration({ signer, registryAddress: REGISTRY, username: 'member', readProvider: {},
        guard: () => { if (!current) throw new Error('stale'); } })).rejects.toThrow('stale');
      expect(signer._signTypedData).not.toHaveBeenCalled();
    } finally { contract.mockRestore(); }
  });
});
