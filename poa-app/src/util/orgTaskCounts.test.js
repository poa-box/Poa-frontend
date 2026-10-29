import { describe, expect, it, vi } from 'vitest';
import { fetchOrgTaskCounts } from '@/util/orgTaskCounts';

const respond = tasks => ({ ok: true, json: async () => ({ data: { tasks } }) });

describe('fetchOrgTaskCounts', () => {
  it('separates open from total tasks and keeps counts per manager', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respond([
      { id: 'a-1', taskManager: 'a', status: 'Open' },
      { id: 'a-2', taskManager: 'a', status: 'Assigned' },
      { id: 'a-3', taskManager: 'a', status: 'Submitted' },
      { id: 'a-4', taskManager: 'a', status: 'Completed' },
      { id: 'b-1', taskManager: 'b', status: 'Open' },
    ]));

    await expect(fetchOrgTaskCounts('/registry', ['a', 'b', 'empty'], fetchImpl, { chainId: 100 })).resolves.toEqual({
      a: { open: 1, total: 4 },
      b: { open: 1, total: 1 },
      empty: { open: 0, total: 0 },
    });
  });

  it('counts beyond the first thousand tasks using the last ID as its cursor', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      id: `a-${String(index).padStart(4, '0')}`, taskManager: 'a', status: 'Completed',
    }));
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(respond(firstPage))
      .mockResolvedValueOnce(respond([{ id: 'a-1000', taskManager: 'a', status: 'Open' }]));

    await expect(fetchOrgTaskCounts('/registry', ['a'], fetchImpl, { chainId: 100 })).resolves.toEqual({
      a: { open: 1, total: 1001 },
    });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).variables).toEqual({ taskManagers: ['a'], cursor: 'a-0999', first: 1000 });
  });

  it('does not turn request failures or partial responses into zero counts', async () => {
    for (const response of [
      { ok: false },
      { ok: true, json: async () => ({ errors: [{ message: 'Unavailable' }], data: { tasks: [] } }) },
      { ok: true, json: async () => ({ data: {} }) },
    ]) {
      await expect(fetchOrgTaskCounts('/registry', ['a'], vi.fn().mockResolvedValue(response), { chainId: 100 }))
        .rejects.toThrow('public data is unavailable');
    }
  });

  it('rejects partial totals when a later page fails', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(respond(Array.from({ length: 1000 }, (_, index) => ({
        id: `a-${String(index).padStart(4, '0')}`, taskManager: 'a', status: 'Open',
      }))))
      .mockRejectedValueOnce(new Error('Connection lost'));
    await expect(fetchOrgTaskCounts('/registry', ['a'], fetchImpl, { chainId: 100 })).rejects.toThrow('public data is unavailable');
  });

  it('does not request tasks when there are no managers', async () => {
    const fetchImpl = vi.fn();
    await expect(fetchOrgTaskCounts('/registry', [], fetchImpl, { chainId: 100 })).resolves.toEqual({});
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('directory-qualified task counts', () => {
  const manager = '0x' + '1'.repeat(40);
  const orgId = '0x' + 'a'.repeat(64);
  const endpoint = 'https://counts.invalid/graphql';
  const source = { chainId: 100, endpoint, method: 'graph', indexed: true, snapshot: 'latest' };
  const directory = {
    source, coverage: { status: 'complete', receivedKeys: [orgId], missingIds: [], failedIds: [], issues: [] },
    data: [{ id: orgId, membershipAuthority: { id: manager, isRouterBound: true, cutoverAt: '1' },
      taskManager: { id: manager, organization: { id: orgId } }, source: { ...source, orgId } }],
  };
  const row = (status, organization = orgId) => ({ id: `${manager}-${status}`, status, taskManager: manager,
    project: { id: manager + '-project', deleted: false, taskManager: { id: manager, organization: { id: organization } } } });
  it('uses the complete core module/org projection while preserving the host visible-status count policy', async () => {
    const fetch = vi.fn().mockResolvedValue(respond([row('Assigned'), row('Cancelled'), row('Completed'), row('Open')]));
    await expect(fetchOrgTaskCounts(endpoint, [manager], fetch, { chainId: 100, directory })).resolves.toEqual({ [manager]: { open: 1, total: 3 } });
    expect(JSON.parse(fetch.mock.calls[0][1].body).variables.taskManagers).toEqual([manager]);
  });
  it('rejects a wrong organization binding and incomplete directory instead of returning plausible totals', async () => {
    await expect(fetchOrgTaskCounts(endpoint, [manager], vi.fn().mockResolvedValue(respond([row('Open', '0x' + 'b'.repeat(64))])), { chainId: 100, directory }))
      .rejects.toMatchObject({ name: 'PublicDataUnavailable' });
    const fetch = vi.fn();
    await expect(fetchOrgTaskCounts(endpoint, [manager], fetch, { chainId: 100, directory: { ...directory, coverage: { ...directory.coverage, status: 'incomplete' } } }))
      .rejects.toMatchObject({ name: 'PublicDataUnavailable' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
