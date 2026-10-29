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

  it.each(['review expiry', 'host scope change', 'wallet account change', 'wallet chain change', 'wallet account round-trip event', 'wallet chain round-trip event', 'cancellation'])('refuses actual JsonRpcSigner dispatch after %s during ethers internal block lookup', async change => {
    let now = 1000, current = true, releaseBlock, walletAccount = ACCOUNT, chain = '0x64';
    const controller = new AbortController();
    const block = new Promise(resolve => { releaseBlock = resolve; });
    const trace = [];
    const listeners = new Map();
    const send = vi.fn(() => { throw new Error('OFFLINE_OBSERVED_ETH_SEND_TRANSACTION'); });
    const ethereum = { request: vi.fn(async ({ method, params }) => {
      trace.push(method);
      if (method === 'eth_chainId') return chain;
      if (method === 'eth_accounts') return [walletAccount];
      if (method === 'eth_estimateGas') return '0x186a0';
      if (method === 'eth_getTransactionCount') return '0x7';
      if (method === 'eth_blockNumber') { await block; return '0x28'; }
      if (method === 'eth_sendTransaction') return send(params);
      throw new Error('Unexpected offline wallet method: ' + method);
    }), on: (event, listener) => listeners.set(event, listener), removeListener: event => listeners.delete(event) };
    // ProviderConverter supplies this exact cached-address signer shape.
    const provider = new ethers.providers.Web3Provider(ethereum, { name: 'gnosis', chainId: 100 });
    const signer = provider.getSigner(ACCOUNT);
    const contract = new ethers.Contract(TARGET, ['function deposit(uint256 amount) payable'], signer);
    const beforeSend = vi.fn(() => {
      trace.push('FINAL_REVIEW');
      if (controller.signal.aborted) throw new Error('The action was cancelled.');
      if (now - 1000 > 30) throw new Error('The reviewed facts expired. Review again.');
    });
    const manager = new TransactionManager(signer, { accountAddress: ACCOUNT, chainId: 100,
      publicClient: { getBlockNumber: async () => 39n }, scopeGuard: () => { if (!current) throw new Error('The host scope changed.'); } });
    const pending = manager.execute(contract, 'deposit', ['9007199254740993'], { value: '1', beforeSend });
    await vi.waitFor(() => expect(trace).toContain('eth_blockNumber'));
    if (change === 'review expiry') now = 1040;
    if (change === 'host scope change') current = false;
    if (change === 'wallet account change') walletAccount = OTHER;
    if (change === 'wallet chain change') chain = '0xa4b1';
    if (change === 'wallet account round-trip event') { listeners.get('accountsChanged')([OTHER]); listeners.get('accountsChanged')([ACCOUNT]); }
    if (change === 'wallet chain round-trip event') { listeners.get('chainChanged')('0xa4b1'); listeners.get('chainChanged')('0x64'); }
    if (change === 'cancellation') controller.abort();
    releaseBlock();
    const result = await pending;
    expect(result.success).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(manager.getPendingSubmission()).toBeNull();
    expect(result.submissionState).toBe('not-submitted');
    expect(listeners.size).toBe(0);
  });

  it.each([['request', '1'], ['request', '90071992547409931234567'], ['legacy', '1']])('keeps the %s wallet handoff immediate and preserves exact value %s, decoded receipt events and the unsigned journal', async (mode, value) => {
    const trace = [], sends = [], amount = '9007199254740993';
    const abi = ['function deposit(uint256 amount) payable', 'event Deposited(address indexed account, uint256 amount)'];
    const iface = new ethers.utils.Interface(abi);
    const event = iface.encodeEventLog('Deposited', [ACCOUNT, amount]);
    let manager;
    const request = vi.fn(async ({ method, params }) => {
      trace.push(method);
      if (method === 'eth_chainId') return '0x64';
      if (method === 'eth_accounts') return [ACCOUNT];
      if (method === 'eth_estimateGas') return '0x186a0';
      if (method === 'eth_getTransactionCount') return '0x7';
      if (method === 'eth_blockNumber') return '0x28';
      if (method === 'eth_sendTransaction') { sends.push(params[0]); return HASH; }
      if (method === 'eth_getTransactionByHash') {
        // The acknowledgment is durable BEFORE ethers' fallible post-send lookup.
        expect(manager.getPendingSubmission()?.txHash).toBe(HASH);
        return { hash: HASH, nonce: '0x7', from: ACCOUNT, to: TARGET, input: sends[0].data,
          value: ethers.BigNumber.from(value).toHexString(), gas: sends[0].gas, gasPrice: '0x1',
          blockHash: BLOCK, blockNumber: '0x28', transactionIndex: '0x0', chainId: '0x64', type: '0x0',
          v: '0xeb', r: `0x${'01'.repeat(32)}`, s: `0x${'02'.repeat(32)}` };
      }
      if (method === 'eth_getTransactionReceipt') return { transactionHash: HASH, transactionIndex: '0x0',
        blockHash: BLOCK, blockNumber: '0x28', from: ACCOUNT, to: TARGET, contractAddress: null,
        cumulativeGasUsed: '0x100', gasUsed: '0x100', status: '0x1', type: '0x0',
        logsBloom: `0x${'00'.repeat(256)}`, logs: [{ address: TARGET, ...event, blockHash: BLOCK, blockNumber: '0x28',
          transactionHash: HASH, transactionIndex: '0x0', logIndex: '0x0', removed: false }] };
      throw new Error('Unexpected offline wallet method: ' + method);
    });
    const ethereum = mode === 'request' ? { request } : { sendAsync: (payload, callback) => {
      request(payload).then(result => callback(null, { id: payload.id, jsonrpc: '2.0', result }), callback);
    } };
    const provider = new ethers.providers.Web3Provider(ethereum, { name: 'gnosis', chainId: 100 });
    const originalSend = provider.send, signer = provider.getSigner(ACCOUNT);
    const contract = new ethers.Contract(TARGET, abi, signer);
    const beforeSend = vi.fn(() => { trace.push('FINAL_REVIEW'); });
    manager = new TransactionManager(signer, { accountAddress: ACCOUNT, chainId: 100,
      publicClient: { getBlockNumber: async () => 39n } });
    const result = await manager.execute(contract, 'deposit', [amount], { value, beforeSend });
    expect(result.success, result.error?.userMessage).toBe(true);
    expect(sends).toHaveLength(1);
    expect(BigInt(sends[0].value).toString()).toBe(value);
    expect(BigInt(sends[0].nonce)).toBe(7n);
    expect(iface.decodeFunctionData('deposit', sends[0].data)[0].toString()).toBe(amount);
    expect(trace[trace.indexOf('eth_sendTransaction') - 1]).toBe('FINAL_REVIEW');
    expect(beforeSend).toHaveBeenCalledTimes(2);
    expect(result.receipt.events[0]).toMatchObject({ event: 'Deposited', args: expect.anything() });
    expect(result.receipt.events[0].args.amount.toString()).toBe(amount);
    expect(manager.getPendingSubmission()).toBeNull();
    expect(provider.send).toBe(originalSend); expect(signer.provider).toBe(provider);
  });

});
