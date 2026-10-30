import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { utils } from 'ethers';
import { CASHOUT_ESCROW_ABI_V1 } from '@poa-box/core/integrations/cashout';
import { createParityHost } from '@/test/parityHost';
import { cashoutGraph, cashoutCandidate, CASHOUT_TEST_USER as USER, CASHOUT_TEST_HASH as HASH } from '@/test/cashoutGraphFixture';
const f = vi.hoisted(() => ({ auth: {}, apollo: { query: vi.fn() }, rpc: { getChainId: vi.fn(), getBlock: vi.fn(), multicall: vi.fn(), getTransactionReceipt: vi.fn() },
  switch: vi.fn(), connector: vi.fn(), signer: {}, execute: vi.fn(), toast: vi.fn(), recovered: false, partial: false }));
vi.mock('@chakra-ui/react', async () => (await import('@/test/parityHost')).parityChakra(f.toast));
vi.mock('viem', async original => ({ ...await original(), createPublicClient: () => f.rpc }));
vi.mock('@/util/apolloClient', () => ({ getClient: () => f.apollo }));
vi.mock('@/context/authState', () => ({ useAuth: () => f.auth }));
vi.mock('@/context/WalletContext', () => ({ useConfig: () => ({}), useSwitchChain: () => ({ switchChainAsync: f.switch }),
  getConnectorClient: f.connector, clientToSigner: () => f.signer }));
