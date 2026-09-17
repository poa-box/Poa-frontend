import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCS_SITE_URL, canonicalDocPath } from '../src/lib/docs.mjs';
import { generateDiscovery } from './generate-discovery.mjs';
import { generateSitemap } from './generate-sitemap.mjs';

function decodeHtml(value) {
  return value.replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, decimal) =>
    String.fromCodePoint(Number.parseInt(hex || decimal, hex ? 16 : 10)),
  ).replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    result[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3]);
  }
  return result;
}

const visibleText = html => decodeHtml(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const withoutScripts = html => html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(match => attributes(match[0]));
const blocksIndexing = content => /(?:^|[\s,])(noindex|none)(?:$|[\s,])/i.test(content || '');

function headMetadata(html) {
  const activeHtml = html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  return activeHtml.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';
}

function pageMetadata(html) {
  const head = headMetadata(html);
  return {
    titles: [...head.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map(match => visibleText(match[1])),
    descriptions: tags(head, 'meta').filter(meta => meta.name?.toLowerCase() === 'description').map(meta => meta.content?.trim() || ''),
  };
}

export function inspectNoIndexHtml(html) {
  return tags(headMetadata(html), 'meta').some(meta => meta.name?.toLowerCase() === 'robots' && blocksIndexing(meta.content))
    ? [] : ['page outside the public sitemap must declare noindex'];
}

function exportedFiles(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.posix.join(prefix, entry.name);
    return entry.isDirectory() ? exportedFiles(path.join(directory, entry.name), file) : [file];
  });
}

// Query parameters select app state, and fragments may be filled after hydration.
// Check the underlying local route/file without evaluating either as a new page.
export function inspectInternalLinks(html, pageUrl, files) {
  const errors = [];
  const hrefs = new Set(tags(withoutScripts(html), 'a').map(link => link.href).filter(Boolean));
  for (const href of hrefs) {
    let url;
    try { url = new URL(href, pageUrl); } catch { errors.push(`invalid link: ${href}`); continue; }
    if (url.origin !== DOCS_SITE_URL) continue;
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { errors.push(`invalid link: ${href}`); continue; }
    const file = pathname.replace(/^\//, '');
    const candidates = pathname.endsWith('/') ? [`${file}index.html`] : [file, `${file}/index.html`];
    if (['/404', '/404/'].includes(pathname)) candidates.push('404.html');
    if (!candidates.some(candidate => files.has(candidate))) errors.push(`broken internal link: ${href}`);
  }
  return errors;
}

// Next's static export emits quoted attributes. Inspect the actual HTML a
// non-JavaScript crawler receives, excluding scripts and styles from body checks.
export function inspectSeoHtml(html, expectedUrl, { doc } = {}) {
  const errors = [];
  const head = headMetadata(html);
  const links = tags(head, 'link');
  const metas = tags(head, 'meta');
  const canonicals = links.filter(link => link.rel === 'canonical');
  if (canonicals.length !== 1 || canonicals[0].href !== expectedUrl) errors.push('missing, duplicate, or incorrect canonical URL');
  const { titles, descriptions } = pageMetadata(html);
  if (titles.length !== 1 || !titles[0]) errors.push('missing, duplicate, or empty page title');
  if (descriptions.length !== 1 || !descriptions[0]) errors.push('missing, duplicate, or empty description');
  const robots = metas.filter(meta => ['robots', 'googlebot', 'bingbot'].includes(meta.name?.toLowerCase()));
  if (!robots.length || robots.some(meta => blocksIndexing(meta.content))) errors.push('sitemap page is not indexable');
  if (!metas.some(meta => meta.property === 'og:url' && meta.content === expectedUrl)) errors.push('Open Graph URL does not match canonical');
  if (!links.some(link => link.rel === 'alternate' && link.href === `${DOCS_SITE_URL}/llms.txt`)) errors.push('missing AI documentation discovery link');
  const body = withoutScripts(html);
  const headings = [...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  if (headings.length !== 1 || !visibleText(headings[0][1])) errors.push('page must have one readable H1 in exported HTML');
  const schemas = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (attributes(match[1]).type !== 'application/ld+json') continue;
    try {
      const schema = JSON.parse(match[2]);
      if (!schema || typeof schema !== 'object') throw new Error('not an object');
      schemas.push(...(Array.isArray(schema) ? schema : [schema]));
    } catch {
      errors.push('invalid JSON-LD');
    }
  }
  if (doc) {
    if (!links.some(link => link.rel === 'alternate' && link.type === 'text/markdown' && link.href === `${DOCS_SITE_URL}/docs/${doc.id}.md`)) errors.push('missing guide Markdown alternate');
    if (!/class="[^"]*\barticle-content\b/.test(body) || !/<p\b/.test(body)) errors.push('documentation body is absent from exported HTML');
    const article = schemas.find(schema => schema['@type'] === 'TechArticle');
    if (!article || article.url !== expectedUrl || article.headline !== doc.title) errors.push('missing or incorrect article schema');
    if (article && (article.datePublished !== (doc.date || undefined) || article.dateModified !== (doc.updated || undefined))) errors.push('article schema does not preserve authored dates');
  }
  return errors;
}

