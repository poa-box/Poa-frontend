import { describe, expect, it, vi } from 'vitest';
import { checkWallet7702Support } from '@/services/web3/eip7702/authorizationBuilder';

const address = '0x1111111111111111111111111111111111111111';

describe('checkWallet7702Support', () => {
  it.each([undefined, {}, { address: undefined }])('rejects an unbound account %s even when signing methods exist', async (account) => {
    const client = {
      account,
      signAuthorization: vi.fn(),
      getCapabilities: vi.fn().mockResolvedValue({ 100: { authorization: { supported: true } } }),
    };
    expect(await checkWallet7702Support(client)).toBe(false);
    expect(client.getCapabilities).not.toHaveBeenCalled();
    expect(client.signAuthorization).not.toHaveBeenCalled();
  });

  it('permits capability detection once the same client is bound to an account', async () => {
    const client = { signAuthorization: vi.fn(), getCapabilities: vi.fn().mockResolvedValue({ 100: { authorization: { supported: true } } }) };
    expect(await checkWallet7702Support(client)).toBe(false);
    client.account = { address };
    expect(await checkWallet7702Support(client)).toBe(true);
    expect(client.signAuthorization).not.toHaveBeenCalled();
  });

  it('retains optimistic runtime fallback for bound wallets without capability RPC support', async () => {
    const client = { account: { address }, signAuthorization: vi.fn(), getCapabilities: vi.fn().mockRejectedValue(new Error('unsupported')) };
    expect(await checkWallet7702Support(client)).toBe(true);
  });

  it('requires a callable signing method even for a bound account', async () => {
    expect(await checkWallet7702Support({ account: { address }, signAuthorization: true })).toBe(false);
  });
});
