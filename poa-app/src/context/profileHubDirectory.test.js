import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadProfileHubDirectory, profileHubOrganization } from '@/context/profileHubDirectory';
import * as directory from '@/util/orgDirectory';

const manager = '0x' + '1'.repeat(40), orgId = '0x' + 'a'.repeat(64);
const networks = [{ chainId: 100, subgraphUrl: 'https://one.invalid', name: 'One' }, { chainId: 42161, subgraphUrl: 'https://two.invalid', name: 'Two' }];
const organization = { id: orgId, name: 'Community', deployedAt: '1', metadataHash: null, metadata: null, participationToken: null, users: Array(1000).fill({ id: 'historical' }),
  membershipAuthority: { id: manager, isRouterBound: true, cutoverAt: '1' },
  taskManager: { id: manager, organization: { id: orgId } } };
const task = (status, id = orgId) => ({ id: `${manager}-${status}`, status, taskManager: manager,
  project: { id: manager + '-project', deleted: false, taskManager: { id: manager, organization: { id } } } });
const response = data => ({ ok: true, json: async () => ({ data }) });
let fetcher;
beforeEach(() => {
  fetcher = vi.fn(async (_url, options) => {
    const { query } = JSON.parse(options.body);
    return response(/organizations\s*\(/.test(query) ? { organizations: [organization] } : { tasks: [task('Completed'), task('Open')] });
  });
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function load(options = {}) {
  const onDirectory = vi.fn(), onCounts = vi.fn();
  await loadProfileHubDirectory(networks, { onDirectory, onCounts, ...options });
  return { onDirectory, onCounts };
}
describe('profile directory consumer with actual core directory and count readers', () => {
  it('preserves endpoint snapshots before copying arrays, scopes identical manager IDs per chain and keeps old completed work', async () => {
    const result = await load();
    expect(result.onDirectory.mock.calls[0][0]).toHaveLength(2);
    expect(result.onCounts.mock.calls.map(([counts]) => counts)).toEqual([
      { [`100:${manager}`]: { open: 1, total: 2 } }, { [`42161:${manager}`]: { open: 1, total: 2 } },
    ]);
    const card = profileHubOrganization(result.onDirectory.mock.calls[0][0][0], result.onCounts.mock.calls[0][0]);
    expect(card.totalMembers).toBeNull();
    expect(card.taskCounts).toEqual({ open: 1, total: 2 });
    // Source binding requires project/org fields; a manager-only compatibility
    // request would omit this evidence and accept the negative cases below.
    const tasks = fetcher.mock.calls.map(([, options]) => JSON.parse(options.body)).filter(({ query }) => /tasks\s*\(/.test(query));
    expect(tasks).toHaveLength(2);
    expect(tasks.every(({ query }) => query.includes('organization'))).toBe(true);
  });
  it.each(['chain', 'endpoint', 'incomplete'])('fails closed for a %s-mismatched directory snapshot', async mismatch => {
    const original = directory.fetchSupportedOrganizations;
    vi.spyOn(directory, 'fetchSupportedOrganizations').mockImplementation(async (...args) => {
      const rows = await original(...args), snapshot = rows.snapshot;
      const wrong = mismatch === 'incomplete' ? { ...snapshot, coverage: { ...snapshot.coverage, status: 'incomplete' } }
        : { ...snapshot, source: { ...snapshot.source, [mismatch === 'chain' ? 'chainId' : 'endpoint']: mismatch === 'chain' ? 999 : 'https://wrong.invalid' } };
      return Object.defineProperty([...rows], 'snapshot', { value: wrong });
    });
    const { onCounts } = await load();
    expect(onCounts.mock.calls.flatMap(([counts]) => Object.values(counts))).toEqual([null, null]);
  });
  it('rejects task rows bound to another organization instead of publishing plausible counts', async () => {
    fetcher.mockImplementation(async (_url, options) => response(/organizations\s*\(/.test(JSON.parse(options.body).query)
      ? { organizations: [organization] } : { tasks: [task('Open', '0x' + 'b'.repeat(64))] }));
    expect((await load()).onCounts.mock.calls.flatMap(([counts]) => Object.values(counts))).toEqual([null, null]);
  });
  it('preserves known directory cards through partial and total outage without manufacturing zero counts', async () => {
    const first = await load(), previous = first.onDirectory.mock.calls[0][0];
    const working = fetcher.getMockImplementation();
    fetcher.mockImplementation((url, options) => url === networks[1].subgraphUrl ? Promise.reject(new Error('offline')) : working(url, options));
    const partial = await load({ previous });
    expect(partial.onDirectory.mock.calls[0]).toEqual([previous, [42161]]);
    expect(partial.onCounts.mock.calls.flatMap(([counts]) => Object.values(counts))).toContain(null);
    fetcher.mockRejectedValue(new Error('offline'));
    const outage = await load({ previous });
    expect(outage.onDirectory.mock.calls[0]).toEqual([previous, [100, 42161]]);
    expect(outage.onCounts.mock.calls.flatMap(([counts]) => Object.values(counts))).toEqual([null, null]);
  });
  it('distinguishes an enumerated zero from unavailable counts and ignores stale completions', async () => {
    fetcher.mockImplementation(async (_url, options) => response(/organizations\s*\(/.test(JSON.parse(options.body).query) ? { organizations: [organization] } : { tasks: [] }));
    expect((await load()).onCounts.mock.calls[0][0]).toEqual({ [`100:${manager}`]: { open: 0, total: 0 } });
    const onDirectory = vi.fn(), onCounts = vi.fn(); let current = true;
    await loadProfileHubDirectory(networks, { isCurrent: () => current, onDirectory: (...args) => { onDirectory(...args); current = false; }, onCounts });
    expect(onDirectory).toHaveBeenCalledOnce(); expect(onCounts).not.toHaveBeenCalled();
  });
});
