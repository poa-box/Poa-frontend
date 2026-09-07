import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryCache } from '@apollo/client';
import { parse } from 'graphql';
import { fetchOrganizationSnapshot, seedOrganizationSnapshot } from './orgSnapshot';
import { CAPABILITY, peekCapability } from './subgraphCapabilities';
import { getClient } from './apolloClient';

vi.mock('./apolloClient', () => ({ getClient: vi.fn() }));

const response = (json) => ({ ok: true, json: async () => json });
const schemaError = () => response({ errors: [{ message: 'Cannot query field on this schema' }] });
// A valid organization with absent optional contracts: every selected field is
// present, so cache completeness tests projection rather than a partial fixture.
function organizationFor(query) {
  const selection = parse(query).definitions[0].selectionSet.selections[0].selectionSet;
  return Object.fromEntries(selection.selections.map(field => {
    const key = field.alias?.value || field.name.value;
    const value = field.name.value === 'id' ? '0x1234'
      : field.name.value === 'name' ? 'Test6'
      : field.name.value === '__typename' ? 'Organization' : null;
    return [key, value];
  }));
}
const success = (_url, options) => response({ data: { organizations: [organizationFor(JSON.parse(options.body).query)] } });

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('organization snapshot transport and cache', () => {
  it('fetches rich data once and seeds complete original queries only on the winning endpoint', async () => {
    const source = { url: 'https://snapshot-rich.example', chainId: 100 };
    const fetch = vi.fn(async (...args) => success(...args));vi.stubGlobal('fetch', fetch);
    const org = await fetchOrganizationSnapshot(source, 'Test6', { treasury: true });
    const cache = new InMemoryCache();getClient.mockReturnValue({ cache });
    expect(seedOrganizationSnapshot(source.url, org)).toBe(true);
    expect(getClient).toHaveBeenCalledExactlyOnceWith(source.url);
    expect(org.snapshot).toHaveLength(4);
    for (const entry of org.snapshot) {
      expect(cache.diff({ query: entry.query, variables: entry.variables }).complete).toBe(true);
      expect(cache.readQuery({ query: entry.query, variables: entry.variables })).toEqual(entry.data);
    }
    expect(peekCapability(source.url, CAPABILITY.TASK_RELEASES)).toBe(true);
    expect(peekCapability(source.url, CAPABILITY.PROPOSAL_PROPOSER)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to the base snapshot on a schema error without falsely confirming rich capabilities', async () => {
    const source = { url: 'https://snapshot-base.example' };
    const fetch = vi.fn().mockResolvedValueOnce(schemaError()).mockImplementationOnce(async (...args) => success(...args));
    vi.stubGlobal('fetch', fetch);
    const org = await fetchOrganizationSnapshot(source, 'Test6');
    expect(org.snapshot).toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[0][1].body).query).toContain('releaseCount');
    expect(JSON.parse(fetch.mock.calls[1][1].body).query).not.toContain('releaseCount');
    expect(peekCapability(source.url, CAPABILITY.TASK_RELEASES)).toBeUndefined();
  });

  it('retains minimal identity lookup when both domain snapshots are unsupported', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(schemaError()).mockResolvedValueOnce(schemaError())
      .mockResolvedValueOnce(response({ data: { organizations: [{ id: '0x1234', name: 'Test6' }] } }));
    vi.stubGlobal('fetch', fetch);
    await expect(fetchOrganizationSnapshot({ url: 'https://snapshot-minimal.example' }, 'Test6'))
      .resolves.toEqual({ id: '0x1234', name: 'Test6' });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetch.mock.calls[2][1].body).query).toContain('query FindOrg(');
    expect(getClient).not.toHaveBeenCalled();
  });

  it('does not multiply requests on a network failure', async () => {
    const error = new TypeError('Failed to fetch');
    const fetch = vi.fn().mockRejectedValue(error);vi.stubGlobal('fetch', fetch);
    await expect(fetchOrganizationSnapshot({ url: 'https://snapshot-offline.example' }, 'Test6')).rejects.toBe(error);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('cancels stalled response parsing without falling back or recording support', async () => {
    const source = { url: 'https://snapshot-cancel.example' };
    let started;
    const parsing = new Promise(resolve => { started = resolve; });
    const fetch = vi.fn(async () => ({ ok: true, json: () => { started();return new Promise(() => {}); } }));
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    const pending = fetchOrganizationSnapshot(source, 'Test6', { signal: controller.signal });
    await parsing;controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(peekCapability(source.url, CAPABILITY.TASK_RELEASES)).toBeUndefined();
    expect(getClient).not.toHaveBeenCalled();
  });
});
