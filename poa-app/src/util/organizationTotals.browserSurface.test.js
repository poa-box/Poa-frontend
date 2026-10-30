import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { cashoutGraph, CASHOUT_TEST_USER, CASHOUT_TEST_HASH } from '@/test/cashoutGraphFixture';
import { PEER_CASHOUTRELAY_BASE_URL } from '@/util/cashoutQueries';

const require = createRequire(import.meta.url);
const { webpack } = require('next/dist/compiled/webpack/webpack');
const app = process.cwd();
const temporaryRoot = resolve(app, '../.context/tmp/core-gap-closure');
const ORG = `0x${'ee'.repeat(32)}`, AUTH = `0x${'12'.repeat(20)}`;
const TOKEN = `0x${'34'.repeat(20)}`, HUB = `0x${'56'.repeat(20)}`;
const HASH = `0x${'ab'.repeat(32)}`, account = n => `0x${String(n).padStart(40, '0')}`;
let directory, bundle, compilation;

beforeAll(async () => {
  await mkdir(temporaryRoot, { recursive: true });
  directory = await mkdtemp(resolve(temporaryRoot, 'reader-browser-surface-'));
  const entry = resolve(directory, 'entry.js');
  await writeFile(entry, `
    export { readOrganizationTotals } from '@/util/organizationTotals';
    export { fetchOutstandingDeposits } from '@/services/web3/domain/CashOutService';
  `);
  compilation = await new Promise((done, reject) => {
    const compiler = webpack({
      mode: 'production', target: 'web', context: app, entry, cache: false, devtool: false,
      resolve: { alias: { '@': resolve(app, 'src') }, modules: ['node_modules', resolve(app, 'node_modules')] },
      output: { path: directory, filename: 'main.js', chunkFilename: '[id].js',
        publicPath: 'https://bundle.invalid/', library: { name: 'ReaderSurface', type: 'var' } },
      optimization: { minimize: false }, performance: false,
      plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'production' }) })],
    });
    compiler.run((error, stats) => compiler.close(closeError => {
      if (error || closeError) reject(error || closeError);
      else done(stats.toJson({ all: false, errors: true, warnings: true }));
    }));
  });
  expect(compilation.errors).toEqual([]);
  // The installed ox package has an unrelated dynamic WASM dependency. Retain
  // its diagnostic; any other warning (including missing core exports) fails.
  for (const warning of compilation.warnings) {
    expect(warning.moduleName).toBe('./node_modules/viem/node_modules/ox/_esm/tempo/internal/virtualMasterPool.js');
    expect(warning.message).toBe('Critical dependency: the request of a dependency is an expression');
    console.warn(`Unrelated installed dependency warning: ${warning.moduleName}: ${warning.message}`);
  }
  console.info(`Actual web compilation: cache=false, errors=${compilation.errors.length}, warnings=${compilation.warnings.length}`);
  bundle = await readFile(resolve(directory, 'main.js'), 'utf8');
}, 30000);
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

// Execute emitted browser JSONP chunks, without Node require or an actual browser.
// The DOM shim only loads local compiled scripts; every transport request is mocked.
function loadSurface(fetch) {
  const scripts = new Set();
  let context;
  const document = {
    getElementsByTagName: () => [...scripts],
    createElement: () => ({ setAttribute() {}, getAttribute() {}, parentNode: { removeChild: script => scripts.delete(script) } }),
    head: { appendChild(script) {
      scripts.add(script);
      void readFile(resolve(directory, new URL(script.src).pathname.slice(1)), 'utf8').then(code => {
        vm.runInContext(code, context); script.onload?.({ type: 'load', target: script });
      }).catch(() => script.onerror?.({ type: 'error', target: script }));
    } },
  };
  context = vm.createContext({ document, fetch, console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    URL, Headers, Request, Response, AbortController, TextEncoder, TextDecoder, structuredClone, atob, btoa, crypto: globalThis.crypto,
    localStorage: { getItem: () => 'v13', setItem() {} } });
  context.self = context; context.window = context;
  vm.runInContext(bundle, context);
  return context.ReaderSurface;
}