// Replace only wallet/runtime creation. Recovery re-observation and core intents
// run through the real domain service; no signing manager is constructed.
vi.mock('@/services/web3/domain/AccountTransferService', async original => {
  const actual = await original();
  const { TreasuryService } = await import('@/services/web3/domain/TreasuryService');
  return { ...actual, createAccountTransferService: async ({ guard, chainId, accountAddress }) => new actual.AccountTransferService(
    { createWritable: (address, abi) => ({ address, abi }) }, { execute: f.execute },
    { guard, chainId, accountAddress, isPasskeyUser: false, signer: f.signer, getSigner: async () => f.signer, TreasuryService }) };
});
import PendingCashouts from '@/components/account/PendingCashouts';
import { ESCROW_V2_ADDRESS, USDC_BASE, CASHOUT_RELAY_ADDRESS } from '@/services/web3/domain/CashOutService';
const request = n => `0x${n.toString(16).padStart(64, '0')}`;
const failed = n => cashoutCandidate({ requestHash: request(n), amount: '1000001' }, 'FAILED');
const deposited = cashoutCandidate({ requestHash: request(3), amount: '2000002', createdTxHash: request(1003) }, 'DEPOSITED');
const iface = new utils.Interface([...CASHOUT_ESCROW_ABI_V1]);
let host, success;
const render = () => host.render(<PendingCashouts accountAddress={USER} onWithdrawSuccess={success} />);
async function loaded() {
  await render();
  await act(async () => { await vi.waitFor(() => expect(host.button('Refresh cashouts')).toBeDefined()); });
}
beforeEach(() => {
  vi.clearAllMocks(); f.recovered = false; f.partial = false;
  f.auth = { accountAddress: USER, isAuthHydrated: true, isPasskeyUser: false, sessionGeneration: 1, isSessionCurrent: () => true };
  f.switch.mockResolvedValue(undefined); f.connector.mockResolvedValue({});
  f.signer = { getAddress: vi.fn(async () => USER), getChainId: vi.fn(async () => 8453) };
  f.execute.mockImplementation(async (_contract, _method, _args, options) => { options?.onStateChange?.('pending'); f.recovered = true; return { success: true }; });
  f.apollo.query.mockImplementation(cashoutGraph({ failed: [failed(1)], deposited: [deposited] }));
  f.rpc.getChainId.mockResolvedValue(8453); f.rpc.getBlock.mockResolvedValue({ number: 100n, hash: HASH });
  const log = iface.encodeEventLog(iface.getEvent('DepositReceived'), [3n, USER, USDC_BASE, '2000002', ['1', '2000002'], USER, USER]);
  f.rpc.getTransactionReceipt.mockResolvedValue({ transactionHash: request(1003), status: 'success', blockNumber: 90n, blockHash: HASH,
    logs: [{ ...log, address: ESCROW_V2_ADDRESS, transactionHash: request(1003), logIndex: 1 }] });
  f.rpc.multicall.mockImplementation(async ({ contracts }) => contracts.map(call => {
    if (f.partial && call.args[0] === request(2)) return { status: 'failure' };
    const result = call.functionName === 'failedDepositor' ? USER : call.functionName === 'failedAmount' ? (f.recovered ? 0n : 1000001n)
      : call.functionName === 'usdc' ? USDC_BASE : { depositor: USER, token: USDC_BASE, remainingDeposits: f.recovered ? 0n : 2000002n, outstandingIntentAmount: 0n };
    return { status: 'success', result };
  }));
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); })); host = createParityHost(); success = vi.fn();
});
afterEach(async () => { await host.unmount(); expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe('mounted EOA cashout recovery with real core discovery and domain service', () => {
  it.each([['Recover USDC', 'recoverFailed', CASHOUT_RELAY_ADDRESS, request(1)], ['Withdraw to USDC', 'withdrawDeposit', ESCROW_V2_ADDRESS, '3']])(
    'recovers a nonempty %s row and refreshes current amounts', async (label, method, target, id) => {
      await loaded(); expect(host.container.textContent).toContain('1.00 USDC awaiting recovery');
      expect(host.container.textContent).toContain('2.00 USDC'); expect(host.button(label).disabled).toBe(false);
      await host.click(host.button(label));
      expect(f.execute).toHaveBeenCalledOnce();
      const [contract, called, args] = f.execute.mock.calls[0];
      expect(called).toBe(method); expect(contract.address.toLowerCase()).toBe(target.toLowerCase()); expect(args.map(String)).toEqual([id]);
      const bytes = new utils.Interface(contract.abi).encodeFunctionData(called, args);
      expect(bytes.slice(0, 10)).toBe(utils.id(`${method}(${method === 'recoverFailed' ? 'bytes32' : 'uint256'})`).slice(0, 10));
      expect(f.switch).toHaveBeenCalledExactlyOnceWith({ chainId: 8453 }); expect(success).toHaveBeenCalledOnce();
      expect(host.container.textContent).toBe('');
    });

  it('keeps a proven nonempty recovery usable during unrelated partial history', async () => {
    f.partial = true; f.apollo.query.mockImplementation(cashoutGraph({ failed: [failed(1), failed(2)] }));
    await loaded();
    expect(host.container.textContent).toContain('Some cashout details are unavailable'); expect(host.container.textContent).toContain('Amount unavailable');
    const buttons = host.nodes().filter(node => node.tagName === 'BUTTON' && node.textContent === 'Recover USDC');
    expect(buttons.map(button => button.disabled)).toEqual([false, true]);
    await host.click(buttons[0]); expect(f.execute).toHaveBeenCalledOnce(); expect(success).toHaveBeenCalledOnce();
  });

  it('retains a failed recovery and gives actionable wallet rejection feedback', async () => {
    f.execute.mockResolvedValue({ success: false, error: Object.assign(new Error('User rejected'), { code: 4001 }) });
    await loaded(); await host.click(host.button('Recover USDC'));
    expect(success).not.toHaveBeenCalled(); expect(host.button('Recover USDC').disabled).toBe(false);
    expect(f.toast).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', description: 'You rejected the transaction in your wallet.' }));
    expect(host.container.textContent).toContain('1.00 USDC awaiting recovery');
  });

  it('shows unavailable after a failed refresh, disables recovery, and recovers on retry', async () => {
    await loaded(); f.apollo.query.mockRejectedValue(new Error('Mock offline source'));
    await host.click(host.button('Refresh cashouts'));
    expect(host.container.textContent).toContain('Some cashout details are unavailable'); expect(host.container.textContent).toContain('Amount unavailable');
    expect(host.button('Recover USDC').disabled).toBe(true);
    f.apollo.query.mockImplementation(cashoutGraph({ failed: [failed(1)] }));
    await host.click(host.button('Refresh cashouts'));
    expect(host.button('Recover USDC').disabled).toBe(false); expect(host.container.textContent).toContain('1.00 USDC awaiting recovery');
  });

  it('masks the previous session immediately and refuses its saved recovery callback', async () => {
    await loaded(); const oldAction = host.props(host.button('Recover USDC')).onClick;
    let finish;
    f.apollo.query.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    f.auth = { ...f.auth, sessionGeneration: 2 };
    await render(); expect(host.container.textContent).not.toContain('USDC awaiting recovery');
    await act(async () => { await oldAction(); });
    expect(f.switch).not.toHaveBeenCalled(); expect(f.connector).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
    await act(async () => { finish(await cashoutGraph()({ query: 'CashoutDiscoveryState' })); });
  });
});