export function checkSeo({ exportDirectory = path.resolve('out'), postsDirectory = path.resolve('posts') } = {}) {
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  const read = file => {
    const absolute = path.join(exportDirectory, file);
    if (!fs.existsSync(absolute)) {
      errors.push(`Missing exported artifact: ${file}`);
      return '';
    }
    return fs.readFileSync(absolute, 'utf8');
  };
  const sitemap = generateSitemap(postsDirectory);
  const xml = read('sitemap.xml');
  check(xml === sitemap.xml, 'Exported sitemap differs from the current published catalog');
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => decodeHtml(match[1]));
  check(new Set(urls).size === urls.length, 'Sitemap contains duplicate URLs');
  const discovery = generateDiscovery(postsDirectory);
  const docsByUrl = new Map(discovery.posts.map(post => [`${DOCS_SITE_URL}${canonicalDocPath(post.id)}`, post]));
  const files = new Set(fs.existsSync(exportDirectory) ? exportedFiles(exportDirectory) : []);
  const indexableFiles = new Set();
  const metadataOwners = { titles: new Map(), descriptions: new Map() };
  for (const url of urls) {
    const parsed = new URL(url);
    check(parsed.origin === DOCS_SITE_URL && !parsed.search && !parsed.hash, `${url}: noncanonical sitemap location`);
    const file = `${parsed.pathname.replace(/^\//, '')}index.html`;
    indexableFiles.add(file);
    const html = read(file);
    if (!html) continue;
    for (const error of [...inspectSeoHtml(html, url, { doc: docsByUrl.get(url) }), ...inspectInternalLinks(html, url, files)]) errors.push(`${url}: ${error}`);
    for (const [kind, values] of Object.entries(pageMetadata(html))) {
      const value = values[0]?.replace(/\s+/g, ' ').trim().toLowerCase();
      if (!value) continue;
      const previous = metadataOwners[kind].get(value);
      check(!previous, `${url}: duplicate ${kind === 'titles' ? 'title' : 'description'} shared with ${previous}`);
      metadataOwners[kind].set(value, url);
    }
  }
  const excludedHtml = [...files].filter(file => file.endsWith('.html') && !indexableFiles.has(file));
  for (const file of excludedHtml) {
    for (const error of inspectNoIndexHtml(read(file))) errors.push(`${file}: ${error}`);
  }
  for (const [file, expected] of Object.entries(discovery.files)) {
    check(read(file) === expected, `${file}: exported documentation is stale or differs from its published source`);
  }
  const docsDirectory = path.join(exportDirectory, 'docs');
  if (fs.existsSync(docsDirectory)) {
    for (const file of fs.readdirSync(docsDirectory)) {
      if (file.endsWith('.md')) check(Object.hasOwn(discovery.files, `docs/${file}`), `Unpublished Markdown was exported: docs/${file}`);
    }
  }
  const robots = read('robots.txt');
  check(robots.includes(`Sitemap: ${DOCS_SITE_URL}/sitemap.xml`), 'robots.txt must advertise the canonical sitemap');
  for (const bot of ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User']) {
    check(new RegExp(`User-agent: ${bot}\\s+Allow: /(?:\\s|$)`, 'i').test(robots), `${bot} must be explicitly allowed to discover public pages`);
  }
  if (errors.length) throw new Error(`SEO artifact checks failed:\n${errors.map(error => `- ${error}`).join('\n')}`);
  return { urlCount: urls.length, postCount: discovery.posts.length, artifactCount: Object.keys(discovery.files).length, noIndexCount: excludedHtml.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkSeo();
    console.log(`[seo] Checked ${result.urlCount} canonical HTML pages, ${result.noIndexCount} noindex pages, ${result.postCount} guides and ${result.artifactCount} discovery artifacts, including public metadata uniqueness and internal links.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
