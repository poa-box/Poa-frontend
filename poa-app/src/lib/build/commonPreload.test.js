import { describe, expect, it } from 'vitest';
import { findCommonChunk, findOrganizationProviderChunks, findActivePageChunks, transformExportHtml } from './commonPreload.mjs';
import { usesDeferredAccountBootstrap } from '../applicationRoutes.mjs';
const chunk = 'static/chunks/application-shared-a123.js';
const manifest = { 'pages/_app.js -> @/components/providers/OrganizationProviders': { files: [chunk, 'static/chunks/other.js'] } };
const page = (route = '/tasks', src = '/_next/static/chunks/webpack-hash.js', extra = '') => `<html><head><title>Same title</title></head><body><main>Keep me</main><script src="${src}" ${extra}></script><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ page: route })}</script></body></html>`;
describe('common application preload export', () => {
  it('resolves only the exact hashed public common chunk and rejects missing/ambiguous results', () => {
    expect(findCommonChunk(manifest)).toBe(chunk);
    expect(() => findCommonChunk({})).toThrow('found 0');
    expect(() => findCommonChunk({ ...manifest, 'another -> @/components/providers/OrganizationProviders': { files: ['static/chunks/application-shared-other.js'] } })).toThrow('found 2');
  });
  it('does not change public, registry, SSR application or error routes', () => {
    for (const route of ['/', '/docs', '/docs/[id]', '/about', '/create', '/explore', '/protocol', '/u', '/404', '/_error']) {
      expect(usesDeferredAccountBootstrap(route)).toBe(false);
      expect(transformExportHtml(page(route), chunk).html).toBe(page(route));
    }
    expect(usesDeferredAccountBootstrap('/treasury')).toBe(true);
    expect(usesDeferredAccountBootstrap('/future-org-page')).toBe(true);
  });
  it('adds only a low-priority link, preserving body, metadata and execution scripts', () => {
    const before = page();
    const result = transformExportHtml(before, chunk);
    expect(result.hinted).toBe(true);
    expect(result.html).toContain('fetchpriority="low"');
    expect(result.html.replace(/<link[^>]+\/>/, '')).toBe(before);
    expect(transformExportHtml(result.html, chunk).html).toBe(result.html);
  });
  it('reuses CDN/basePath/query/crossorigin and escapes HTML attributes', () => {
    const result = transformExportHtml(page('/tasks', 'https://cdn.example/app/_next/static/chunks/webpack-h.js?dpl=a&amp;x=b', 'crossorigin="anonymous" nonce="abc"'), chunk);
    expect(result.href).toBe(`https://cdn.example/app/_next/${chunk}?dpl=a&x=b`);
    expect(result.html).toContain('crossorigin="anonymous" nonce="abc"');
    expect(result.html).toContain('a&amp;x=b');
    expect(transformExportHtml(page('/tasks', '../../_next/static/chunks/webpack-h.js'), chunk).href).toBe(`../../_next/${chunk}`);
  });
  it('replaces old owned hints and removes them when opted out', () => {
    const original = page();
    const first = transformExportHtml(original, chunk).html;
    const next = transformExportHtml(first, 'static/chunks/application-shared-new.js').html;
    expect(next).not.toContain(chunk);
    expect(transformExportHtml(next, null, { enabled: false }).html).toBe(original);
  });
  it('does not duplicate a preload or executing script for the same URL', () => {
    for (const tag of [`<link rel="preload" as="script" href="/_next/${chunk}"/>`, `<script src="/_next/${chunk}"></script>`]) {
      const html = page().replace('</head>', `${tag}</head>`);
      expect(transformExportHtml(html, chunk).html).toBe(html);
    }
  });
  it('fails before unsafe edits when assets or export structure cannot be resolved', () => {
    expect(() => transformExportHtml(page('/tasks', '/wrong.js'), chunk)).toThrow('webpack runtime');
    expect(() => transformExportHtml(page(), '../invalid.js')).toThrow('Invalid common');
    expect(() => transformExportHtml(page().replace('</head>', ''), chunk)).toThrow('closing head');
    expect(transformExportHtml('<html></html>', chunk).hinted).toBe(false);
  });
});


