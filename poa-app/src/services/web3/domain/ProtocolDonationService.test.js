import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { NETWORKS } from '@/config/networks';
import { createProtocolDonationService } from '@/services/web3/domain/ProtocolDonationService';
const fixture = vi.hoisted(() => ({ execute: vi.fn(), options: null }));
vi.mock('@/services/web3/core/ContractFactory', () => ({ ContractFactory: class {
  createWritable(address, abi) { return { address, interface: new ethers.utils.Interface(abi) }; }
} }));
vi.mock('@/services/web3/core/TransactionManager', () => ({ TransactionManager: class {
  constructor(_signer, options) { fixture.options = options; }
  execute(...args) { return fixture.execute(...args); }
} }));
const account = '0x' + '1'.repeat(40), hub = '0x' + '2'.repeat(40);
const signer = (chainId = 100, address = account) => ({ getChainId: vi.fn(async () => chainId), getAddress: vi.fn(async () => address), provider: {} });
const config = (network = NETWORKS.gnosis) => ({ chainId: network.chainId, accountAddress: account, isPasskeyUser: false,
  source: { chainId: network.chainId, endpoint: network.subgraphUrl, contract: hub }, paymasterAddress: hub, getSigner: vi.fn(async () => signer(network.chainId)) });
beforeEach(() => { vi.clearAllMocks(); fixture.options = null; vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); })); });
afterEach(() => vi.unstubAllGlobals());
describe('non-organization donation service with core 2.0.0 ABI and intent', () => {
  it.each([NETWORKS.gnosis, NETWORKS.arbitrum])('keeps the selected $name chain, exact payable value, options and raw manager result', async network => {
    const result = { success: true, txHash: 'mock-hash', receipt: { status: 1 } };
    fixture.execute.mockResolvedValue(result);
    const service = await createProtocolDonationService(config(network)), onStateChange = vi.fn();
    expect(await service.donate('9007199254740993123456789', { onStateChange, confirmations: 2 })).toBe(result);
    const [contract, method, args, options] = fixture.execute.mock.calls[0];
    expect(contract.address).toBe(hub); expect(method).toBe('donateToSolidarity'); expect(args).toEqual([]);
    expect(contract.interface.getFunction(method).stateMutability).toBe('payable');
    expect(contract.interface.encodeFunctionData(method, args)).toBe(ethers.utils.id('donateToSolidarity()').slice(0, 10));
    expect(options).toMatchObject({ value: '9007199254740993123456789', onStateChange, confirmations: 2 });
    expect(fixture.options).toMatchObject({ chainId: network.chainId, accountAddress: account }); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', '1.5', Number.MAX_SAFE_INTEGER + 1, (1n << 256n).toString()])('rejects invalid raw amount %s before manager execution', async amount => {
    const service = await createProtocolDonationService(config());
    await expect(service.donate(amount)).rejects.toThrow(); expect(fixture.execute).not.toHaveBeenCalled();
  });
  it('preserves one raw wei without implicit native-unit scaling', async () => {
    const result = { success: true }; fixture.execute.mockResolvedValue(result);
    expect(await (await createProtocolDonationService(config())).donate(1n)).toBe(result);
    expect(fixture.execute.mock.calls[0][3].value).toBe('1');
  });
  it('rejects conflicting native options instead of silently changing the donation', async () => {
    const service = await createProtocolDonationService(config());
    await expect(service.donate('5', { value: '6' })).rejects.toThrow('Conflicting native values');
    expect(fixture.execute).not.toHaveBeenCalled();
  });
  it.each(['endpoint', 'chain', 'hub', 'passkey'])('rejects a wrong %s before acquiring any signer', async mismatch => {
    const input = config();
    if (mismatch === 'endpoint') input.source.endpoint = 'https://wrong.invalid';
    if (mismatch === 'chain') input.source.chainId = NETWORKS.arbitrum.chainId;
    if (mismatch === 'hub') input.source.contract = account;
    if (mismatch === 'passkey') input.isPasskeyUser = true;
    await expect(createProtocolDonationService(input)).rejects.toThrow(); expect(input.getSigner).not.toHaveBeenCalled();
  });
  it.each([signer(42161), signer(100, hub)])('refuses a wallet bound to a different network or account', async wallet => {
    await expect(createProtocolDonationService({ ...config(), getSigner: async () => wallet })).rejects.toThrow('wallet account or network changed');
    expect(fixture.execute).not.toHaveBeenCalled();
  });
  it('reacquires and rechecks the signer at manager execution and rejects stale scopes', async () => {
    const input = config(); input.getSigner.mockResolvedValueOnce(signer()).mockResolvedValueOnce(signer(42161));
    const service = await createProtocolDonationService(input);
    fixture.execute.mockImplementation(async () => fixture.options.ensureChain());
    await expect(service.donate('1')).rejects.toThrow('wallet account or network changed');
    let current = true;
    const guarded = await createProtocolDonationService({ ...config(), guard: () => { if (!current) throw new Error('stale'); } });
    current = false; fixture.execute.mockClear();
    await expect(guarded.donate('1')).rejects.toThrow('stale'); expect(fixture.execute).not.toHaveBeenCalled();
  });
  it('preserves cancellation/error results for the host notification flow', async () => {
    const result = { success: false, error: { category: 'user_rejected', userMessage: 'Cancelled' } };
    fixture.execute.mockResolvedValue(result);
    expect(await (await createProtocolDonationService(config())).donate('1')).toBe(result);
  });
});
