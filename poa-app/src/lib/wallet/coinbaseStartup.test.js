import { describe, expect, it, vi } from 'vitest';
import { createConfig, reconnect } from '@wagmi/core';
import { deferEmptyCoinbaseProbe, hasCoinbaseSessionEvidence } from './coinbaseStartup';

const account = '0x0000000000000000000000000000000000000001';
const chain = { id: 1, name: 'Test', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['http://localhost'] } } };
const browserWithStorage = (entries = {}) => ({ localStorage: {
  length: Object.keys(entries).length,
  key: (index) => Object.keys(entries)[index],
  getItem: (key) => entries[key] ?? null,
} });

function fixture(browser = browserWithStorage(), extraFactories = []) {
  const provider = {};
  const getProvider = vi.fn(async () => provider);
  const factory = () => ({
    id: 'coinbase', type: 'coinbaseWallet', name: 'Coinbase Wallet',
    getProvider,
    async isAuthorized() { return Boolean(await this.getProvider()); },
    async connect() { await this.getProvider(); return { accounts: [account], chainId: 1 }; },
  });
  const config = createConfig({
    chains: [chain], transports: {}, storage: null, ssr: true,
    connectors: [deferEmptyCoinbaseProbe(factory, () => config.state, () => browser), ...extraFactories],
  });
  return { config, connector: config.connectors[0], getProvider, provider };
}

describe('Coinbase startup with installed wagmi reconnect', () => {
  it('settles a fresh visitor without loading the Coinbase provider', async () => {
    const { config, getProvider } = fixture();
    expect(await reconnect(config)).toEqual([]);
    expect(getProvider).not.toHaveBeenCalled();
    expect(config.state.status).toBe('disconnected');
  });

  it.each([
    { 'wagmi.recentConnectorId': '"coinbase"' },
    { 'rk-latest-id': 'coinbase' },
    { 'wagmi.store': '{"state":{"connections":[{"connector":{"type":"coinbaseWallet"}}]}}' },
    { 'cbwsdk.store': '{}' },
    { '-CBWSDK:SignerConfigurator:SignerType': 'scw' },
    { '-walletlink:https://www.walletlink.org:session': 'saved' },
  ])('restores saved session evidence %j', async (entries) => {
    const { config, getProvider } = fixture(browserWithStorage(entries));
    expect(await reconnect(config)).toHaveLength(1);
    expect(getProvider).toHaveBeenCalled();
    expect(config.state.status).toBe('connected');
  });

  it.each([
    { coinbaseWalletExtension: {} },
    { ethereum: { isCoinbaseWallet: true } },
    { ethereum: { providers: [{ isCoinbaseWallet: true }] } },
  ])('preserves injected Coinbase restoration %j', async (injected) => {
    const { config } = fixture({ ...browserWithStorage(), ...injected });
    expect(await reconnect(config)).toHaveLength(1);
  });

  it('preserves hydrated Coinbase connections even without SDK storage', async () => {
    const { config, connector } = fixture();
    config.setState((state) => ({ ...state, current: connector.uid, connections: new Map([[connector.uid, { connector, accounts: [account], chainId: 1 }]]) }));
    expect(await reconnect(config)).toHaveLength(1);
  });

  it('fails open when storage access throws', async () => {
    const browser = { get localStorage() { throw new Error('Storage disabled'); } };
    const { config } = fixture(browser);
    expect(await reconnect(config)).toHaveLength(1);
  });

  it('settles normally if a saved provider fails or times out', async () => {
    const { config, getProvider } = fixture(browserWithStorage({ 'cbwsdk.store': '{}' }));
    getProvider.mockRejectedValueOnce(new Error('Provider request timed out'));
    expect(await reconnect(config)).toEqual([]);
    expect(config.state.status).toBe('disconnected');
    // Failure did not poison the connector; later attempts still work.
    expect(await reconnect(config)).toHaveLength(1);
  });

  it('allows a manual connect while auto-restoration is in progress', async () => {
    const { config, connector, getProvider } = fixture();
    config.setState((state) => ({ ...state, status: 'connecting' }));
    expect(await connector.getProvider()).toBeUndefined();
    expect(await connector.connect()).toEqual({ accounts: [account], chainId: 1 });
    expect(getProvider).toHaveBeenCalledTimes(1);
    expect(await connector.getProvider()).toBeDefined();
  });

  it('leaves explicit provider access outside restoration unchanged', async () => {
    const { connector, getProvider } = fixture();
    await connector.getProvider();
    expect(getProvider).toHaveBeenCalledTimes(1);
  });

  it('does not wrap or change injected/EIP-6963 or Safe connectors', async () => {
    for (const type of ['injected', 'safe']) {
      const connector = { id: type, type, getProvider: vi.fn() };
      const wrapped = deferEmptyCoinbaseProbe(() => connector, () => ({ status: 'connecting' }), () => browserWithStorage());
      expect(wrapped({})).toBe(connector);
    }
    const injectedProvider = {};
    const safeProvider = {};
    const extra = [injectedProvider, safeProvider].map((provider, index) => () => ({
      id: index ? 'safe' : 'io.rabby', type: index ? 'safe' : 'injected',
      async getProvider() { return provider; },
      async isAuthorized() { return true; },
      async connect() { return { accounts: [account], chainId: 1 }; },
    }));
    const { config, getProvider } = fixture(browserWithStorage(), extra);
    expect(await reconnect(config)).toHaveLength(2);
    expect(getProvider).not.toHaveBeenCalled();
  });

  it('treats absent browser state conservatively during SSR', () => {
    expect(hasCoinbaseSessionEvidence(undefined, {})).toBe(true);
  });
});
