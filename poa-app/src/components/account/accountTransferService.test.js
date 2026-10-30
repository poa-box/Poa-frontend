import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { utils } from 'ethers';
import { projectRecoveryFacts } from '@poa-box/core/integrations/cashout';
import { knownFact, unknownFact } from '@poa-box/core/data/facts';
import TokenAbi from '../../../abi/ERC20.json';
import { AccountTransferService, createAccountTransferService } from '@/services/web3/domain/AccountTransferService';
import { TreasuryService } from '@/services/web3/domain/TreasuryService';
const mock = vi.hoisted(() => ({ execute: null, bytecode: null, managers: [], contracts: [], outstanding: vi.fn() }));
vi.mock('@/services/web3/core/ContractFactory', async () => {
  const { utils } = await import('ethers');
  return { ContractFactory: class {
    createWritable(address, abi) { const contract = { address, interface: new utils.Interface(abi) }; mock.contracts.push(contract); return contract; }
  } };
});
vi.mock('@/services/web3/core/TransactionManager', () => ({ TransactionManager: class {
  constructor(signer, options) { this.execute = mock.execute; mock.managers.push({ kind: 'wallet', signer, options }); }
} }));
vi.mock('@/services/web3/core/SmartAccountTransactionManager', () => ({ SmartAccountTransactionManager: class {
  constructor(options) { this.execute = mock.execute; mock.managers.push({ kind: 'passkey', options }); }
} }));
vi.mock('@/services/web3/utils/chainClients', () => ({ createChainClients: chainId => chainId === 100 ? {
  publicClient: { getBytecode: mock.bytecode }, bundlerClient: {},
} : null }));
vi.mock('@/services/web3/domain/CashOutService', () => ({ BASE_CHAIN_ID: 8453, fetchOutstandingDeposits: (...args) => mock.outstanding(...args),
  CASHOUT_DESCRIPTOR: { chainId: 8453, sourceChainId: 42161, relay: '0x1111111111111111111111111111111111111111',
    escrow: '0x2222222222222222222222222222222222222222', token: '0x3333333333333333333333333333333333333333',
    relayAbiVersion: 'cashout-relay-v1', escrowAbiVersion: 'zkp2p-escrow-v2', },
}));
const ACCOUNT = '0x1111111111111111111111111111111111111111';
const TOKEN = '0x2222222222222222222222222222222222222222';
const DESTINATION = '0x3333333333333333333333333333333333333333';
const DESCRIPTOR = { chainId: 8453, relay: ACCOUNT, escrow: TOKEN, token: DESTINATION };
function recoveryRow(row, { amount = '9007199254740993', account = ACCOUNT, blockNumber = '100', capability } = {}) {
  const source = { chainId: 8453, account, contract: row.kind === 'unfilled' ? TOKEN : ACCOUNT,
    endpoint: 'https://cashout.invalid', method: 'eth_call', indexed: false, snapshot: 'pinned',
    block: { number: blockNumber, hash: '0x' + '7'.repeat(64) } };
  const data = row.kind === 'unfilled' ? { kind: 'escrow', depositId: String(row.depositId), depositor: account, token: DESTINATION, remainingDeposits: amount, outstandingIntentAmount: '0' }
    : { kind: 'failed', requestHash: row.requestHash, depositor: account, token: DESTINATION, amountRaw: amount };
  return { ...row, amount: BigInt(amount), remainingAmount: BigInt(amount), recoveryFacts: projectRecoveryFacts({ descriptor: DESCRIPTOR, account, block: source.block,
    snapshot: { source, data, coverage: { status: 'complete', receivedKeys: ['state'], missingIds: [], failedIds: [], issues: [] } },
    transactionCapability: capability === undefined ? unknownFact('HOST_TRANSACTION_CAPABILITY_UNPROVEN') : knownFact(capability, source) }) };
}
const signer = chainId => ({ getChainId: vi.fn(async () => chainId), getAddress: vi.fn(async () => ACCOUNT) });
beforeEach(() => {
  mock.execute = vi.fn(async () => ({ success: true, receipt: { status: 1 }, extra: 'host result' }));
  mock.bytecode = vi.fn(async () => '0x1234'); mock.managers = []; mock.contracts = []; mock.outstanding.mockReset();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network is forbidden'); }));
});
afterEach(() => vi.unstubAllGlobals());
describe('account transfer service uses existing canonical treasury execution', () => {
  it.each([false, true])('keeps chain, exact raw amounts, callbacks and manager result (passkey=%s)', async isPasskeyUser => {
    const guard = vi.fn(), getSigner = vi.fn(async () => signer(100));
    const service = await createAccountTransferService({ chainId: 100, accountAddress: ACCOUNT,
      isPasskeyUser, rawCredentialId: 'credential', guard, getSigner });
    const options = { onStateChange: vi.fn(), onSubmitted: vi.fn(), confirmations: 2 };
    for (const amount of ['1', '9007199254740993123456789']) {
      const result = await service.transferERC20(TOKEN, DESTINATION, amount, options);
      const [contract, method, args, forwarded] = mock.execute.mock.calls.at(-1);
      expect(contract.interface.encodeFunctionData(method, args)).toBe(new utils.Interface(TokenAbi).encodeFunctionData('transfer', [DESTINATION, amount]));
      expect(forwarded).toEqual({ ...options, value: '0' });
      expect(result).toBe(await mock.execute.mock.results.at(-1).value);
    }
    expect(mock.managers[0].kind).toBe(isPasskeyUser ? 'passkey' : 'wallet');
    expect(mock.managers[0].options.chainId).toBe(100);
    if (isPasskeyUser) {
      expect(mock.managers[0].options.paymasterAddress).toBeNull();
      expect(getSigner).not.toHaveBeenCalled();
    } else expect(mock.bytecode).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([undefined, '0x'])('refuses an undeployed passkey account before execution (code=%s)', async code => {
    mock.bytecode.mockResolvedValue(code);
    await expect(createAccountTransferService({ chainId: 100, accountAddress: ACCOUNT,
      isPasskeyUser: true, rawCredentialId: 'credential' })).rejects.toThrow(/not available/);
    expect(mock.execute).not.toHaveBeenCalled();
  });
  it('refuses wallet account/network mismatch before creating a write manager', async () => {
    const getSigner = vi.fn(async () => signer(42161));
    await expect(createAccountTransferService({ chainId: 100, accountAddress: ACCOUNT, getSigner })).rejects.toThrow(/account or network changed/);
    expect(mock.managers).toEqual([]);
    expect(mock.execute).not.toHaveBeenCalled();
  });
  it('rechecks identity after an asynchronous wallet selection and at every action', async () => {
    let current = true;
    const guard = () => { if (!current) throw new Error('stale'); };
    await expect(createAccountTransferService({ chainId: 100, accountAddress: ACCOUNT,
      getSigner: async () => { current = false; return signer(100); }, guard })).rejects.toThrow('stale');
    current = true;
    const service = await createAccountTransferService({ chainId: 100, accountAddress: ACCOUNT, getSigner: async () => signer(100), guard });
    current = false;
    expect(() => service.transferERC20(TOKEN, DESTINATION, '1')).toThrow('stale');
    expect(mock.execute).not.toHaveBeenCalled();
  });
  it('rejects malformed raw amounts without sending and preserves manager failure results', async () => {
    const service = await createAccountTransferService({ chainId: 100, accountAddress: ACCOUNT, getSigner: async () => signer(100) });
    for (const raw of [Number.MAX_SAFE_INTEGER + 1, '-1', '1.5', '1e18']) expect(() => service.transferERC20(TOKEN, DESTINATION, raw)).toThrow();
    expect(mock.execute).not.toHaveBeenCalled();
    const failure = { success: false, error: { userMessage: 'Transfer refused' } };
    mock.execute.mockResolvedValue(failure);
    expect(await service.transferERC20(TOKEN, DESTINATION, '1')).toBe(failure);
  });
  it('keeps allowance comparison exact and only approves when necessary', async () => {
    let allowance = '9007199254740993';
    const factory = { createReadOnly: () => ({ allowance: async () => allowance }),
      createWritable: (address, abi) => ({ address, interface: new utils.Interface(abi) }) };
    const service = new AccountTransferService(factory, { execute: mock.execute }, {
      TreasuryService, accountAddress: ACCOUNT, chainId: 42161, isPasskeyUser: false,
    });
    const approval = { token: TOKEN, spender: DESTINATION, amount: 9007199254740993n };
    expect(await service.approveIfNeeded(approval)).toEqual({ success: true, approvalRequired: false });
    expect(mock.execute).not.toHaveBeenCalled();
    allowance = '9007199254740992';
    await service.approveIfNeeded(approval);
    expect(mock.execute.mock.calls[0].slice(1, 3)).toEqual(['approve', [DESTINATION, ((1n << 256n) - 1n).toString()]]);
  });
  it('does not approve after an allowance read for a stale account', async () => {
    let current = true;
    const factory = { createReadOnly: () => ({ allowance: async () => { current = false; return '0'; } }) };
    const service = new AccountTransferService(factory, { execute: mock.execute }, { TreasuryService,
      accountAddress: ACCOUNT, guard: () => { if (!current) throw new Error('stale'); } });
    await expect(service.approveIfNeeded({ token: TOKEN, spender: DESTINATION, amount: 1n })).rejects.toThrow('stale');
    expect(mock.execute).not.toHaveBeenCalled();
  });
});

describe('cashout recovery transport', () => {
  it.each([
    [{ kind: 'unfilled', depositId: '9007199254740993' }, '0x2222222222222222222222222222222222222222', 'withdrawDeposit', ['9007199254740993']],
    [{ kind: 'failed', requestHash: '0x' + '4'.repeat(64) }, '0x1111111111111111111111111111111111111111', 'recoverFailed', ['0x' + '4'.repeat(64)]],
  ])('encodes current canonical recovery without narrowing IDs', async (row, target, method, args) => {
    row = recoveryRow(row);
    mock.outstanding.mockResolvedValue(Object.assign([recoveryRow(row, { blockNumber: '101' })], { coverage: { status: 'incomplete', issues: [{ code: 'UNRELATED_RECORD_UNAVAILABLE' }] } }));
    const service = await createAccountTransferService({ chainId: 8453, accountAddress: ACCOUNT, getSigner: async () => signer(8453) });
    const options = { onSubmitted: vi.fn() };
    const result = await service.recoverCashout(row, options);
    const [contract, actualMethod, actualArgs, forwarded] = mock.execute.mock.calls[0];
    expect(contract.address).toBe(target);
    expect(contract.interface.encodeFunctionData(actualMethod, actualArgs))
      .toBe(new utils.Interface([`function ${method}(${method === 'withdrawDeposit' ? 'uint256' : 'bytes32'})`]).encodeFunctionData(method, args));
    expect(forwarded.onSubmitted).toBe(options.onSubmitted);
    expect(result.success).toBe(true);
    expect(result).toBe(await mock.execute.mock.results[0].value);
  });
  it.each(['missing', 'unknown', 'changed-amount', 'other-account', 'older-block', 'failed-source', 'duplicate', 'denied-capability'])('refuses %s recovery evidence without sending', async mode => {
    const row = recoveryRow({ kind: 'failed', requestHash: '0x' + '4'.repeat(64) });
    let fresh = recoveryRow(row, { blockNumber: mode === 'older-block' ? '99' : '101',
      amount: mode === 'changed-amount' ? '9007199254740992' : '9007199254740993', account: mode === 'other-account' ? DESTINATION : ACCOUNT, capability: mode === 'denied-capability' ? false : undefined });
    if (mode === 'unknown') fresh.recoveryFacts = unknownFact('READ_FAILED');
    const next = Object.assign(mode === 'missing' ? [] : mode === 'duplicate' ? [fresh, fresh] : [fresh], { coverage: { status: 'complete' } });
    if (mode === 'failed-source') mock.outstanding.mockRejectedValue(new Error('source unavailable'));
    else mock.outstanding.mockResolvedValue(next);
    const service = await createAccountTransferService({ chainId: 8453, accountAddress: ACCOUNT, getSigner: async () => signer(8453) });
    await expect(service.recoverCashout(row)).rejects.toThrow();
    expect(mock.execute).not.toHaveBeenCalled();
  });
  it('rejects an unknown reviewed row before observing and rejects a stale account after the current source resolves', async () => {
    let current = true;
    const guard = () => { if (!current) throw new Error('stale'); };
    const service = await createAccountTransferService({ chainId: 8453, accountAddress: ACCOUNT, getSigner: async () => signer(8453), guard });
    await expect(service.recoverCashout({ kind: 'failed', requestHash: '0x' + '4'.repeat(64) })).rejects.toThrow('unavailable');
    expect(mock.outstanding).not.toHaveBeenCalled();
    const row = recoveryRow({ kind: 'failed', requestHash: '0x' + '4'.repeat(64) });
    mock.outstanding.mockImplementation(async () => { current = false; return [row]; });
    await expect(service.recoverCashout(row)).rejects.toThrow('stale');
    expect(mock.execute).not.toHaveBeenCalled();
  });
  it('rechecks the actual wallet after the source refresh and at every wallet await', async () => {
    const wallet = signer(8453);
    const row = recoveryRow({ kind: 'failed', requestHash: '0x' + '4'.repeat(64) });
    const service = await createAccountTransferService({ chainId: 8453, accountAddress: ACCOUNT, getSigner: async () => wallet });
    mock.outstanding.mockImplementation(async () => { wallet.getAddress.mockResolvedValue(DESTINATION); return Object.assign([row], { coverage: { status: 'complete' } }); });
    await expect(service.recoverCashout(row)).rejects.toThrow('network changed');
    expect(mock.execute).not.toHaveBeenCalled();
    let current = true;
    wallet.getChainId.mockImplementation(async () => { current = false; return 8453; });
    const stale = createAccountTransferService({ chainId: 8453, accountAddress: ACCOUNT, getSigner: async () => wallet,
      guard: () => { if (!current) throw new Error('stale'); } });
    wallet.getAddress.mockClear();
    await expect(stale).rejects.toThrow('stale');
    expect(wallet.getAddress).not.toHaveBeenCalled();
  });
  it('refuses recovery on the wrong chain and passkey cashouts before execution', async () => {
    const service = await createAccountTransferService({ chainId: 100, accountAddress: ACCOUNT, getSigner: async () => signer(100) });
    await expect(service.recoverCashout({ kind: 'unfilled', depositId: '1' })).rejects.toThrow(/cashout network/);
    const passkey = await createAccountTransferService({ chainId: 100, accountAddress: ACCOUNT, isPasskeyUser: true, rawCredentialId: 'credential' });
    await expect(passkey.recoverCashout({ kind: 'unfilled', depositId: '1' })).rejects.toThrow(/connected wallet/);
    await expect(passkey.approveIfNeeded({ token: TOKEN, spender: DESTINATION, amount: '1' })).rejects.toThrow(/connected wallet/);
    expect(mock.execute).not.toHaveBeenCalled();
  });
});

describe('cashout browser signing lifecycle', () => {
  it('signs the exact reviewed external request using a fresh matching wallet', async () => {
    const wallet = signer(42161); wallet._signTypedData = vi.fn(async () => 'synthetic-signature');
    const getSigner = vi.fn(async () => wallet);
    const service = await createAccountTransferService({ chainId: 42161, accountAddress: ACCOUNT, getSigner });
    const typedData = { domain: { chainId: 42161, verifyingContract: DESTINATION },
      types: { EIP712Domain: [], Permit: [{ name: 'amount', type: 'uint256' }] }, message: { amount: '9007199254740993' } };
    expect(await service.signCashout(typedData)).toBe('synthetic-signature');
    expect(getSigner).toHaveBeenCalledTimes(2);
    expect(wallet._signTypedData).toHaveBeenCalledWith(typedData.domain, { Permit: typedData.types.Permit }, typedData.message);
  });
  it('rejects a changed wallet/network before the signature prompt', async () => {
    const wallet = signer(42161); wallet._signTypedData = vi.fn();
    const service = await createAccountTransferService({ chainId: 42161, accountAddress: ACCOUNT, getSigner: async () => wallet });
    wallet.getChainId.mockResolvedValue(100);
    await expect(service.signCashout({})).rejects.toThrow(/network changed/);
    expect(wallet._signTypedData).not.toHaveBeenCalled();
  });
});
