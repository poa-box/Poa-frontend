import React, { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NETWORKS } from '@/config/networks';
import { createParityHost } from '@/test/parityHost';
const f = vi.hoisted(() => ({ directory: {} }));
vi.mock('@/context/profileHubContext', () => ({ useProfileHubContext: () => f.directory }));
vi.mock('next/link', () => ({ default: ({ children, href }) => <a href={href}>{children}</a> }));
import LedgerStrip from '@/components/marketing/landing/LedgerStrip';
let host, unavailable;
const HASH = `0x${'ab'.repeat(32)}`;
beforeEach(() => {
  unavailable = true;
  f.directory = { isLoading: false, isComplete: true, perpetualOrganizations: [{ id: 'First', totalMembers: 2 }, { id: 'Second', totalMembers: 3 }] };
  vi.stubGlobal('fetch', vi.fn(async (url, input) => {
    const network = Object.values(NETWORKS).find(row => row.subgraphUrl === url || row.rpcUrl === url);
    if (!network || unavailable) throw new Error('Controlled offline source unavailable');
    const request = JSON.parse(input.body);
    if (request.method) return { ok: true, json: async () => ({ result: request.method === 'eth_chainId'
      ? `0x${network.chainId.toString(16)}` : { number: '0x64', hash: HASH } }) };
    return { ok: true, json: async () => ({ data: {
      taskManagers: [], paymentManagerContracts: [], executorContracts: [], paymasterHubContracts: [],
      payments: [], paymasterDepositEvents: [], solidarityEvents: [],
      _meta: { block: { number: 100, hash: null, timestamp: null }, hasIndexingErrors: false },
    } }) };
  }));
  host = createParityHost();
});
afterEach(async () => { await host.unmount(); vi.unstubAllGlobals(); });
it('mounts the actual landing activity strip, distinguishes unavailable inflows from proven zero, and retries real core readers', async () => {
  await host.render(<LedgerStrip />);
  await vi.waitFor(async () => { await act(async () => { await Promise.resolve(); }); expect(host.button('Try again')).toBeDefined(); });
  expect(host.container.textContent).toContain('Organizations2'); expect(host.container.textContent).toContain('Total inflowsUnavailable');
  unavailable = false; await host.click(host.button('Try again'));
  await vi.waitFor(async () => { await act(async () => { await Promise.resolve(); }); expect(host.container.textContent).toContain('Total inflows$0'); });
  expect(host.button('Try again')).toBeUndefined();
  const requests = fetch.mock.calls.map(([url, input]) => ({ url, ...JSON.parse(input.body) }));
  expect(requests.some(request => request.query?.includes('FetchHistoricalPotsPage'))).toBe(true);
  expect(requests.some(request => request.query?.includes('FetchIndexed'))).toBe(true);
  expect(requests.filter(request => request.method === 'eth_chainId')).toHaveLength(Object.values(NETWORKS).filter(network => !network.isTestnet).length);
  expect(requests.some(request => request.method === 'eth_getLogs')).toBe(false); // Proven empty pot universe needs no log scan.
});
