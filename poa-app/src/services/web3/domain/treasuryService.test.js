import { describe, it, expect, vi } from 'vitest';
import { utils } from 'ethers';
import { TreasuryService } from '@/services/web3/domain/TreasuryService';
import PaymentAbi from '../../../../abi/PaymentManager.json';
import TokenAbi from '../../../../abi/ERC20.json';

const PM = `0x${'1'.repeat(40)}`, TOKEN = `0x${'2'.repeat(40)}`, MEMBER = `0x${'3'.repeat(40)}`;
const ORG = `0x${'4'.repeat(64)}`, ROOT = `0x${'5'.repeat(64)}`;
function service() {
  const receipt = { success: true, hash: ROOT, receipt: { status: 1 }, extraHostField: 'preserved' };
  const factory = { createWritable: vi.fn((address, abi) => ({ address, interface: new utils.Interface(abi) })) };
  const tx = { execute: vi.fn().mockResolvedValue(receipt) };
  return { service: new TreasuryService(factory, tx), factory, tx, receipt };
}

describe('core treasury service bridge', () => {
  it('preserves exact raw units, calldata, raw manager result and lifecycle options for both funding paths', async () => {
    const { service: treasury, tx, receipt } = service();
    const options = { onSuccess: vi.fn(), scopeGuard: vi.fn(), gasLimit: 300000 };
    const raw = '9007199254740993123456789';
    expect(await treasury.depositERC20(PM, TOKEN, raw, options)).toBe(receipt);
    const [contract, method, args, forwarded] = tx.execute.mock.calls[0];
    expect(contract.address).toBe(PM);
    expect(contract.interface.encodeFunctionData(method, args)).toBe(new utils.Interface(PaymentAbi).encodeFunctionData('payERC20', [TOKEN, raw]));
    expect(forwarded).toMatchObject(options);
    expect(forwarded.value).toBe('0');
    await treasury.transferERC20(TOKEN, MEMBER, '1', options);
    const [token, transfer, transferArgs] = tx.execute.mock.calls[1];
    expect(token.address).toBe(TOKEN);
    expect(token.interface.encodeFunctionData(transfer, transferArgs)).toBe(new utils.Interface(TokenAbi).encodeFunctionData('transfer', [MEMBER, '1']));
    expect(tx.execute).toHaveBeenCalledTimes(2); // direct funding needs no approval transaction
  });
  it('approves the requested allowance and preserves the native fee-fund value', async () => {
    const { service: treasury, tx } = service();
    await treasury.approveToken(TOKEN, PM, '1');
    expect(tx.execute.mock.calls[0].slice(1, 3)).toEqual(['approve', [PM, '1']]);
    await treasury.depositToGasPool(PM, ORG, '123456789123456789', { confirmations: 2 });
    expect(tx.execute.mock.calls[1].slice(1)).toEqual(['depositForOrg', [ORG], { confirmations: 2, value: '123456789123456789' }]);
    await expect(treasury.depositToGasPool(PM, ORG, '1', { value: '2' })).rejects.toThrow('Conflicting');
    expect(tx.execute).toHaveBeenCalledTimes(2);
  });
  it('claims stored raw payout units without scaling and encodes both finalize arguments', async () => {
    const { service: treasury, tx } = service();
    await treasury.claimDistribution(PM, '9007199254740993', '1', [ROOT]);
    expect(tx.execute.mock.calls[0].slice(1, 3)).toEqual(['claimDistribution', ['9007199254740993', '1', [ROOT]]]);
    await treasury.claimMultiple(PM, [{ distributionId: '1', amount: '1234567', proof: [] }, { distributionId: '2', amount: '1', proof: [ROOT] }]);
    expect(tx.execute.mock.calls[1].slice(1, 3)).toEqual(['claimMultiple', [['1', '2'], ['1234567', '1'], [[], [ROOT]]]]);
    await treasury.finalizeDistribution(PM, '1', '9007199254740993');
    expect(tx.execute.mock.calls[2].slice(1, 3)).toEqual(['finalizeDistribution', ['1', '9007199254740993']]);
  });
  it('rejects unsafe, fractional, negative, zero and malformed raw inputs before host execution', async () => {
    const { service: treasury, tx } = service();
    for (const raw of [9007199254740992, '-1', '1.5', '1e18', '0', 'wat']) {
      await expect(treasury.transferERC20(TOKEN, MEMBER, raw)).rejects.toThrow();
    }
    await expect(treasury.claimDistribution(PM, '1', '1', ['0x1234'])).rejects.toThrow();
    expect(tx.execute).not.toHaveBeenCalled();
  });
});
