import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ start: null, sign: vi.fn(), connector: vi.fn(), switchChain: vi.fn(), map: vi.fn(), providerCalls: [], toast: vi.fn(), signer: { getChainId: async () => 100, getAddress: async () => `0x${'11'.repeat(20)}` }, retrySigner: {} }));
vi.mock('@chakra-ui/react', async () => {
  const chakra = (await import('@/test/mockChakra')).mockChakra();
  chakra.useToast = () => fixture.toast; chakra.useBreakpointValue = () => 'md';
  return chakra;
});
vi.mock('ethers', async original => {
  const actual = await original();
  class ReadProvider { constructor(url, network) { this.url = url; this.network = network; fixture.providerCalls.push(this); } }
  return { ...actual, ethers: { ...actual.ethers, providers: { ...actual.ethers.providers, JsonRpcProvider: ReadProvider } } };
});
vi.mock('@/context/WalletContext', () => ({ useAccount: () => ({ address: `0x${'11'.repeat(20)}`, status: 'connected', chainId: 42161 }),
  useDisconnect: () => ({ disconnect() {} }), useSwitchChain: () => ({ switchChainAsync: fixture.switchChain }), useConfig: () => ({}),
  getConnectorClient: (...args) => fixture.connector(...args), useEthersSigner: () => fixture.signer,
  clientToSigner: client => client.signer }));
vi.mock('@/context/authState', () => ({ useAuth: () => ({}) }));
vi.mock('@/context/ipfsContext', () => ({ useIPFScontext: () => ({ addToIpfs: async () => ({ path: 'QmYwAPJzv5CZsnAzt8auVZRnGi2Cjz5mPfYvJuLtLMgHNS' }) }) }));
vi.mock('next/router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/util/apolloClient', () => ({ getClient: () => ({}) }));
vi.mock('@apollo/client', () => ({ useQuery: () => ({ data: { poaManagerContracts: [{ id: `0x${'22'.repeat(20)}`, globalAccountRegistryProxy: `0x${'33'.repeat(20)}`, orgDeployerProxy: `0x${'44'.repeat(20)}` }] } }) }));
vi.mock('@/util/passkeyQueries', () => ({ FETCH_PASSKEY_FACTORY_ADDRESS: {} }));
vi.mock('@/util/queries', () => ({ FETCH_INFRASTRUCTURE_ADDRESSES: {}, FETCH_USERNAME_NEW: {} }));
vi.mock('@/components/Architect/LogoDropzoneModal', () => ({ default: () => null }));
vi.mock('@/components/Architect/LinksModal', () => ({ default: () => null }));
vi.mock('@/features/deployer/components/DeploymentPreviewModal', () => ({ DeploymentPreviewModal: () => null }));
vi.mock('@/services/web3/utils/registrySigner', () => ({ signRegistration: options => fixture.sign(options), getSkipRegistrationDefaults: () => ({}) }));
vi.mock('@/features/deployer', () => ({ DeployerProvider: ({ children }) => children,
  useDeployer: () => ({ state: { selectedChainId: 100, organization: { name: 'Test draft', username: 'founder' }, roles: [], bootstrap: {}, features: {} }, actions: { setIPFSHash() {} } }),
  DeployerWizard: props => { fixture.start = props.onDeployStart; return null; },
  mapStateToAccessV2DeploymentParams: (...args) => fixture.map(...args),
  validateAccessV2Representability: () => ({ isValid: true }), ORG_DEPLOYER_SCHEMA: { ACCESS_V2: 'v2' },
  detectOrgDeployerSchema: async () => ({ schema: 'v2', version: '2.0.0' }), assertDeployedOrgDeployerSchema: vi.fn(),
  getPaymasterFundingValue: vi.fn(), decodeOrgDeploymentResult: vi.fn(), getOrgDeployerInterface: vi.fn(), encodeOrgDeploymentCalldata: vi.fn(),
}));
vi.mock('@/features/deployer/utils/usernameResolver', () => ({ resolveRoleUsernames: async roles => roles }));
vi.mock('@/features/deployer/utils/orgMetadata', () => ({ buildOrgMetadata: () => ({}), serializeOrgMetadata: () => '{}' }));
vi.mock('@/config/networks', () => ({ DEFAULT_DEPLOY_CHAIN_ID: 100, getSubgraphUrl: id => `https://chain-${id}.invalid`, getNetworkByChainId: id => ({ name: 'Gnosis', rpcUrl: `https://rpc-${id}.invalid` }) }));
vi.mock('@/services/web3/passkey/passkeySign', () => ({ signUserOpWithPasskey: vi.fn() }));
vi.mock('@/services/web3/passkey/userOpBuilder', () => ({ buildUserOp: vi.fn(), getUserOpHash: vi.fn() }));
vi.mock('../../../scripts/newDeployment', () => ({ deployWithCalldata: vi.fn() }));
import CreatePage from '@/features/deployer/CreatePage';
beforeEach(() => {
  vi.useFakeTimers(); fixture.providerCalls.length = 0; fixture.toast.mockClear();
  fixture.switchChain.mockReset().mockResolvedValue({ id: 100 });
  fixture.connector.mockReset().mockResolvedValueOnce({ signer: fixture.signer }).mockResolvedValue({ signer: fixture.retrySigner });
  fixture.sign.mockReset().mockRejectedValueOnce(new Error('Transient wallet error')).mockResolvedValue({ deadline: 2000000000n, nonce: 7n, signature: '0x1234' });
  // Stop before simulation/broadcast while observing the registration data that reaches preparation.
  fixture.map.mockReset().mockImplementation((_state, _address, options) => {
    if (options.regSignatureData) throw new Error('Test stops at the preparation boundary');
    return { roles: [] };
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('actual deployment registration preparation callback', () => {
  it('retries with the fresh target-chain signer and the same correct target-chain read transport', async () => {
    renderToStaticMarkup(<CreatePage />);
    const preparation = fixture.start({ deployerUsername: 'founder' }).catch(error => error);
    await vi.runAllTimersAsync();
    expect((await preparation).message).toBe('Test stops at the preparation boundary');
    expect(fixture.switchChain).toHaveBeenCalledWith({ chainId: 100 });
    expect(fixture.sign).toHaveBeenCalledTimes(2);
    const first = fixture.sign.mock.calls[0][0], retry = fixture.sign.mock.calls[1][0];
    expect(first).toMatchObject({ chainId: 100, username: 'founder', signer: fixture.signer });
    expect(retry).toMatchObject({ chainId: 100, username: 'founder', signer: fixture.retrySigner });
    expect(retry.readProvider).toBe(first.readProvider);
    expect(retry.readProvider).toMatchObject({ url: 'https://rpc-100.invalid', network: { chainId: 100, name: 'Gnosis' } });
    expect(fixture.map.mock.calls.at(-1)[2].regSignatureData).toEqual({ regDeadline: 2000000000n, regNonce: 7n, regSignature: '0x1234' });
  });
  it('does not retry an explicitly rejected signature', async () => {
    fixture.sign.mockReset().mockRejectedValue(Object.assign(new Error('Rejected'), { code: 'ACTION_REJECTED' }));
    renderToStaticMarkup(<CreatePage />);
    await fixture.start({ deployerUsername: 'founder' }).catch(() => {});
    expect(fixture.sign).toHaveBeenCalledTimes(1);
    expect(fixture.map).toHaveBeenCalledTimes(1);
  });
});
