import { afterEach, describe, expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import { organizationPrefetchScript, ORGANIZATION_PREFETCH_KEY } from '@/lib/graphql/organizationPrefetch';
import { fetchOrgByName, lookupOrganization } from '@/util/orgLookup';

const sources = [{ chainId: 42161, url: 'https://a.example/graphql' }, { chainId: 100, url: 'https://b.example/graphql' }];
const query = 'query FindOrgSnapshot($name: String!) { organizations(where: {name: $name}) { id name } }';
const config = { sources, query, variables: {}, hosts: { 'poa.earth': 'Test6' }, aliases: { kubi: 'Kansas Blockchain' } };
const authority = { id: '0x' + '1'.repeat(40), isRouterBound: true, cutoverAt: '1750000000' };
const reply = (org, overrides = {}) => ({ ok: true, status: 200, json: async () => ({ data: { organizations: org ? [{ membershipAuthority: authority, ...org }] : [] } }), ...overrides });
function boot(search = '?org=Test6', overrides = {}) {
  const window = { location: { search, hostname: 'localhost' } };
  runInNewContext(organizationPrefetchScript({ ...config, ...overrides }), {
    window, URLSearchParams, AbortController, Date, Map, fetch, setTimeout, clearTimeout,
  });
  vi.stubGlobal('window', window);
  return window;
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('initial HTML organization prefetch', () => {
  it('starts both public requests before React and reuses them with normal chain precedence', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (url) => reply(url === sources[1].url ? { id: 'b', name: 'Test6' } : null)));
    boot();
    expect(fetch).toHaveBeenCalledTimes(2);
    const result = await lookupOrganization({ name: 'Test6', sources, cache: null,
      fetchSource: (source, name, options) => fetchOrgByName(source, name, { ...options, query }),
    });
    expect(result.org).toMatchObject({ id: 'b', chainId: 100 });
    expect(fetch).toHaveBeenCalledTimes(2);
    // Claimed responses never become a persistent stale cache.
    await fetchOrgByName(sources[1], 'Test6', { query });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('keeps org, endpoint and query variables isolated', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => reply(null)));
    boot();
    await fetchOrgByName(sources[0], 'Different', { query });
    await fetchOrgByName(sources[0], 'Test6', { query, variables: { first: 1 } });
    await fetchOrgByName({ url: 'https://other.example' }, 'Test6', { query });
    expect(fetch).toHaveBeenCalledTimes(5);
  });
  it('retains normal GraphQL error and older-schema fallback evidence', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => reply(null, { ok: false, status: 400,
      json: async () => ({ errors: [{ message: 'Cannot query field releases' }] }),
    })));
    boot();
    await expect(fetchOrgByName(sources[0], 'Test6', { query })).rejects.toMatchObject({ name: 'GraphQLResponseError', isSchemaError: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('uses only the pinned chain and leaves ID validation to normal lookup', async () => {
    vi.useFakeTimers();
    const id = `0x${'a'.repeat(64)}`;
    vi.stubGlobal('fetch', vi.fn(async () => reply({ id: 'wrong', name: 'Test6' })));
    boot(`?org=Test6&orgId=${id}&chainId=100`);
    expect(fetch).toHaveBeenCalledTimes(1);
    const result = await lookupOrganization({ name: 'Test6', sources, pinnedOrg: { id, chainId: 100 },
      fetchSource: (source, name, options) => fetchOrgByName(source, name, { ...options, query }),
    });
    expect(result.org).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('uses canonical, legacy, alias and host selection without executing injected markup', () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => reply(null)));
    boot('?org=KUBI&userDAO=Ignored');
    expect(JSON.parse(fetch.mock.calls[0][1].body).variables.name).toBe('Kansas Blockchain');
    boot('?userDAO=Legacy');
    expect(JSON.parse(fetch.mock.calls[2][1].body).variables.name).toBe('Legacy');
    boot('', { hosts: { localhost: 'Test6' } });
    expect(JSON.parse(fetch.mock.calls[4][1].body).variables.name).toBe('Test6');
    const unsafe = '</script><script>alert(1)</script>';
    const script = organizationPrefetchScript({ ...config, hosts: { localhost: unsafe } });
    expect(script).not.toContain('</script>');
    boot('', { hosts: { localhost: unsafe } });
    expect(JSON.parse(fetch.mock.calls[6][1].body).variables.name).toBe(unsafe);
  });
  it('skips unknown names, new organizations and ambiguous duplicate query keys', () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn());
    boot('');
    boot('?org=Test6&newOrg=true');
    boot('?org=Test6&org=Different');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('cleans up expired responses and falls back after a speculative transport failure', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const window = boot();
    await vi.advanceTimersByTimeAsync(1);
    fetch.mockImplementation(async () => reply(null));
    await expect(fetchOrgByName(sources[0], 'Test6', { query })).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(30000);
    expect(window[ORGANIZATION_PREFETCH_KEY]).toBeUndefined();
  });
  it('falls back immediately when a claimed speculative transport fails', async () => {
    vi.useFakeTimers();
    let rejectEarly;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((_, reject) => { rejectEarly = reject; })));
    boot('?org=Test6&orgId=0x' + 'a'.repeat(64) + '&chainId=100');
    const pending = fetchOrgByName(sources[1], 'Test6', { query });
    fetch.mockImplementation(async () => reply({ id: 'b', name: 'Test6' }));
    rejectEarly(new Error('interrupted'));
    await expect(pending).resolves.toMatchObject({ id: 'b' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('caller cancellation aborts a claimed inflight request', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    boot();
    const controller = new AbortController();
    const pending = fetchOrgByName(sources[0], 'Test6', { query, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
