import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPasskeyCredential } from '@/services/web3/passkey/passkeyCreate';
import { createZkEmailOnboardingService } from '@/services/web3/domain/ZkEmailOnboardingService';

vi.mock('@/services/web3/passkey/passkeyCreate', () => ({ createPasskeyCredential: vi.fn() }));
const address = (byte) => `0x${byte.repeat(20)}`;

beforeEach(() => vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

describe('email account enrollment readiness', () => {
  it('rejects an unconfigured enrollment factory before a passkey is created', async () => {
    const service = createZkEmailOnboardingService({
      chainId: 100,
      publicClient: { getChainId: vi.fn(async () => 100), readContract: vi.fn(({ functionName }) => Promise.resolve(functionName === 'accountRegistry' ? address('22') : address('00'))) },
      factoryAddress: address('11'), registryAddress: address('22'), zkEmailInvitesAddress: address('33'),
    });
    await expect(service.createPendingCredential('alice')).rejects.toThrow('Sign in with an existing account');
    expect(createPasskeyCredential).not.toHaveBeenCalled();
  });
});
