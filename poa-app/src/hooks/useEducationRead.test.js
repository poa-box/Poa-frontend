import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { useEducationRead } from '@/hooks/useEducationRead';

const ORG = `0x${'ab'.repeat(32)}`, HUB = `0x${'12'.repeat(20)}`, ACCOUNT = `0x${'34'.repeat(20)}`;
const OTHER = `0x${'56'.repeat(20)}`, HASH = `0x${'cd'.repeat(32)}`;
const proof = { block: { number: 123, hash: HASH, timestamp: 2000 } };
const moduleRow = { id: `${HUB}-9007199254740993`, moduleId: '9007199254740993', title: 'Historic learning', contentHash: HASH,
  payout: '1', status: 'Removed', educationHub: { id: HUB, organization: { id: ORG } },
  metadata: { description: 'Together', quiz: ['How?'], answersJson: '[["With care"]]' } };
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; }
let options;
function EducationReadHarness(next, effects = true) {
  if (next) options = { ...options, ...next };
  fixture.cursor = 0;
  const result = useEducationRead(options);
  if (effects) for (const effect of fixture.effects.splice(0)) effect();
  return result;
}
function cleanup() { for (const slot of fixture.slots) slot?.cleanup?.(); }
async function ready() { EducationReadHarness(); await vi.waitFor(() => expect(EducationReadHarness().loading).toBe(false)); return EducationReadHarness(); }
beforeEach(() => {
  fixture.slots = []; fixture.cursor = 0; fixture.effects = [];
  options = { chainId: 100, endpoint: 'https://education.invalid/graphql', orgId: ORG, hub: HUB, kind: 'modules',
    enabled: true, safeFetchFromIpfs: vi.fn(),
    client: { query: vi.fn(async () => ({ data: { _meta: proof, educationModules: [moduleRow] } })) } };
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('education complete-read host lifecycle with actual core and mocked Apollo network', () => {
  it('keeps a known library through unavailable and partial retries and recovers a proven empty result', async () => {
    const loaded = await ready(); expect(loaded.complete).toBe(true); expect(loaded.data[0].payoutRaw).toBe('1');
    options.client.query.mockRejectedValue(new Error('Outage'));
    await loaded.refetch();
    const failed = EducationReadHarness();
    expect(failed).toMatchObject({ complete: false, hasKnownData: true, loading: false, coverage: { status: 'unavailable' } });
    expect(failed.error).toMatch(/try again/); expect(failed.data).toBe(loaded.data);
    options.client.query.mockImplementation(async ({ variables }) => ({ data: variables.block ? { _meta: proof } : { _meta: proof, educationModules: [] } }));
    await failed.refetch();
    expect(EducationReadHarness().complete).toBe(false); expect(EducationReadHarness().data).toBe(loaded.data);
    options.client.query.mockImplementation(async () => ({ data: { _meta: proof, educationModules: [] } }));
    await EducationReadHarness().refetch();
    expect(EducationReadHarness()).toMatchObject({ complete: true, hasKnownData: true, error: null, data: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('distinguishes first-load outage from a confirmed empty library', async () => {
    options.client.query.mockRejectedValue(new Error('Outage'));
    const failed = await ready();
    expect(failed).toMatchObject({ complete: false, hasKnownData: false, data: [], coverage: { status: 'unavailable' } });
    options.client.query.mockImplementation(async () => ({ data: { _meta: proof, educationModules: [] } }));
    await failed.refetch();
    expect(EducationReadHarness()).toMatchObject({ complete: true, hasKnownData: true, data: [], error: null });
  });

  it('keeps the known library if a same-endpoint host client replacement fails', async () => {
    const loaded = await ready();
    EducationReadHarness({ client: { query: vi.fn().mockRejectedValue(new Error('Outage')) } });
    expect(EducationReadHarness().data).toBe(loaded.data);
    await vi.waitFor(() => expect(EducationReadHarness().loading).toBe(false));
    expect(EducationReadHarness()).toMatchObject({ complete: false, hasKnownData: true });
    expect(EducationReadHarness().data).toBe(loaded.data);
  });

  it('publishes indexed rows before slow content and then retains the verified full fallback metadata', async () => {
    const content = deferred();
    options.client.query.mockImplementation(async () => ({ data: { _meta: proof, educationModules: [{ ...moduleRow, metadata: null }] } }));
    options.safeFetchFromIpfs.mockReturnValue(content.promise);
    const indexed = await ready();
    expect(indexed.data[0]).toMatchObject({ id: moduleRow.id, payoutRaw: '1', contentLoading: true });
    expect(indexed.complete).toBe(true);
    const metadata = { description: 'Verified full lesson', quiz: ['How?'], answers: [['With care']], extension: { preserved: true } };
    content.resolve(metadata);
    await vi.waitFor(() => expect(EducationReadHarness().data[0].metadata).toBe(metadata));
    expect(EducationReadHarness().data[0]).toMatchObject({ contentLoading: false, contentUnavailable: false, question: 'How?',
      answers: [{ index: 0, answer: 'With care' }] });
  });

  it.each([
    { orgId: `0x${'ef'.repeat(32)}` }, { endpoint: 'https://other.invalid/graphql' },
    { chainId: 42161 }, { hub: OTHER },
  ])('masks the previous library in the scope-change render and rejects late metadata: %s', async next => {
    const content = deferred();
    options.client.query.mockImplementation(async () => ({ data: { _meta: proof, educationModules: [{ ...moduleRow, metadata: null }] } }));
    options.safeFetchFromIpfs.mockReturnValue(content.promise);
    EducationReadHarness(); await vi.waitFor(() => expect(options.safeFetchFromIpfs).toHaveBeenCalledOnce());
    const retryOldScope = EducationReadHarness().refetch, oldClient = options.client;
    const switched = EducationReadHarness({ ...next, client: { query: vi.fn(async () => ({ data: { _meta: proof, educationModules: [] } })) } }, false);
    expect(switched.data).toEqual([]); expect(switched.hasKnownData).toBe(false);
    EducationReadHarness(); await vi.waitFor(() => expect(EducationReadHarness().complete).toBe(true));
    content.resolve({ description: 'Late old library', answers: [['Together']], quiz: ['How?'] });
    await Promise.resolve(); await Promise.resolve();
    expect(EducationReadHarness().data).toEqual([]);
    const calls = oldClient.query.mock.calls.length;
    await retryOldScope(); expect(oldClient.query).toHaveBeenCalledTimes(calls);
  });

  it('rejects an old learner response and clears history immediately on account switch/disconnect', async () => {
    const old = deferred();
    const row = { id: 'completion-1', moduleId: moduleRow.moduleId, learner: ACCOUNT,
      completedAt: '9999999999999999', completedAtBlock: '123', module: { id: moduleRow.id }, educationHub: moduleRow.educationHub };
    options = { ...options, kind: 'completions', account: ACCOUNT,
      client: { query: vi.fn(async ({ variables }) => variables.learner === ACCOUNT && variables.block
        ? old.promise : { data: { _meta: proof, moduleCompletions: [] } }) } };
    EducationReadHarness(); await vi.waitFor(() => expect(options.client.query).toHaveBeenCalledTimes(2));
    expect(EducationReadHarness({ account: OTHER }, false).data).toEqual([]);
    EducationReadHarness(); await vi.waitFor(() => expect(EducationReadHarness().complete).toBe(true));
    old.resolve({ data: { _meta: proof, moduleCompletions: [row] } });
    await Promise.resolve(); await Promise.resolve();
    expect(EducationReadHarness().data).toEqual([]);
    expect(EducationReadHarness({ account: null })).toMatchObject({ complete: false, hasKnownData: false, data: [] });
  });

  it('lets the newest same-scope refresh win and invalidates saved retries on unmount', async () => {
    await ready();
    const first = deferred(), second = deferred();
    options.client.query.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const firstRun = EducationReadHarness().refetch();
    await vi.waitFor(() => expect(options.client.query).toHaveBeenCalledTimes(3));
    const secondRun = EducationReadHarness().refetch();
    await vi.waitFor(() => expect(options.client.query).toHaveBeenCalledTimes(4));
    options.client.query.mockImplementation(async () => ({ data: { _meta: proof, educationModules: [] } }));
    second.resolve({ data: { _meta: proof, educationModules: [] } }); await secondRun;
    first.resolve({ data: { _meta: proof, educationModules: [moduleRow] } }); await firstRun;
    expect(EducationReadHarness().data).toEqual([]);
    const savedRetry = EducationReadHarness().refetch; cleanup(); options.client.query.mockClear();
    await savedRetry(); expect(options.client.query).not.toHaveBeenCalled();
  });

  it('retains learner polling and return-to-active refresh without reading while idle', async () => {
    options = { ...options, kind: 'completions', account: ACCOUNT,
      client: { query: vi.fn(async () => ({ data: { _meta: proof, moduleCompletions: [] } })) } };
    await ready(); vi.useFakeTimers(); options.client.query.mockClear();
    await vi.advanceTimersByTimeAsync(120000); expect(options.client.query).not.toHaveBeenCalled();
    EducationReadHarness({ isActive: true });
    await vi.advanceTimersByTimeAsync(0); expect(options.client.query).toHaveBeenCalledTimes(2);
    options.client.query.mockClear(); await vi.advanceTimersByTimeAsync(60000);
    expect(options.client.query).toHaveBeenCalledTimes(2);
    EducationReadHarness({ isActive: false }); options.client.query.mockClear();
    await vi.advanceTimersByTimeAsync(120000); expect(options.client.query).not.toHaveBeenCalled();
  });
});
