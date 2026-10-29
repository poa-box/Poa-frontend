import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ slots: [], cursor: 0, effects: new Map(), read: null }));
vi.mock('react', async original => {
  const actual = await original();
  const memo = (fn, deps) => {
    const index = fixture.cursor++, previous = fixture.slots[index];
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) fixture.slots[index] = { deps, value: fn() };
    return fixture.slots[index].value;
  };
  return { ...actual, useCallback: (fn, deps) => memo(() => fn, deps),
    useRef: initial => { const index = fixture.cursor++; return fixture.slots[index] ||= { current: initial }; },
    useState: initial => { const index = fixture.cursor++; fixture.slots[index] ||= { value: initial };
      return [fixture.slots[index].value, next => { fixture.slots[index].value = typeof next === 'function' ? next(fixture.slots[index].value) : next; }]; },
    useEffect: (fn, deps) => { const index = fixture.cursor++, previous = fixture.slots[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) fixture.effects.set(index, () => {
        previous?.cleanup?.(); fixture.slots[index] = { deps, cleanup: fn() };
      }); },
  };
});
vi.mock('@/services/web3/read/projectCreator', () => ({ readProjectCreator: input => fixture.read(input) }));
import { useProjectCreator } from '@/hooks/useProjectCreator';
let options;
const scope = { account: 'current' };
const known = { facts: { authorized: { state: 'known', value: true } }, input: {} };
const deferred = () => { let resolve; return { promise: new Promise(done => { resolve = done; }), resolve: value => resolve(value) }; };
function CreatorReadHarness(next, effects = true) {
  if (next) options = { ...options, ...next };
  fixture.cursor = 0;
  const result = useProjectCreator(options);
  if (effects) { const effects = [...fixture.effects.values()]; fixture.effects.clear(); for (const effect of effects) effect(); }
  return result;
}
const cleanup = () => fixture.slots.forEach(slot => slot?.cleanup?.());
beforeEach(() => { fixture.slots = []; fixture.cursor = 0; fixture.effects = new Map(); fixture.read = vi.fn(async () => known); options = { scope, authority: { source: { block: { number: '1' } } }, enabled: true }; });
afterEach(cleanup);
it('masks old identities synchronously, drops late completions, and prevents stale retry interference', async () => {
  const first = deferred(), second = deferred();
  fixture.read.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
  const saved = CreatorReadHarness().refetch;
  await vi.waitFor(() => expect(fixture.read).toHaveBeenCalledTimes(1));
  expect(CreatorReadHarness({ scope: { account: 'next' } }, false).facts).toBeUndefined();
  CreatorReadHarness(); await vi.waitFor(() => expect(fixture.read).toHaveBeenCalledTimes(2));
  expect(await saved()).toBeNull();
  first.resolve({ facts: { authorized: { state: 'known', value: false } } });
  second.resolve(known);
  await vi.waitFor(() => expect(CreatorReadHarness().facts?.authorized.value).toBe(true));
  const retry = CreatorReadHarness().refetch; cleanup();
  const calls = fixture.read.mock.calls.length;
  expect(await retry()).toBeNull(); expect(fixture.read).toHaveBeenCalledTimes(calls);
});
it('does no settings reads for unresolved identity and revokes prior grants during a failed refresh', async () => {
  CreatorReadHarness({ enabled: false }); expect(fixture.read).not.toHaveBeenCalled();
  CreatorReadHarness({ enabled: true }); await vi.waitFor(() => expect(CreatorReadHarness().facts?.authorized.value).toBe(true));
  const wait = deferred(); fixture.read.mockReturnValue(wait.promise);
  const pending = CreatorReadHarness().refetch(); expect(CreatorReadHarness().facts).toBeUndefined();
  wait.resolve(null); await pending; expect(CreatorReadHarness().facts).toBeUndefined();
});
it.each(['account', 'orgId', 'chainId'])('withdraws creator authorization synchronously for a %s switch and settles the new denial', async field => {
  CreatorReadHarness();
  await vi.waitFor(() => expect(CreatorReadHarness().facts?.authorized.value).toBe(true));
  const late = deferred(); fixture.read.mockReturnValueOnce(late.promise);
  const oldRefresh = CreatorReadHarness().refetch();
  await vi.waitFor(() => expect(fixture.read).toHaveBeenCalledTimes(2));
  const newScope = { ...scope, [field]: field === 'chainId' ? 100 : 'new-scope' };
  expect(CreatorReadHarness({ scope: newScope }, false).facts).toBeUndefined();
  const denied = { facts: { authorized: { state: 'known', value: false } }, input: {} };
  fixture.read.mockResolvedValueOnce(denied);
  CreatorReadHarness();
  await vi.waitFor(() => expect(CreatorReadHarness().facts?.authorized).toEqual(denied.facts.authorized));
  late.resolve(known); await oldRefresh;
  expect(CreatorReadHarness().facts?.authorized).toEqual(denied.facts.authorized);
});
