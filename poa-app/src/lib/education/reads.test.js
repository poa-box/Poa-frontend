import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { print } from 'graphql';
import { readEducation, shapeEducationModules, shapeEducationCompletions } from '@/lib/education/reads';
import { getClient } from '@/util/apolloClient';
import { listCompletionsComplete } from '@poa-box/core/reads/education';

const ORG = `0x${'ab'.repeat(32)}`, HUB = `0x${'12'.repeat(20)}`, ACCOUNT = `0x${'34'.repeat(20)}`;
const HASH = `0x${'cd'.repeat(32)}`, CONTENT = `0x${'56'.repeat(32)}`;
const source = { chainId: 100, endpoint: 'https://education.invalid/graphql', orgId: ORG, contract: HUB,
  indexed: true, snapshot: 'latest', method: 'education:modules' };
const proof = { block: { number: 123, hash: HASH, timestamp: 2000 } };
const hub = { id: HUB, organization: { id: ORG } };
const moduleRow = n => ({ id: `${HUB}-${String(n).padStart(5, '0')}`, moduleId: (9007199254740993n + BigInt(n)).toString(),
  title: `Lesson ${n}`, contentHash: CONTENT, payout: n === 0 ? '1' : '9007199254740993123456789012345678',
  status: n === 0 ? 'Removed' : 'Active', createdAt: '1', educationHub: hub,
  metadata: { description: 'Together', link: 'https://example.invalid/lesson', quiz: ['How?'], answersJson: '[["With care","Alone"]]' } });
const completionRow = n => ({ id: `completion-${String(n).padStart(5, '0')}`, moduleId: (9007199254740993n + BigInt(n)).toString(),
  learner: ACCOUNT, completedAt: '9007199254740993', completedAtBlock: '123', transactionHash: HASH,
  module: { id: moduleRow(n).id }, educationHub: hub });
function mockClient(collection, rows, response = data => data) {
  return { query: vi.fn(async ({ variables }) => ({ data: response({ _meta: proof,
    [collection]: rows.filter(row => row.id > variables.cursor).slice(0, variables.first),
  }, variables) })) };
}
beforeEach(() => { vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); })); });
afterEach(() => vi.unstubAllGlobals());

