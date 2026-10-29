import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { TransactionManager } from '@/services/web3/core/TransactionManager';
import { fakeBrowserLocks, recoveryTestStorage } from '@/services/web3/core/submissionTestHelpers';
const ACCOUNT = `0x${'11'.repeat(20)}`, OTHER = `0x${'22'.repeat(20)}`, TARGET = `0x${'33'.repeat(20)}`;
const HASH = `0x${'aa'.repeat(32)}`, BLOCK = `0x${'bb'.repeat(32)}`;
class HostSigner extends ethers.Signer {
  constructor(address) { super(); this.address = address; this.estimateGas = vi.fn(async () => ethers.BigNumber.from(100000));
    this.sendTransaction = vi.fn(async () => ({ hash: HASH, wait: async () => ({ transactionHash: HASH, blockNumber: 40, blockHash: BLOCK, status: 1, logs: [] }) })); }
  getAddress = async () => this.address;
  getChainId = async () => 100;
  getTransactionCount = async () => 7;
  signMessage = async () => { throw new Error('Test must not request a real signature'); };
  signTransaction = async () => { throw new Error('Test must not request a real signature'); };
  connect() { return this; }
}
beforeEach(() => {
  vi.stubGlobal('navigator', { locks: fakeBrowserLocks() });
  vi.stubGlobal('window', { localStorage: recoveryTestStorage() });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Offline test forbids network'); }));
  vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('real ethers-contract signer binding at the direct wallet boundary', () => {
  it.each(['absent', 'null'])('binds the actual call to the validated account even when ensureChain is %s', async mode => {
    const selected = new HostSigner(ACCOUNT), stale = new HostSigner(OTHER);
    const contract = new ethers.Contract(TARGET, ['function deposit(uint256 amount) payable'], stale);
    const manager = new TransactionManager(selected, { accountAddress: ACCOUNT, chainId: 100,
      publicClient: { getBlockNumber: vi.fn(async () => 39n) }, ...(mode === 'null' ? { ensureChain: async () => null } : {}) });
    const result = await manager.execute(contract, 'deposit', ['9007199254740993'], { value: '1' });
    expect(stale.estimateGas).not.toHaveBeenCalled(); expect(stale.sendTransaction).not.toHaveBeenCalled();
    expect(selected.sendTransaction).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    const sent = selected.sendTransaction.mock.calls[0][0];
    expect(sent.to.toLowerCase()).toBe(TARGET); expect(sent.nonce).toBe(7);
    expect(contract.interface.decodeFunctionData('deposit', sent.data)[0].toString()).toBe('9007199254740993');
  });  it('retains the reviewed arguments while a wallet-chain request is awaiting completion', async () => {
    const selected = new HostSigner(ACCOUNT), args = ['1'];
    const contract = new ethers.Contract(TARGET, ['function deposit(uint256 amount) payable'], selected);
    const manager = new TransactionManager(selected, { ensureChain: async () => { args[0] = '2'; return selected; } });
    expect((await manager.execute(contract, 'deposit', args)).success).toBe(true);
    const sent = selected.sendTransaction.mock.calls[0][0];
    expect(contract.interface.decodeFunctionData('deposit', sent.data)[0].toString()).toBe('1');
  });

});
