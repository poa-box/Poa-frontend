import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { p256 } from '@noble/curves/p256';
import { ethers } from 'ethers';
const fixture = vi.hoisted(() => ({ clients: vi.fn(), query: vi.fn(), endpoint: vi.fn(), save: vi.fn() }));
vi.mock('@/services/web3/utils/chainClients', () => ({ createChainClients: chain => fixture.clients(chain) }));
vi.mock('@/util/apolloClient', () => ({ getClient: endpoint => { fixture.endpoint(endpoint); return { query: fixture.query }; } }));
vi.mock('@/services/web3/passkey/passkeyStorage', () => ({ savePasskeyCredential: credential => fixture.save(credential) }));
import { createAccountHost } from '@/services/web3/core/accountHost';
const ACCOUNT = '0x1111111111111111111111111111111111111111';
const REGISTRY = '0x2222222222222222222222222222222222222222';
const FACTORY = '0x3333333333333333333333333333333333333333';
const source = { account: ACCOUNT, contract: REGISTRY, chainId: 100, endpoint: 'https://gnosis.test', indexed: true, snapshot: 'latest', method: 'graph' };
const point = Buffer.from(p256.getPublicKey('01'.padStart(64, '0'), false)).toString('hex');
const credential = { accountAddress: ACCOUNT, rawCredentialId: 'AQID', credentialId: ethers.utils.keccak256(Buffer.from([1, 2, 3])), publicKeyX: `0x${point.slice(2, 66)}`, publicKeyY: `0x${point.slice(66)}`, salt: '123', credentialChainId: 100 };
beforeEach(() => {
  vi.clearAllMocks();
  fixture.query.mockImplementation(async ({ query }) => ({ data: query.definitions[0].name.value === 'FetchPasskeyFactoryAddress'
    ? { passkeyAccountFactories: [{ id: FACTORY }] } : { poaManagerContracts: [{ paymasterHubProxy: FACTORY }] } }));
  fixture.clients.mockReturnValue({ publicClient: { getChainId: vi.fn(async () => 100), getBytecode: vi.fn(async () => '0x1234') }, bundlerClient: {} });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
});
afterEach(() => vi.unstubAllGlobals());
describe('action host uses selected account source and existing managers', () => {
  it('creates the passkey manager only after positive deployed evidence and persists validated public keys', async () => {
    const host = await createAccountHost({ source, accountAddress: ACCOUNT, isPasskeyUser: true, passkeyState: credential, guard: () => {} });
    expect(host.manager.constructor.name).toBe('SmartAccountTransactionManager');
    expect(host.manager.chainId).toBe(100); expect(host.manager.initCode).toBe('0x');
    expect(fixture.save).toHaveBeenCalledExactlyOnceWith(credential);
    expect(fixture.endpoint.mock.calls.every(([endpoint]) => endpoint === source.endpoint)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('reacquires the EOA signer on the registration chain and keeps unsupported wallets on the direct manager', async () => {
    const ensureWallet = vi.fn(async () => ({ signer: { getAddress: async () => ACCOUNT }, walletClient: { request: async () => '0x64' } }));
    const host = await createAccountHost({ source, accountAddress: ACCOUNT, isPasskeyUser: false, ensureWallet, guard: () => {} });
    expect(ensureWallet).toHaveBeenCalledExactlyOnceWith(100);
    expect(host.manager.constructor.name).toBe('TransactionManager');
  });
  it.each(['account', 'chain'])('rejects a wallet %s mismatch before constructing a writable action', async mismatch => {
    const ensureWallet = async () => ({ signer: { getAddress: async () => mismatch === 'account' ? FACTORY : ACCOUNT }, walletClient: { request: async () => mismatch === 'chain' ? '0xa4b1' : '0x64' } });
    await expect(createAccountHost({ source, accountAddress: ACCOUNT, isPasskeyUser: false, ensureWallet, guard: () => {} })).rejects.toThrow('account or network changed');
  });
  it('never falls back to home clients for an unsupported source chain', async () => {
    fixture.clients.mockReturnValue(null);
    await expect(createAccountHost({ source: { ...source, chainId: 1 }, accountAddress: ACCOUNT, isPasskeyUser: false, guard: () => {} })).rejects.toThrow('network is unavailable');
    expect(fixture.query).not.toHaveBeenCalled();
  });
});
