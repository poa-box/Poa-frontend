import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { print } from 'graphql';
const fixture = vi.hoisted(() => ({ slots: [], cursor: 0, effects: [] }));
vi.mock('react', async original => {
  const actual = await original();
  const memo = (fn, deps) => {
    const index = fixture.cursor++, previous = fixture.slots[index];
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) fixture.slots[index] = { deps, value: fn() };
    return fixture.slots[index].value;
  };
  return { ...actual,
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
    useRef: initial => { const index = fixture.cursor++; return fixture.slots[index] ||= { current: initial }; },
    useState: initial => { const index = fixture.cursor++; fixture.slots[index] ||= { value: initial };
      return [fixture.slots[index].value, next => { fixture.slots[index].value = typeof next === 'function' ? next(fixture.slots[index].value) : next; }]; },
    useEffect: (fn, deps) => { const index = fixture.cursor++, previous = fixture.slots[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) fixture.effects.push(() => {
        previous?.cleanup?.(); fixture.slots[index] = { deps, cleanup: fn() };
      }); },
  };
});
import { useBoardProjectReads } from '@/hooks/useBoardProjectReads';
const TM = `0x${'12'.repeat(20)}`, ORG = `0x${'ab'.repeat(32)}`, HASH = `0x${'cd'.repeat(32)}`;
function client() {
  return { query: vi.fn(async ({ query }) => ({ data: { _meta: { block: { number: 123, hash: HASH } },
    organization: { id: ORG, taskManager: { id: TM, organization: { id: ORG } } },
    [print(query).includes('query TasksPage') ? 'tasks' : print(query).includes('query ProjectManagersPage') ? 'projectManagers' : 'projects']: [],
  } })) };
}
let options;
function BoardReadHarness(next, effects = true) {
  if (next) options = { ...options, ...next };
  fixture.cursor = 0;
  const result = useBoardProjectReads(options);
  if (effects) for (const effect of fixture.effects.splice(0)) effect();
  return result;
}
function cleanup() { for (const slot of fixture.slots) slot?.cleanup?.(); }
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };
async function ready() { BoardReadHarness(); await vi.waitFor(() => expect(BoardReadHarness().loading).toBe(false)); return BoardReadHarness(); }
beforeEach(() => {
  fixture.slots = []; fixture.cursor = 0; fixture.effects = [];
  options = { client: client(), source: { chainId: 100, orgId: ORG, contract: TM, endpoint: 'https://board.invalid',
    indexed: true, snapshot: 'latest', method: 'board' }, releasesSupported: true, isActive: false };
  vi.stubGlobal('fetch', () => { throw new Error('Unexpected network'); });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('actual complete board reader hook lifecycle', () => {
  it('returns usable continuation evidence only for a complete current refresh and preserves explicit errors', async () => {
    const known = await ready();
    expect(known.result.source.block).toEqual({ number: '123', hash: HASH });
    expect(known.managers.source.block).toEqual(known.result.source.block);
    const refreshed = await known.refetch({ minimumBlock: '123' });
    expect(refreshed.coverage.status).toBe('complete');
    expect(await known.refetch({ minimumBlock: '124' })).toBeNull();
    const failed = BoardReadHarness();
    expect(failed.loading).toBe(false); expect(failed.error).toBeInstanceOf(Error);
    expect(failed.result).toBe(refreshed); expect(failed.managers).toBeUndefined();
    options.client.query.mockRejectedValue(new Error('Mock outage'));
    expect(await failed.refetch()).toBeNull();
    expect(BoardReadHarness().result).toBe(refreshed);
  });
  it('masks the previous scope immediately, rejects late results and disables saved retries after unmount', async () => {
    const old = deferred();
    const firstClient = options.client;
    const saved = BoardReadHarness().refetch;
    await vi.waitFor(() => expect(BoardReadHarness().loading).toBe(false));
    firstClient.query.mockImplementationOnce(() => old.promise);
    const late = saved();
    const nextClient = client();
    const switched = BoardReadHarness({ source: { ...options.source, endpoint: 'https://next-board.invalid' }, client: nextClient }, false);
    expect(switched.result).toBeUndefined();
    BoardReadHarness(); await vi.waitFor(() => expect(BoardReadHarness().loading).toBe(false));
    old.resolve({ data: { _meta: { block: { number: 123, hash: HASH } } } });
    expect(await late).toBeNull();
    const count = firstClient.query.mock.calls.length;
    expect(await saved()).toBeNull(); expect(firstClient.query).toHaveBeenCalledTimes(count);
    const retry = BoardReadHarness().refetch;
    cleanup(); nextClient.query.mockClear();
    expect(await retry()).toBeNull(); expect(nextClient.query).not.toHaveBeenCalled();
  });
  it('keeps the 40-second active polling lifecycle and does no idle reads', async () => {
    await ready(); vi.useFakeTimers(); options.client.query.mockClear();
    await vi.advanceTimersByTimeAsync(120000); expect(options.client.query).not.toHaveBeenCalled();
    BoardReadHarness({ isActive: true });
    await vi.advanceTimersByTimeAsync(40000); expect(options.client.query).toHaveBeenCalledTimes(4);
    BoardReadHarness({ isActive: false }); options.client.query.mockClear();
    await vi.advanceTimersByTimeAsync(120000); expect(options.client.query).not.toHaveBeenCalled();
  });
});
