import { readInitialTaskView, selectInitialTaskView } from '../tasks/initialTaskView.mjs';
import { usesDeferredAccountBootstrap } from '../applicationRoutes.mjs';

export const PRELOAD_MARKER = 'data-poa-common-preload';

function decodeAttribute(value) {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function escapeAttribute(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function attributes(tag) {
  const body = tag.replace(/^<[^\s>]+\s*/, '').replace(/\/?>$/, '');
  return Object.fromEntries([...body.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)]
    .map((match) => [match[1].toLowerCase(), decodeAttribute(match[2] ?? match[3] ?? match[4] ?? '')]));
}

/** Resolve the build's actual common chunk; never silently choose a stale hash. */
export function findCommonChunk(manifest) {
  const entries = Object.entries(manifest).filter(([key]) => key.endsWith(' -> @/components/providers/OrganizationProviders'));
  const files = [...new Set(entries.flatMap(([, value]) => value.files || [])
    .filter((file) => /^static\/chunks\/application-shared[.-][\w.-]+\.js$/.test(file)))];
  if (files.length !== 1) throw new Error(`Expected exactly one public application-shared chunk; found ${files.length}.`);
  return files[0];
}

/** Public provider dependencies precede page hints so account-free reads start first. */
export function findOrganizationProviderChunks(manifest) {
  if (!manifest) return [];
  const entries = Object.entries(manifest).filter(([key]) => key.endsWith(' -> @/components/providers/OrganizationProviders'));
  if (entries.length !== 1) throw new Error(`Expected one organization provider entry; found ${entries.length}.`);
  return validateJavaScriptFiles(entries[0][1].files || []);
}

function validateJavaScriptFiles(files) {
  const unique = [...new Set(files.filter((file) => file.endsWith('.js')))];
  for (const file of unique) {
    if (!/^static\/chunks\/[\w./-]+\.js$/.test(file) || file.split('/').some((part) => part === '.' || part === '..')) {
      throw new Error(`Invalid active page chunk path: ${file}`);
    }
  }
  return unique;
}

/** Only this route's direct deferred entry; never walk optional or other-page entries. */
export function findActivePageChunks(manifest, route) {
  if (!manifest || !usesDeferredAccountBootstrap(route)) return [];
  const prefix = `pages${route}/index.js -> `;
  const entries = Object.entries(manifest).filter(([key]) => key.startsWith(prefix));
  if (entries.length > 1) throw new Error(`Ambiguous active page entry for ${route}.`);
  return validateJavaScriptFiles(entries[0]?.[1]?.files || []);
}

export const TASK_VIEW_MARKER = 'data-poa-task-view-preload';
export function findTaskViewChunks(manifest) {
  const targets = {
    mobile: '@/components/TaskManager/TaskBoardMobile',
    desktop: '@/components/TaskManager/TaskBoardDesktop',
    list: '@/components/TaskManager/views/list/ListView',
    gantt: '@/components/TaskManager/views/gantt/GanttView',
  };
  const entries = Object.entries(manifest || {}).filter(([key]) => key.startsWith('components/TaskManager/views/lazyTaskViews.jsx -> '));
  if (!entries.length) return {};
  return Object.fromEntries(Object.entries(targets).map(([view, target]) => {
    const matches = entries.filter(([key]) => key === `components/TaskManager/views/lazyTaskViews.jsx -> ${target}`);
    if (matches.length !== 1) throw new Error(`Expected one initial task ${view} entry.`);
    const files = validateJavaScriptFiles(matches[0][1].files || []);
    if (!files.length) throw new Error(`Missing initial task ${view} files.`);
    return [view, files];
  }));
}

function preloadTaskView(config, select, read) {
  try {
    const selected = read(select, window);
    for (const href of config.views[selected] || []) {
      const link = document.createElement('link');
      link.href = href;
      const exists = [...document.querySelectorAll('script[src],link[rel="preload"][as="script"]')]
        .some((node) => (node.src || node.href) === link.href);
      if (exists) continue;
      link.rel = 'preload';
      link.as = 'script';
      link.setAttribute('fetchpriority', 'low');
      link.setAttribute('data-poa-task-view-preload', 'true');
      for (const name of ['crossorigin', 'nonce']) {
        if (name in config.credentials) link.setAttribute(name, config.credentials[name]);
      }
      document.head.appendChild(link);
    }
  } catch { /* Hints never replace the normal module loader or its retry UI. */ }
}

/** Plan idempotent resource hints; the browser never executes feature code through these hints. */
export function transformExportHtml(html, chunk, { enabled = true, manifest } = {}) {
  const clean = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (tag) => TASK_VIEW_MARKER in attributes(tag.slice(0, tag.indexOf('>') + 1)) ? '' : tag)
    .replace(/<link\b[^>]*>/gi, (tag) => PRELOAD_MARKER in attributes(tag) || TASK_VIEW_MARKER in attributes(tag) ? '' : tag);
  if (!enabled) return { html: clean, route: null, hinted: false };
  const dataTag = [...clean.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .find((match) => attributes(`<script ${match[1]}>`).id === '__NEXT_DATA__');
  if (!dataTag) return { html: clean, route: null, hinted: false };
  const { page: route } = JSON.parse(dataTag[2]);
  if (!usesDeferredAccountBootstrap(route)) return { html: clean, route, hinted: false };
  if (!/^static\/chunks\/application-shared[.-][\w.-]+\.js$/.test(chunk || '')) throw new Error('Invalid common chunk path.');

  const scripts = [...clean.matchAll(/<script\b[^>]*>/gi)].map((match) => attributes(match[0]));
  // Reuse the exported webpack script's exact asset prefix, including CDN,
  // basePath or relative gateway paths. Its deployment query and credentials
  // must match the later webpack chunk request for preload-cache reuse.
  const runtimeScripts = scripts.map((attrs) => ({ attrs, match: attrs.src?.match(/^(.*\/_next\/)static\/chunks\/webpack[^/?#]*\.js(\?[^#]*)?$/) }))
    .filter((entry) => entry.match);
  if (runtimeScripts.length !== 1) throw new Error(`Expected one webpack runtime script for ${route}; found ${runtimeScripts.length}.`);
  const { attrs, match } = runtimeScripts[0];
  const assets = [...new Set([chunk, ...findOrganizationProviderChunks(manifest), ...findActivePageChunks(manifest, route)])];
  const existing = new Set([...clean.matchAll(/<(?:script|link)\b[^>]*>/gi)].flatMap((entry) => {
    const attr = attributes(entry[0]);
    return attr.src ? [attr.src] : attr.rel === 'preload' && attr.as === 'script' ? [attr.href] : [];
  }));
  const hrefs = assets.map((file) => `${match[1]}${file}${match[2] || ''}`).filter((href) => !existing.has(href));
  const viewFiles = route === '/tasks' ? findTaskViewChunks(manifest) : {};
  const views = Object.fromEntries(Object.entries(viewFiles).map(([view, files]) => [view, files.map((file) => `${match[1]}${file}${match[2] || ''}`)]));
  const viewAssets = [...new Set(Object.values(viewFiles).flat())];
  if (!hrefs.length && !viewAssets.length) return { html: clean, route, hinted: false, assets, hrefs };
  if ((clean.match(/<\/head>/gi) || []).length !== 1) throw new Error(`Expected one closing head tag for ${route}.`);
  const credentials = ['crossorigin', 'nonce'].filter((name) => name in attrs)
    .map((name) => ` ${name}="${escapeAttribute(attrs[name])}"`).join('');
  const taskConfig = { views, credentials: Object.fromEntries(['crossorigin', 'nonce'].filter((name) => name in attrs).map((name) => [name, attrs[name]])) };
  const payload = JSON.stringify(taskConfig).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const viewScript = viewAssets.length ? `<script ${TASK_VIEW_MARKER}="true"${credentials}>(${preloadTaskView.toString()})(${payload},${selectInitialTaskView.toString()},${readInitialTaskView.toString()})</script>` : '';
  const hints = hrefs.map((href) => `<link rel="preload" as="script" href="${escapeAttribute(href)}" fetchpriority="low" ${PRELOAD_MARKER}="true"${credentials}/>`).join('');
  return { html: clean.replace(/<\/head>/i, `${hints}${viewScript}</head>`), route, hinted: true, href: hrefs[0], hrefs, assets: [...new Set([...assets, ...viewAssets])] };
}
