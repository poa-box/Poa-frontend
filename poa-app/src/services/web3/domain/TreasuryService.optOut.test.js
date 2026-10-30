import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { utils } from 'ethers';
import { PaymentManagerAbi } from '@poa-box/core/abis/PaymentManager';
import { ContractFactory } from '@/services/web3/core/ContractFactory';
import { TreasuryService } from '@/services/web3/domain/TreasuryService';

const PAYMENT_MANAGER = `0x${'ab'.repeat(20)}`;
const MEMBER = `0x${'cd'.repeat(20)}`;
const OTHER_MANAGER = `0x${'12'.repeat(20)}`;
const OTHER_MEMBER = `0x${'34'.repeat(20)}`;

function readService(value) {
  // ethers.Contract performs the real core ABI encoding/decoding; only transport is fake.
  const provider = { _isProvider: true, call: vi.fn(async () => utils.defaultAbiCoder.encode(['bool'], [value])) };
  const factory = new ContractFactory(null, provider);
  vi.spyOn(factory, 'createReadOnly');
  const manager = { execute: vi.fn() };
  return { service: new TreasuryService(factory, manager), factory, provider, manager };
}

beforeEach(() => vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); })));
afterEach(() => vi.unstubAllGlobals());

describe('TreasuryService public opt-out read with the installed core ABI', () => {
  it.each([true, false])('decodes %s using isOptedOut(address) on the selected factory', async value => {
    const selected = readService(value);
    const otherChain = readService(!value);
    expect(await selected.service.isOptedOut(PAYMENT_MANAGER, MEMBER)).toBe(value);
    expect(selected.factory.createReadOnly).toHaveBeenCalledExactlyOnceWith(PAYMENT_MANAGER, PaymentManagerAbi);
    expect(selected.provider.call).toHaveBeenCalledOnce();
    const [transaction] = selected.provider.call.mock.calls[0];
    // Assert the actual wire selector independently of the ABI lookup.
    expect(transaction.to.toLowerCase()).toBe(PAYMENT_MANAGER);
    expect(transaction.data.toLowerCase()).toBe(
      utils.id('isOptedOut(address)').slice(0, 10) + utils.defaultAbiCoder.encode(['address'], [MEMBER]).slice(2),
    );
    expect(otherChain.provider.call).not.toHaveBeenCalled();
    expect(await otherChain.service.isOptedOut(OTHER_MANAGER, OTHER_MEMBER)).toBe(!value);
    const [otherTransaction] = otherChain.provider.call.mock.calls[0];
    expect(otherTransaction.to.toLowerCase()).toBe(OTHER_MANAGER);
    expect(otherTransaction.data.slice(10)).toBe(utils.defaultAbiCoder.encode(['address'], [OTHER_MEMBER]).slice(2));
    expect(selected.provider.call).toHaveBeenCalledOnce();
    expect(selected.manager.execute).not.toHaveBeenCalled();
    expect(otherChain.manager.execute).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid', MEMBER, 'PaymentManager contract address'],
    [undefined, MEMBER, 'PaymentManager contract address'],
    [PAYMENT_MANAGER, 'invalid', 'User address'],
    [PAYMENT_MANAGER, undefined, 'User address'],
  ])('rejects invalid addresses before contract creation or transport (%s, %s)', async (contract, member, label) => {
    const { service, factory, provider, manager } = readService(false);
    await expect(service.isOptedOut(contract, member)).rejects.toThrow(label);
    expect(factory.createReadOnly).not.toHaveBeenCalled();
    expect(provider.call).not.toHaveBeenCalled();
    expect(manager.execute).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('propagates a failed read without turning unknown into false', async () => {
    const { service, provider, manager } = readService(false);
    const failure = new Error('Mock selected-chain read unavailable');
    provider.call.mockRejectedValue(failure);
    await expect(service.isOptedOut(PAYMENT_MANAGER, MEMBER)).rejects.toBe(failure);
    expect(provider.call).toHaveBeenCalledOnce();
    expect(manager.execute).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
