import { describe, expect, it } from 'vitest';
import { ethers } from 'ethers';
import { decodeContractRevert, decodeRevertData, decodeExecutorCallFailure, extractRevertDataFromError } from '@/lib/errors/contractErrors';

describe('core protocol errors with host copy and historical diagnostics', () => {
  it('decodes a JSON-RPC body through core while ignoring transaction/request calldata', () => {
    const error = { transaction: { data: '0x5c975bda' }, request: { data: '0x95530668' },
      body: JSON.stringify({ error: { data: '0x82b42900' } }) };
    expect(extractRevertDataFromError(error)).toBe('0x82b42900');
    expect(decodeContractRevert(error).name).toBe('Unauthorized');
    expect(extractRevertDataFromError({ transaction: error.transaction, request: error.request })).toBeNull();
  });

  it('retains historical Hats and external cashout error names without granting method support', () => {
    const historical = new ethers.utils.Interface(['error NotAdmin(address,uint256)', 'error WrongToken(address,address)']);
    const address = '0x1111111111111111111111111111111111111111';
    const hats = decodeRevertData(historical.encodeErrorResult('NotAdmin', [address, '9007199254740993123']));
    expect(hats.name).toBe('NotAdminHats');
    expect(hats.args[1].toString()).toBe('9007199254740993123');
    expect(decodeRevertData(historical.encodeErrorResult('WrongToken', [address, address])).name).toBe('WrongToken');
    expect(decodeRevertData(historical.getSighash('NotAdmin')).name).toBe('NotAdminHats');
  });

  it('bounds cyclic envelopes and malformed standard errors rather than guessing a contract reason', () => {
    const cyclic = { transaction: { data: '0x5c975bda' } };
    cyclic.cause = cyclic;
    expect(extractRevertDataFromError(cyclic)).toBeNull();
    expect(decodeRevertData('0x08c379a0')).toBeNull();
    const panic = '0x4e487b71' + ethers.utils.defaultAbiCoder.encode(['uint256'], [0x11]).slice(2);
    expect(decodeRevertData(panic).name).toBe('Panic');
  });

  it('does not round a large executor call index into a plausible action number', () => {
    const data = '0x5c0dee5d' + ethers.utils.defaultAbiCoder.encode(['uint256', 'bytes'], ['9007199254740993123', '0x5c975bda']).slice(2);
    const failure = decodeExecutorCallFailure(data);
    expect(failure.index).toBeNull();
    expect(failure.message).toContain('One of the actions');
    expect(failure.inner.name).toBe('BadStatus');
  });
});