describe('actual installed education complete readers through endpoint Apollo adapters', () => {
  it('enumerates beyond 50 modules and proves the empty terminal page, retaining history and exact payouts/IDs', async () => {
    const rows = Array.from({ length: 500 }, (_, n) => moduleRow(n));
    const client = mockClient('educationModules', rows);
    const snapshot = await readEducation({ client, source, kind: 'modules' });
    expect(snapshot.coverage.status).toBe('complete');
    expect(snapshot.data).toHaveLength(500);
    expect(snapshot.source).toMatchObject({ ...source, snapshot: 'pinned', block: { number: '123', hash: HASH, timestamp: '2000' } });
    expect(client.query).toHaveBeenCalledTimes(4); // discovery, 250, 250, terminal empty
    const requests = client.query.mock.calls.map(([request]) => request);
    expect(requests.map(request => request.variables.cursor)).toEqual(['', '', rows[249].id, rows[499].id]);
    for (const request of requests.slice(1)) {
      expect(request.variables.block).toEqual({ hash: HASH });
      expect(request.variables.orgId).toBe(ORG); expect(request.variables.hub).toBe(HUB);
      expect(request.fetchPolicy).toBe('network-only');
      const text = print(request.query);
      expect(text).toMatch(/_meta\(block: \$block\)/);
      expect(text).toMatch(/educationModules\([\s\S]*block: \$block/);
      expect(text).not.toContain('completions');
    }
    const shaped = await shapeEducationModules(snapshot.data, vi.fn());
    expect(shaped[0]).toMatchObject({ id: rows[0].id, moduleId: '9007199254740993', status: 'Removed',
      payoutRaw: '1', payout: '0', question: 'How?', answers: [{ index: 0, answer: 'With care' }, { index: 1, answer: 'Alone' }],
      completions: null, completionCount: null, completionsComplete: false });
    expect(shaped.at(-1).payoutRaw).toBe('9007199254740993123456789012345678');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('enumerates more than 100 completions for exactly one learner without substituting a library aggregate', async () => {
    const rows = Array.from({ length: 501 }, (_, n) => completionRow(n));
    const client = mockClient('moduleCompletions', rows);
    const snapshot = await readEducation({ client, source: { ...source, account: ACCOUNT }, kind: 'completions' });
    expect(snapshot.coverage.status).toBe('complete'); expect(snapshot.data).toHaveLength(501);
    expect(client.query).toHaveBeenCalledTimes(4);
    expect(client.query.mock.calls.every(([request]) => request.variables.learner === ACCOUNT)).toBe(true);
    expect(shapeEducationCompletions(snapshot.data).at(-1)).toMatchObject({ id: rows[500].id, moduleId: rows[500].moduleId,
      moduleEntityId: rows[500].module.id, completedAt: '9007199254740993', completedAtBlock: '123' });
    await expect(readEducation({ client, source, kind: 'completions' })).rejects.toThrow();
    expect(() => listCompletionsComplete({ source: { ...source, snapshot: 'pinned', block: { number: '123', hash: HASH } },
      query: vi.fn() })).toThrow('Explicit learner account required');
  });

  it('uses the observed block number when the endpoint explicitly has no block hash', async () => {
    const client = mockClient('educationModules', [], data => ({ ...data, _meta: { block: { number: 123, hash: null, timestamp: 2000 } } }));
    const result = await readEducation({ client, source, kind: 'modules' });
    expect(result.coverage.status).toBe('complete');
    expect(result.source.block).toEqual({ number: '123', timestamp: '2000' });
    expect(client.query.mock.calls[1][0].variables.block).toEqual({ number: 123 });
  });

  it('distinguishes proven empty, failed/partial enumeration, missing collection and foreign learner/hub/org rows', async () => {
    const empty = await readEducation({ client: mockClient('educationModules', []), source, kind: 'modules' });
    expect(empty.coverage.status).toBe('complete'); expect(empty.data).toEqual([]);
    const partial = mockClient('educationModules', [moduleRow(0), moduleRow(1)]);
    partial.query.mockImplementationOnce(async () => ({ data: { _meta: proof } }))
      .mockImplementationOnce(async () => ({ data: { _meta: proof, educationModules: [moduleRow(0)] } }))
      .mockRejectedValueOnce(new Error('Outage'));
    const failed = await readEducation({ client: partial, source, kind: 'modules', pageSize: 1 });
    expect(failed.coverage.status).toBe('incomplete'); expect(failed.data).toHaveLength(1);
    const capped = await readEducation({ client: mockClient('educationModules', [moduleRow(0), moduleRow(1)]),
      source, kind: 'modules', pageSize: 1, maxPages: 1 });
    expect(capped.coverage.status).toBe('incomplete'); expect(capped.data).toHaveLength(1);
    const missing = await readEducation({ client: { query: async () => ({ data: { _meta: proof } }) }, source, kind: 'modules' });
    expect(missing.coverage.status).not.toBe('complete');
    for (const row of [
      { ...completionRow(0), learner: HUB },
      { ...completionRow(0), educationHub: { ...hub, id: ACCOUNT } },
      { ...completionRow(0), educationHub: { ...hub, organization: { id: HASH } } },
    ]) {
      const result = await readEducation({ client: mockClient('moduleCompletions', [row]), source: { ...source, account: ACCOUNT }, kind: 'completions' });
      expect(result.coverage.status).not.toBe('complete');
    }
  });

  it.each([
    undefined,
    { block: { number: 124, hash: HASH, timestamp: 2000 } },
    { block: { number: 123, hash: `0x${'ef'.repeat(32)}`, timestamp: 2000 } },
    { block: { number: 123, hash: HASH } },
  ])('does not certify a terminal page with absent or conflicting same-response block proof: %s', async meta => {
    const client = mockClient('educationModules', [moduleRow(0)], (data, variables) => variables.cursor ? { ...data, _meta: meta } : data);
    const result = await readEducation({ client, source, kind: 'modules', pageSize: 1 });
    expect(result.coverage.status).toBe('incomplete');
    expect(result.data).toHaveLength(1);
  });

  it('uses the verified content-addressed fallback only when indexed metadata is absent and retains its full document', async () => {
    const content = { description: 'A shared future', quiz: ['Why?'], answers: [['Together', 'Alone']], link: 'https://example.invalid',
      extension: { preserved: true }, moreQuestions: ['Retained'] };
    const fetchContent = vi.fn().mockResolvedValue(content);
    const [indexed, fallback, preparing] = await shapeEducationModules([moduleRow(0), { ...moduleRow(1), metadata: null },
      { ...moduleRow(2), metadata: null, contentHash: `0x${'0'.repeat(64)}` }], fetchContent);
    expect(fetchContent).toHaveBeenCalledExactlyOnceWith(fallback.ipfsHash);
    expect(indexed.metadata).toEqual(moduleRow(0).metadata);
    expect(fallback.metadata).toBe(content); expect(fallback.contentHashBytes32).toBe(CONTENT);
    expect(fallback).toMatchObject({ question: 'Why?', description: 'A shared future', answers: [{ index: 0, answer: 'Together' }, { index: 1, answer: 'Alone' }] });
    expect(preparing.isIndexing).toBe(true);
    const [unavailable] = await shapeEducationModules([{ ...moduleRow(1), metadata: null }], async () => null);
    expect(unavailable).toMatchObject({ contentUnavailable: true, payoutRaw: moduleRow(1).payout, _ipfsFetched: false });
    const [malformed] = await shapeEducationModules([{ ...moduleRow(0), metadata: { quiz: ['How?'], answersJson: '{}' } }], fetchContent);
    expect(malformed.answers).toEqual([]);
  });

  it('uses each actual endpoint cache and refuses cached _meta as evidence for an empty terminal HTTP response', async () => {
    const endpoints = ['https://education-gnosis.invalid/graphql', 'https://education-arbitrum.invalid/graphql'];
    const fetched = vi.fn(async (endpoint, request) => {
      const { variables } = JSON.parse(request.body);
      const data = variables.cursor ? { educationModules: [] } : { _meta: proof, educationModules: [moduleRow(endpoint === endpoints[0] ? 0 : 1)] };
      return new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetched);
    const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const [index, endpoint] of endpoints.entries()) {
        const result = await readEducation({ client: getClient(endpoint), source: { ...source, chainId: index ? 42161 : 100, endpoint }, kind: 'modules', pageSize: 1 });
        expect(result.coverage.status).toBe('incomplete');
        expect(result.coverage.issues.some(issue => issue.code === 'BLOCK_EVIDENCE_UNAVAILABLE')).toBe(true);
        expect(result.data[0].moduleId).toBe(moduleRow(index).moduleId);
        expect(JSON.stringify(getClient(endpoint).cache.extract())).toContain(`Lesson ${index}`);
        expect(JSON.stringify(getClient(endpoint).cache.extract())).not.toContain(`Lesson ${index ? 0 : 1}`);
      }
    } finally { warning.mockRestore(); }
    expect(getClient(endpoints[0])).not.toBe(getClient(endpoints[1]));
    expect(fetched).toHaveBeenCalledTimes(6);
  });
});