describe('active deferred page preload', () => {
  const active = 'static/chunks/tasks-123.js';
  const shared = 'static/chunks/shared-456.js';
  const pageManifest = {
    'pages/_app.js -> @/components/providers/OrganizationProviders': { files: [chunk] },
    'pages/tasks/index.js -> @/components/TaskManager/TaskWorkspace': { files: [chunk, active, shared, active, 'static/css/task.css'] },
    'pages/voting/index.js -> @/features/VotingPage': { files: ['static/chunks/voting-only.js'] },
    'components/TaskManager/TaskWorkspace.jsx -> @/components/OptionalDialog': { files: ['static/chunks/optional-dialog.js'] },
  };
  it('selects only active direct entry files, without optional or other route chunks', () => {
    expect(findActivePageChunks(pageManifest, '/tasks')).toEqual([chunk, active, shared]);
    const result = transformExportHtml(page(), chunk, { manifest: pageManifest });
    expect(result.assets).toEqual([chunk, active, shared]);
    expect(result.hrefs).toHaveLength(3);
    expect(result.html).not.toContain('optional-dialog');
    expect(result.html).not.toContain('voting-only');
    expect(result.html).not.toContain('task.css');
    expect(transformExportHtml(result.html, chunk, { manifest: pageManifest }).html).toBe(result.html);
    expect(transformExportHtml(result.html, null, { enabled: false }).html).toBe(page());
  });
  it('deduplicates existing entry scripts and hints using the exact CDN/query/credentials', () => {
    const original = page('/tasks', 'https://cdn.example/base/_next/static/chunks/webpack-h.js?dpl=a&amp;x=b', 'crossorigin="use-credentials" nonce="token"')
      .replace('</head>', `<script src="https://cdn.example/base/_next/${active}?dpl=a&amp;x=b"></script></head>`);
    const result = transformExportHtml(original, chunk, { manifest: pageManifest });
    expect(result.hrefs).toEqual([chunk, shared].map((file) => `https://cdn.example/base/_next/${file}?dpl=a&x=b`));
    expect(result.html.match(/fetchpriority="low"/g)).toHaveLength(2);
    expect(result.html.match(/crossorigin="use-credentials" nonce="token"/g)).toHaveLength(3);
    expect(result.assets).toContain(active); // Disk validation also covers existing scripts.
  });
  it('skips nondeferred routes and missing entries without matching adjacent names', () => {
    for (const route of ['/', '/about', '/docs', '/create', '/tasks-other']) {
      expect(findActivePageChunks(pageManifest, route)).toEqual([]);
    }
  });
  it('rejects ambiguous active entries and unsafe asset paths', () => {
    expect(() => findActivePageChunks({ ...pageManifest, 'pages/tasks/index.js -> @/Other': { files: [active] } }, '/tasks')).toThrow('Ambiguous');
    for (const file of ['../outside.js', 'static/chunks/../../outside.js', 'https://other.example/script.js']) {
      expect(() => findActivePageChunks({ 'pages/tasks/index.js -> @/Task': { files: [file] } }, '/tasks')).toThrow('Invalid active');
    }
  });
});


it('preloads complete public provider entry before page dependencies, never Core', () => {
  const provider = 'static/chunks/public-provider.js';
  const active = 'static/chunks/tasks.js';
  const graph = {
    'pages/_app.js -> @/components/providers/OrganizationProviders': { files: [provider, chunk] },
    'components/providers/AccountRuntimeHost.jsx -> @/components/providers/CoreProviders': { files: ['static/chunks/wallet-core.js'] },
    'pages/tasks/index.js -> @/Task': { files: [active, provider, chunk] },
  };
  expect(findOrganizationProviderChunks(graph)).toEqual([provider, chunk]);
  const result = transformExportHtml(page(), chunk, { manifest: graph });
  expect(result.assets).toEqual([chunk, provider, active]);
  expect(result.hrefs).toEqual([chunk, provider, active].map((file) => `/_next/${file}`));
  expect(result.html).not.toContain('wallet-core');
});
