import { describe, expect, it, vi } from 'vitest';
import { createTaskMetadataStore } from '@/lib/tasks/metadataBase';
import { editTaskMetadata } from '@/lib/tasks/metadata';
import { remainingTaskLockDelay, assertTaskHostScope } from '@/lib/tasks/hostScope';

const TM = `0x${'12'.repeat(20)}`;
const PID = `${TM}-0x${'01'.repeat(32)}`;
const HASH = `0x${'ab'.repeat(32)}`;
const SUB = `0x${'cd'.repeat(32)}`;
const scope = { chainId: 100, orgId: `0x${'00'.repeat(32)}`, contract: TM, endpoint: 'https://example.test/gnosis',
  account: `0x${'34'.repeat(20)}`, hydrated: true, projectId: PID };
const task = { id: `${TM}-9007199254740993`, projectId: PID, metadataHash: HASH };
const base = { name: 'Shared work', description: 'Care', location: 'Remote', difficulty: 'hard', estHours: '0.25',
  submission: 'Saved work', dueDate: 2100000000, attachments: [{ name: 'Notes' }], extension: { falseValue: false, zero: 0 } };
function options(extra = {}) { return { scope, task, currentScope: () => scope, currentTask: () => task,
  fetchFromIpfs: vi.fn().mockResolvedValue(base), ...extra }; }

describe('verified metadata editing at the host boundary', () => {
  it('keeps the complete verified base, saved submission, extensions and explicit clears', async () => {
    const opts = options();
    const store = createTaskMetadataStore();
    const loaded = await store.load(opts);
    expect(editTaskMetadata({ baseMetadata: loaded, name: 'Updated', dueDate: null })).toEqual({
      ...Object.fromEntries(Object.entries(base).filter(([key]) => key !== 'dueDate')), name: 'Updated' });
    loaded.extension.zero = 42;
    expect((await store.load(opts)).extension.zero).toBe(0);
    expect(opts.fetchFromIpfs).toHaveBeenCalledTimes(1);
  });
  it('retains full submission-document extensions without overwriting the edited task fields', async () => {
    const withSubmission = { ...task, submissionHash: SUB };
    const opts = options({ task: withSubmission, currentTask: () => withSubmission,
      fetchFromIpfs: vi.fn().mockResolvedValueOnce(base).mockResolvedValueOnce({ ...base, name: 'Old title',
        submission: 'Reviewed work', links: ['https://example.test/proof'] }) });
    expect(await createTaskMetadataStore().load(opts)).toMatchObject({ name: base.name, submission: 'Reviewed work',
      links: ['https://example.test/proof'], extension: base.extension });
    expect(opts.fetchFromIpfs.mock.calls).toEqual([[HASH], [SUB]]);
  });
  it.each([null, {}, { name: 'Indexed partial data', description: 'Missing saved work' }])('rejects an unavailable/partial document before a merge: %s', async value => {
    await expect(createTaskMetadataStore().load(options({ fetchFromIpfs: async () => value }))).rejects.toThrow(/saved task details/);
  });
  it.each(['orgId', 'chainId', 'account', 'endpoint', 'contract', 'projectId', 'hydrated'])('rejects %s switching while storage is loading', async key => {
    let current = scope;
    const opts = options({ currentScope: () => current, fetchFromIpfs: async () => {
      current = { ...scope, [key]: key === 'hydrated' ? false : key === 'chainId' ? 42161 : 'changed' };
      return base;
    } });
    await expect(createTaskMetadataStore().load(opts)).rejects.toThrow(/changed/);
  });
  it('rejects a stale pointer and retries a failed read instead of caching a blank document', async () => {
    let currentTask = task;
    const fetchFromIpfs = vi.fn().mockImplementationOnce(async () => {
      currentTask = { ...task, metadataHash: SUB };
      return base;
    }).mockResolvedValue(base);
    const store = createTaskMetadataStore();
    await expect(store.load(options({ currentTask: () => currentTask, fetchFromIpfs }))).rejects.toThrow(/changed/);
    currentTask = task;
    expect(await store.load(options({ currentTask: () => currentTask, fetchFromIpfs }))).toEqual(base);
    expect(fetchFromIpfs).toHaveBeenCalledTimes(2);
  });
  it('refuses foreign task scope and unresolved identities before fetching', async () => {
    const opts = options({ scope: { ...scope, hydrated: false }, currentScope: () => ({ ...scope, hydrated: false }) });
    await expect(createTaskMetadataStore().load(opts)).rejects.toThrow();
    expect(opts.fetchFromIpfs).not.toHaveBeenCalled();
    expect(() => assertTaskHostScope(scope, { ...scope, account: null })).toThrow(/changed/);
  });
  it('keeps the full 65-second optimistic grace period, including slow confirmations', () => {
    expect(remainingTaskLockDelay(100000, 111000)).toBe(54000);
    expect(remainingTaskLockDelay(100000, 150000)).toBe(15000);
    expect(remainingTaskLockDelay(100000, 170000)).toBe(0);
  });
});
