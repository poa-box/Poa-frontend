/**
 * The capability probe is the only thing standing between a not-yet-upgraded
 * subgraph endpoint and a blank task board: one unknown field fails the WHOLE
 * GraphQL document, and the document these capabilities gate is the one that
 * backs every project and task in the app.
 *
 * Pure requirement checks and a mocked transport cover schema batching, endpoint
 * isolation, cache behavior, and timeout failure without a live subgraph.
 */

import { afterEach, describe, it, expect, vi} from 'vitest';
import { satisfies, buildIntrospectionQuery, hasCapability, CAPABILITY, peekCapability, recordConfirmedCapability } from './subgraphCapabilities';

/** Introspection result shaped like introspect() returns: type -> Set|null. */
const typeMap = (entries) => new Map(Object.entries(entries).map(
  ([k, v]) => [k, v === null ? null : new Set(v)]
));

const FULL = typeMap({
  Task: ['id', 'status', 'reclaimCount', 'releaseCount', 'lastReleasedAt', 'releases'],
  TaskRelease: ['id', 'selfRelease', 'releasedAt'],
});

describe('satisfies', () => {
  it('accepts a schema that has every required field', () => {
    expect(satisfies(FULL, CAPABILITY.TASK_RELEASES.require)).toBe(true);
  });

  it('rejects when the entity is absent entirely (__type resolves null)', () => {
    const noEntity = typeMap({
      Task: ['id', 'releaseCount', 'lastReleasedAt', 'releases'],
      TaskRelease: null,
    });
    expect(satisfies(noEntity, CAPABILITY.TASK_RELEASES.require)).toBe(false);
  });

  it('rejects a PARTIAL deployment — every missing field individually flips it false', () => {
    // The real hazard: a schema with some of the new fields would still fail the
    // document, so anything less than the full set must read as unsupported.
    for (const missing of ['releaseCount', 'lastReleasedAt', 'releases']) {
      const partial = typeMap({
        Task: ['id', 'releaseCount', 'lastReleasedAt', 'releases'].filter((f) => f !== missing),
        TaskRelease: ['id'],
      });
      expect(satisfies(partial, CAPABILITY.TASK_RELEASES.require)).toBe(false);
    }
  });

  it('rejects an unknown type and an empty requirement list', () => {
    expect(satisfies(new Map(), CAPABILITY.TASK_RELEASES.require)).toBe(false);
    expect(satisfies(FULL, [])).toBe(false);
  });

  it('checks entity existence only when no field is named', () => {
    expect(satisfies(typeMap({ TaskRelease: [] }), [{ type: 'TaskRelease' }])).toBe(true);
    expect(satisfies(typeMap({ TaskRelease: null }), [{ type: 'TaskRelease' }])).toBe(false);
  });
});

describe('buildIntrospectionQuery', () => {
  it('aliases each type so one capability costs one round trip', () => {
    const q = buildIntrospectionQuery(['Task', 'TaskRelease']);
    expect(q).toContain('t0: __type(name: "Task")');
    expect(q).toContain('t1: __type(name: "TaskRelease")');
    expect(q).toMatch(/^\{.*\}$/s);
  });

  it('is driven by the DEDUPED type list — Task is required 3 times, asked once', () => {
    const types = [...new Set(CAPABILITY.TASK_RELEASES.require.map((r) => r.type))];
    expect(types).toEqual(['Task', 'TaskRelease']);
    expect(buildIntrospectionQuery(types).match(/__type/g)).toHaveLength(2);
  });
});

describe('capability descriptors', () => {
  it('keeps the pre-generalisation localStorage key for the proposer probe', () => {
    // Back-compat pin: users whose endpoint was already marked upgraded must not
    // be re-probed, and VotingContext must keep working untouched.
    expect(CAPABILITY.PROPOSAL_PROPOSER.legacyStorageKey('https://x/y'))
      .toBe('poa:subgraphHasProposer:https://x/y');
  });

  it('gives the release capability its own id and no legacy key', () => {
    expect(CAPABILITY.TASK_RELEASES.id).toBe('taskReleases');
    expect(CAPABILITY.TASK_RELEASES.legacyStorageKey).toBeUndefined();
  });
});

