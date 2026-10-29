import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), pending: vi.fn() }));
vi.mock('@simplewebauthn/browser', async importOriginal => ({ ...await importOriginal(), startAuthentication: mocks.authenticate }));
vi.mock('@/services/web3/passkey/passkeyStorage', () => ({ findPendingCredentialByCredentialId: mocks.pending }));
vi.mock('@/config/networks', () => ({ getAllSubgraphUrls: () => [{ chainId: 100, url: 'https://gnosis.test' }, { chainId: 42161, url: 'https://home.test' }] }));
import { discoverPasskeyCredential } from '@/services/web3/passkey/passkeyDiscover';

const RAW = Buffer.from([1, 2, 3, 250, 251, 252]).toString('base64url');
const DIGEST = ethers.utils.keccak256(Buffer.from(RAW, 'base64url'));
const ACCOUNT = '0x1111111111111111111111111111111111111111';
const X = `0x${'22'.repeat(32)}`;
const Y = `0x${'33'.repeat(32)}`;
const row = (overrides = {}) => ({ id: 'credential-1', credentialId: DIGEST, active: true, account: { id: ACCOUNT }, publicKeyX: X, publicKeyY: Y, ...overrides });
const reply = rows => ({ ok: true, json: async () => ({ data: { passkeyCredentials: rows } }) });

beforeEach(() => {
  vi.clearAllMocks(); mocks.authenticate.mockReset();
  vi.stubGlobal('window', { location: { hostname: 'test.local' } });
  mocks.authenticate.mockResolvedValue({ rawId: RAW });
  mocks.pending.mockReturnValue(null);
});
afterEach(() => vi.unstubAllGlobals());

describe('canonical credential discovery inside the browser host', () => {
  it.each(['AbortError', 'NotAllowedError', 'SecurityError', 'NetworkError'])('never starts another picker or lookup after %s', async name => {
    vi.stubGlobal('window', { location: { hostname: 'www.poa.box' } });
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Lookup after cancelled ceremony'); }));
    const error = Object.assign(new Error('Ceremony rejected'), { name });
    mocks.authenticate.mockRejectedValueOnce(error).mockResolvedValueOnce({ rawId: RAW });
    await expect(discoverPasskeyCredential()).rejects.toBe(error);
    expect(mocks.authenticate).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled();
  });
  it('restores indexed keys and chain provenance without a credential cache', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => reply(url === 'https://gnosis.test' ? [row()] : [])));
    const found = await discoverPasskeyCredential();
    expect(found).toMatchObject({ credentialId: DIGEST, rawCredentialId: RAW, accountAddress: ACCOUNT, credentialChainId: 100, publicKeyX: X, publicKeyY: Y });
    expect(found.salt).toBe(BigInt(ethers.utils.solidityKeccak256(['bytes32', 'string'], [DIGEST, 'poa-salt-v1'])).toString());
    const request = JSON.parse(fetch.mock.calls[0][1].body);
    expect(request.variables).toEqual({ credentialId: DIGEST, cursor: '', first: 100 });
    expect(request.query).toContain('CredentialDiscoveryPage');
    expect(mocks.authenticate).toHaveBeenCalledWith(expect.objectContaining({ optionsJSON: expect.objectContaining({ userVerification: 'required', allowCredentials: [] }) }));
  });

  it('uses only the exact missing-key fallback and keeps unindexed keys unknown', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, request) => {
      if (url === 'https://home.test') return reply([]);
      const query = JSON.parse(request.body).query;
      if (query.includes('publicKeyX')) return { ok: true, json: async () => ({ errors: [{ message: 'Cannot query field "publicKeyX" on type "PasskeyCredential".' }] }) };
      return reply([row({ publicKeyX: undefined, publicKeyY: undefined })]);
    }));
    const found = await discoverPasskeyCredential();
    expect(found.accountAddress).toBe(ACCOUNT);
    expect(found).not.toHaveProperty('publicKeyX');
    expect(found).not.toHaveProperty('publicKeyY');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('continues beyond a full page of revoked credentials and never restores a revoked key', async () => {
    const oldRows = Array.from({ length: 100 }, (_, i) => row({ id: `row${String(i).padStart(4, '0')}`, active: false }));
    vi.stubGlobal('fetch', vi.fn(async (url, request) => {
      if (url === 'https://home.test') return reply([]);
      return reply(JSON.parse(request.body).variables.cursor ? [row({ id: 'row0100' })] : oldRows);
    }));
    expect((await discoverPasskeyCredential()).accountAddress).toBe(ACCOUNT);
    expect(fetch.mock.calls.some(([, request]) => JSON.parse(request.body).variables.cursor === 'row0099')).toBe(true);
  });

  it.each(['http', 'graphql', 'malformed', 'partial'])('keeps %s lookup failure distinct from an absent account', async mode => {
    vi.stubGlobal('fetch', vi.fn(async url => {
      if (mode === 'partial' && url === 'https://home.test') return reply([]);
      if (mode === 'http') return { ok: false };
      if (mode === 'graphql') return { ok: true, json: async () => ({ errors: [{ message: 'endpoint failed' }] }) };
      if (mode === 'malformed') return reply([row({ credentialId: `0x${'99'.repeat(32)}` })]);
      throw new Error('Network unavailable');
    }));
    await expect(discoverPasskeyCredential()).rejects.toThrow('We couldn’t check this passkey’s account');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('preserves known pending credential keys during an endpoint outage', async () => {
    mocks.pending.mockReturnValue({ accountAddress: ACCOUNT, publicKeyX: X, publicKeyY: Y });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Network unavailable'); }));
    expect(await discoverPasskeyCredential()).toMatchObject({ accountAddress: ACCOUNT, publicKeyX: X, publicKeyY: Y });
    expect(mocks.pending).toHaveBeenCalledWith(DIGEST);
  });

  it('reports no account only after complete empty/revoked results on both sources', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply([row({ active: false })])));
    await expect(discoverPasskeyCredential()).rejects.toThrow('No account found for this passkey');
  });
});
