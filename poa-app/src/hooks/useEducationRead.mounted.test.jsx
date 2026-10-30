import React, { act, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEducationRead } from '@/hooks/useEducationRead';
// Load Apollo's environment detection before installing the minimal host DOM.
import '@/lib/education/reads';
import { moduleRewardLabel } from '@/lib/tasks/educationForm';
import { createParityHost } from '@/test/parityHost';
const ORG = `0x${'ab'.repeat(32)}`, HUB = `0x${'12'.repeat(20)}`, HASH = `0x${'cd'.repeat(32)}`;
const meta = { block: { number: 123, hash: HASH, timestamp: 2000 } };
let host, options, observed;
const row = { id: `${HUB}-9007199254740993`, moduleId: '9007199254740993', title: 'Shared knowledge', contentHash: HASH,
  payout: '1', status: 'Active', educationHub: { id: HUB, organization: { id: ORG } }, metadata: null };
function Harness() {
  const read = useEducationRead(options);
  useEffect(() => { observed = read; }, [read]);
  return <div>{read.data.map(module => <p key={module.id}>{module.name} {moduleRewardLabel(module)} {module.contentLoading ? 'Loading material' : module.question}</p>)}
    <span>{read.error || ''}</span><button onClick={read.refetch}>Retry</button></div>;
}
async function loaded() {
  await vi.waitFor(async () => { await act(async () => { await Promise.resolve(); }); expect(observed.loading).toBe(false); });
  expect(observed.error, JSON.stringify(observed.coverage)).toBeNull();
}
beforeEach(() => {
  options = { chainId: 100, endpoint: 'https://education.invalid/graphql', orgId: ORG, hub: HUB, kind: 'modules',
    safeFetchFromIpfs: vi.fn(async () => ({ description: 'Original resource', quiz: ['How do we work?'], answers: [['Together']], extension: { retained: true } })),
    client: { query: vi.fn(async () => ({ data: { _meta: meta, educationModules: [row] } })) } };
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); })); host = createParityHost();
});
afterEach(async () => { await host.unmount(); expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
describe('mounted learning source lifecycle through real core readers', () => {
  it('keeps current lesson rewards and readable material independent of missing historic payout analytics', async () => {
    await host.render(<Harness />); await loaded();
    await vi.waitFor(async () => { await act(async () => { await Promise.resolve(); }); expect(host.container.textContent).toContain('How do we work?'); });
    expect(host.container.textContent).toContain('0.000000000000000001');
    expect(observed.data[0].metadata.extension).toEqual({ retained: true }); expect(observed.complete).toBe(true);
    options.client.query.mockRejectedValue(new Error('Mock source outage'));
    await host.click(host.button('Retry'));
    expect(host.container.textContent).toContain('Shared knowledge'); expect(host.container.textContent).toContain('try again');
  });
  it.each(['orgId', 'endpoint'])('switches %s without leaking a late old lesson or saved retry', async key => {
    let finish;
    options.safeFetchFromIpfs.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await host.render(<Harness />); await loaded();
    const oldRetry = observed.refetch, oldClient = options.client;
    options = { ...options, [key]: key === 'orgId' ? `0x${'ef'.repeat(32)}` : 'https://other.invalid/graphql',
      client: { query: vi.fn(async () => ({ data: { _meta: meta, educationModules: [] } })) } };
    await host.render(<Harness />); await loaded();
    expect(host.container.textContent).not.toContain('Shared knowledge');
    const calls = oldClient.query.mock.calls.length;
    await act(async () => { finish({ quiz: ['Late old material'], answers: [['Wrong organization']] }); await oldRetry(); });
    expect(host.container.textContent).not.toContain('Late old material'); expect(oldClient.query).toHaveBeenCalledTimes(calls);
    expect(observed).toMatchObject({ complete: true, data: [] });
  });
});