describe('hasCapability guards', () => {
  it('resolves false without touching the network when inputs are missing', async () => {
    await expect(hasCapability(undefined, CAPABILITY.TASK_RELEASES)).resolves.toBe(false);
    await expect(hasCapability('', CAPABILITY.TASK_RELEASES)).resolves.toBe(false);
    await expect(hasCapability('https://x/y', null)).resolves.toBe(false);
  });
});

describe('peekCapability — synchronous seed', () => {
  it('returns undefined when nothing is known (no probe fired)', () => {
    expect(peekCapability('https://unknown.example/x', CAPABILITY.TASK_RELEASES)).toBeUndefined();
  });

  it('returns undefined for missing inputs rather than a false negative', () => {
    expect(peekCapability(null, CAPABILITY.TASK_RELEASES)).toBeUndefined();
    expect(peekCapability('https://x.example', null)).toBeUndefined();
  });

  it('reads a cached positive from localStorage synchronously', () => {
    const url = 'https://peek-positive.example/sg';
    const store = {};
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = v; },
      },
    });
    store[`poa:subgraphCapability:taskReleases:${url}`] = '1';
    expect(peekCapability(url, CAPABILITY.TASK_RELEASES)).toBe(true);
    vi.unstubAllGlobals();
  });

  it('does NOT report an in-flight probe as false, then safely settles a stalled probe', async () => {
    const url = 'https://peek-inflight.example/sg';
    vi.useFakeTimers();
    vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: () => {} } });
    vi.stubGlobal('fetch', (_url, { signal }) => new Promise((resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const probe = hasCapability(url, CAPABILITY.TASK_RELEASES); // memoises a pending Promise
    // A Promise in the cache means "unknown" — reporting false here would make a
    // capable endpoint fetch the base document on every load, forever.
    expect(peekCapability(url, CAPABILITY.TASK_RELEASES)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(12000);
    await expect(probe).resolves.toBe(false);
    expect(peekCapability(url, CAPABILITY.TASK_RELEASES)).toBe(false);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});


describe('endpoint capability introspection batching', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const schemaResponse = (body, omittedTypes = []) => {
    const fields = new Map();
    Object.values(CAPABILITY).forEach(cap => cap.require.forEach(({ type, field }) => {
      if (!fields.has(type)) fields.set(type, new Set());
      if (field) fields.get(type).add(field);
    }));
    const data = {};
    for (const match of body.query.matchAll(/(t\d+): __type\(name: "([^"]+)"\)/g)) {
      data[match[1]] = omittedTypes.includes(match[2]) ? null : {
        name: match[2], fields: [...(fields.get(match[2]) || [])].map(name => ({ name })),
      };
    }
    return { ok: true, json: async () => ({ data }) };
  };

  it('unions proposal, task, and access types once and deduplicates repeated consumers', async () => {
    const fetch = vi.fn(async (_url, options) => schemaResponse(JSON.parse(options.body)));
    vi.stubGlobal('fetch', fetch);
    const url = 'https://batch-all.example/sg';
    const probes = Object.values(CAPABILITY).map(cap => hasCapability(url, cap));
    probes.push(hasCapability(url, CAPABILITY.TASK_RELEASES));
    expect(fetch).not.toHaveBeenCalled();
    expect(peekCapability(url, CAPABILITY.TASK_RELEASES)).toBeUndefined();
    await expect(Promise.all(probes)).resolves.toEqual([true, true, true, true]);
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(Array.isArray(body)).toBe(false);
    const requested = [...body.query.matchAll(/__type\(name: "([^"]+)"\)/g)].map(m => m[1]);
    const expected = [...new Set(Object.values(CAPABILITY).flatMap(cap => cap.require.map(r => r.type)))];
    expect(requested).toEqual(expected);
    await hasCapability(url, CAPABILITY.PROPOSAL_PROPOSER);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('evaluates each capability independently and persists only positives', async () => {
    const storage = new Map();
    vi.stubGlobal('window', { localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    } });
    vi.stubGlobal('fetch', async (_url, options) => schemaResponse(JSON.parse(options.body), ['TaskRelease']));
    const url = 'https://batch-partial.example/sg';
    await expect(Promise.all([
      hasCapability(url, CAPABILITY.PROPOSAL_PROPOSER),
      hasCapability(url, CAPABILITY.TASK_RELEASES),
    ])).resolves.toEqual([true, false]);
    expect(peekCapability(url, CAPABILITY.PROPOSAL_PROPOSER)).toBe(true);
    expect(peekCapability(url, CAPABILITY.TASK_RELEASES)).toBe(false);
    expect([...storage.keys()]).toEqual([`poa:subgraphHasProposer:${url}`]);
  });

  it('keeps simultaneous endpoint schemas isolated', async () => {
    const fetch = vi.fn(async (url, options) => schemaResponse(JSON.parse(options.body), url.includes('legacy') ? ['Proposal'] : []));
    vi.stubGlobal('fetch', fetch);
    await expect(Promise.all([
      hasCapability('https://batch-modern.example', CAPABILITY.PROPOSAL_PROPOSER),
      hasCapability('https://batch-legacy.example', CAPABILITY.PROPOSAL_PROPOSER),
    ])).resolves.toEqual([true, false]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('settles every queued capability safely when the shared request times out', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    vi.stubGlobal('fetch', fetch);
    const url = 'https://batch-timeout.example';
    const probes = [CAPABILITY.PROPOSAL_PROPOSER, CAPABILITY.TASK_RELEASES].map(cap => hasCapability(url, cap));
    await vi.advanceTimersByTimeAsync(12000);
    await expect(Promise.all(probes)).resolves.toEqual([false, false]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not queue a capability already positive in persistent storage', async () => {
    const url = 'https://batch-stored.example';
    vi.stubGlobal('window', { localStorage: {
      getItem: key => key === `poa:subgraphHasProposer:${url}` ? '1' : null,
      setItem: () => {},
    } });
    const fetch = vi.fn(async (_url, options) => schemaResponse(JSON.parse(options.body)));
    vi.stubGlobal('fetch', fetch);
    await expect(Promise.all([
      hasCapability(url, CAPABILITY.PROPOSAL_PROPOSER),
      hasCapability(url, CAPABILITY.TASK_RELEASES),
    ])).resolves.toEqual([true, true]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0][1].body).query).not.toContain('Proposal');
  });
});


describe('recordConfirmedCapability', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('seeds only the confirmed endpoint and capability, with positive persistence', async () => {
    const storage = new Map();
    vi.stubGlobal('window', { localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    } });
    const fetch = vi.fn();vi.stubGlobal('fetch', fetch);
    const url = 'https://confirmed-rich.example';
    recordConfirmedCapability(url, CAPABILITY.TASK_RELEASES);
    expect(peekCapability(url, CAPABILITY.TASK_RELEASES)).toBe(true);
    expect(peekCapability(url, CAPABILITY.PROPOSAL_PROPOSER)).toBeUndefined();
    expect(peekCapability(url + '/other', CAPABILITY.TASK_RELEASES)).toBeUndefined();
    await expect(hasCapability(url, CAPABILITY.TASK_RELEASES)).resolves.toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(storage.get(`poa:subgraphCapability:taskReleases:${url}`)).toBe('1');
  });

  it.each(['unsupported', 'network failure'])('does not let an older %s probe overwrite confirmation', async outcome => {
    let finish, started;
    const dispatched = new Promise(resolve => { started = resolve; });
    vi.stubGlobal('fetch', () => new Promise((resolve, reject) => {
      finish = () => outcome === 'unsupported'
        ? resolve({ ok: true, json: async () => ({ data: {} }) })
        : reject(new Error('offline'));
      started();
    }));
    const url = `https://confirmed-race.example/${outcome}`;
    const pending = hasCapability(url, CAPABILITY.TASK_RELEASES);
    await dispatched;
    recordConfirmedCapability(url, CAPABILITY.TASK_RELEASES);
    finish();
    await expect(pending).resolves.toBe(true);
    expect(peekCapability(url, CAPABILITY.TASK_RELEASES)).toBe(true);
  });
});