function totalsData(query, variables) {
  const data = { _meta: { deployment: 'offline-browser-fixture', hasIndexingErrors: false,
    block: { number: 100, hash: HASH, timestamp: 1000 } } };
  if (query.includes('CurrentMemberTotalState')) data.organization = { id: ORG, executorContract: null, eligibilityModule: null,
    membershipAuthority: { id: AUTH, isRouterBound: true, cutoverAt: '1', acceptedMembershipCount: 0 } };
  else if (query.includes('CurrentMemberTotalPage')) data.subjectMemberships = [];
  else if (query.includes('TokenHolderTotalState')) data.participationTokenContract = { id: TOKEN, totalSupply: '3', organization: { id: ORG } };
  else if (query.includes('TokenHolderTotalPage')) data.tokenBalances = [1, 2].map(n => ({
    id: `${TOKEN}-${account(n)}`, account: account(n), balance: String(n), updatedAtBlock: '99',
    participationToken: { id: TOKEN, organization: { id: ORG } },
  }));
  else if (query.includes('AllCompletionsState')) data.educationHubContract = { id: HUB, organization: { id: ORG } };
  else if (query.includes('AllCompletionsPage')) data.moduleCompletions = [1, 2, 3].map(n => ({
    id: `${HUB}-${n}-${account(n === 3 ? 2 : 1)}`, moduleId: String(n), learner: account(n === 3 ? 2 : 1),
    completedAt: '999', completedAtBlock: '99', transactionHash: HASH, module: { id: `${HUB}-${n}` },
    educationHub: { id: HUB, organization: { id: ORG } },
  }));
  else throw new Error('Unexpected GraphQL operation');
  if (variables.block) expect(variables.block).toEqual({ hash: HASH });
  return data;
}

describe('uncached actual web bundle reader surface', () => {
  it('loads lazy CommonJS reader exports and issues scoped holder/education requests through real Apollo', async () => {
    const transport = vi.fn(async (url, init) => {
      expect(String(url)).toBe('https://totals.invalid/');
      const { query, variables } = JSON.parse(init.body);
      return Response.json({ data: totalsData(query, variables) });
    });
    const surface = loadSurface(transport);
    const result = await surface.readOrganizationTotals({ source: { chainId: 100, endpoint: 'https://totals.invalid/', orgId: ORG,
      method: 'graph:organization-totals', indexed: true, snapshot: 'latest' }, authority: AUTH, token: TOKEN, hub: HUB });
    expect(result.totals).toEqual({ members: 0, holders: 2, completions: 3, learners: 2 });
    for (const [kind, contract] of [['members', AUTH], ['holders', TOKEN], ['education', HUB]]) {
      expect(result.snapshots[kind].coverage.status).toBe('complete');
      expect(result.snapshots[kind].source).toMatchObject({ chainId: 100, orgId: ORG, contract, block: { hash: HASH, number: '100' } });
    }
    expect(result.snapshots.education.data.rewardTotalRaw).toMatchObject({ state: 'unknown', code: 'COMPLETION_PAYOUT_NOT_INDEXED' });
    const requests = transport.mock.calls.map(([, init]) => JSON.parse(init.body));
    expect(requests).toHaveLength(7);
    expect(requests.filter(request => request.query.includes('TokenHolderTotal'))).toHaveLength(2);
    expect(requests.filter(request => request.query.includes('AllCompletions'))).toHaveLength(2);
    expect(requests.filter(request => !request.variables.block)).toHaveLength(1);
  });

  it('runs the actual cashout consumer and installed discovery export through mocked HTTP transports', async () => {
    const graph = cashoutGraph();
    const transport = vi.fn(async (url, init) => {
      const request = JSON.parse(init.body);
      if (request.query) {
        expect(String(url)).toBe(PEER_CASHOUTRELAY_BASE_URL);
        return Response.json(await graph(request));
      }
      expect(String(url)).toBe('https://mainnet.base.org/');
      expect(['eth_chainId', 'eth_getBlockByNumber']).toContain(request.method);
      const result = request.method === 'eth_chainId' ? '0x2105' : {
        number: '0x64', hash: CASHOUT_TEST_HASH, timestamp: '0x3e8', transactions: [],
      };
      return Response.json({ jsonrpc: '2.0', id: request.id, result });
    });
    const rows = await loadSurface(transport).fetchOutstandingDeposits(CASHOUT_TEST_USER);
    expect(rows).toHaveLength(0);
    expect(rows.coverage.status).toBe('complete');
    expect(rows.coverage.source).toMatchObject({ chainId: 8453, account: CASHOUT_TEST_USER, block: { number: '100', hash: CASHOUT_TEST_HASH } });
    expect(rows.coverage.outstandingCount.state).toBe('unknown');
    const requests = transport.mock.calls.map(([, init]) => JSON.parse(init.body));
    expect(requests.filter(request => request.query?.includes('CashoutDiscoveryState'))).toHaveLength(2);
    expect(requests.filter(request => request.query?.includes('CashoutDiscoveryPage'))).toHaveLength(2);
    expect(requests.filter(request => request.variables?.statuses?.includes('RECOVERED'))).toHaveLength(1);
    expect(requests.filter(request => request.variables?.statuses?.includes('DEPOSITED'))).toHaveLength(1);
    expect(requests.filter(request => request.method === 'eth_getBlockByNumber')).toHaveLength(2);
  });
});
