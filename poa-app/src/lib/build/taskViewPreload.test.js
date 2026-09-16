import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { selectInitialTaskView, readInitialTaskView } from '@/lib/tasks/initialTaskView.mjs';
import { transformExportHtml, findTaskViewChunks } from './commonPreload.mjs';
const chunk = 'static/chunks/application-shared-hash.js';
const targets = { list: 'views/list/ListView', gantt: 'views/gantt/GanttView', mobile: 'TaskBoardMobile', desktop: 'TaskBoardDesktop' };
const manifest = {
 'pages/_app.js -> @/components/providers/OrganizationProviders': { files: [chunk] },
 ...Object.fromEntries(Object.entries(targets).map(([view, target]) => [`components/TaskManager/views/lazyTaskViews.jsx -> @/components/TaskManager/${target}`, { files: [`static/chunks/${view}-hash.js`, 'static/chunks/shared-hash.js'] }])),
};
const html = (route = '/tasks') => `<html><head><script src="https://cdn.test/base/_next/static/chunks/webpack-h.js?x=a&amp;y=b" nonce="nonce" crossorigin="anonymous"></script></head><body>Unchanged<script id="__NEXT_DATA__">${JSON.stringify({ page: route })}</script></body></html>`;
function execute(script, search, storedMode, mobile) {
 const links = [];
 const window = { URLSearchParams, location: { search }, localStorage: { getItem: () => storedMode }, matchMedia: () => ({ matches: mobile }) };
 const document = { createElement: () => ({ setAttribute(name, value) { this[name] = value; } }), querySelectorAll: () => links, head: { appendChild: (node) => links.push(node) } };
 vm.runInNewContext(script, { window, document });
 return links;
}
describe('selected task view hints', () => {
 it('matches URL, storage, device and cross-project initial rendering rules', () => {
  expect(selectInitialTaskView({ isMobile: true, view: 'board', storedMode: 'gantt' })).toBe('list');
  expect(selectInitialTaskView({ isMobile: true, projectId: 'project', view: 'board' })).toBe('mobile');
  expect(selectInitialTaskView({ projectId: 'project', view: 'gantt' })).toBe('gantt');
  expect(selectInitialTaskView({ projectId: '__all__', storedMode: 'board' })).toBe('list');
  expect(selectInitialTaskView({ storedMode: 'list' })).toBe('list');
  expect(selectInitialTaskView({ projectId: '__mine__' })).toBeNull();
  expect(selectInitialTaskView({ isMobile: true, task: 'task', storedMode: 'board' })).toBe('mobile');
  expect(readInitialTaskView(selectInitialTaskView, { URLSearchParams, location: { search: '?view=board&view=list' } })).toBeNull();
 });
 it('creates only selected nonexecuting links with exact deployment attributes', () => {
  const result = transformExportHtml(html(), chunk, { manifest });
  const script = result.html.match(/<script data-poa-task-view-preload[^>]*>([\s\S]*?)<\/script>/)[1];
  const links = execute(script, '', 'board', true);
  expect(links.map(x => x.href)).toEqual(['list-hash.js', 'shared-hash.js'].map(x => `https://cdn.test/base/_next/static/chunks/${x}?x=a&y=b`));
  expect(links.every(x => x.rel === 'preload' && x.as === 'script' && x.nonce === 'nonce' && x.crossorigin === 'anonymous')).toBe(true);
  expect(execute(script, '?projectId=p&view=gantt', 'board', false)[0].href).toContain('gantt-hash');
  expect(execute(script, '?projectId=__mine__', 'board', false)).toEqual([]);
  expect(execute(script, '?view=list&view=board', 'list', true)).toEqual([]);
 });
 it('is task-only, idempotent, removable and rejects unsafe or incomplete manifests', () => {
  const first = transformExportHtml(html(), chunk, { manifest }).html;
  expect(transformExportHtml(first, chunk, { manifest }).html).toBe(first);
  expect(transformExportHtml(first, null, { enabled: false }).html).toBe(html());
  expect(transformExportHtml(html('/voting'), chunk, { manifest }).html).not.toContain('data-poa-task-view-preload');
  expect(transformExportHtml(html('/create'), chunk, { manifest }).html).toBe(html('/create'));
  const key = Object.keys(manifest).find(k => k.endsWith('/TaskBoardMobile'));
  expect(() => findTaskViewChunks({ ...manifest, [key]: { files: ['static/chunks/../bad.js'] } })).toThrow('Invalid');
  const missing = { ...manifest }; delete missing[key];
  expect(() => findTaskViewChunks(missing)).toThrow('initial task mobile');
 });
 it('escapes script-breaking asset values without changing the runtime URL', () => {
  const result = transformExportHtml(html().replace('?x=a&amp;y=b', '?x=&lt;/script&gt;'), chunk, { manifest });
  const script = result.html.match(/<script data-poa-task-view-preload[^>]*>([\s\S]*?)<\/script>/)[1];
  expect(script).not.toContain('</script>');
  expect(execute(script, '', null, true)[0].href).toContain('?x=</script>');
 });
});
