import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { absoluteMarkdown, generateDiscovery, writeDiscovery } from '../../scripts/generate-discovery.mjs';
import { generateSitemap } from '../../scripts/generate-sitemap.mjs';
import { checkSeo, inspectInternalLinks, inspectNoIndexHtml, inspectSeoHtml } from '../../scripts/check-seo.mjs';
import { getDocsArticleSchema } from '@/lib/docs.mjs';

const temporaryDirectories = [];
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'poa-discovery-'));
  temporaryDirectories.push(directory);
  const postsDirectory = path.join(directory, 'posts');
  fs.mkdirSync(postsDirectory);
  for (const [file, content] of Object.entries({
    'create.md': '---\ntitle: Start an organization\ndescription: Choose your shared rules.\ndate: "2026-05-01"\nupdated: "2026-09-06"\n---\n# Start an organization\n\nOrganize together with [Poa](/).\n\n![A studio](/images/docs/studio.webp)\n\n## Voting\n\nChoose rules that work for you.',
    'join.md': '---\ntitle: Join a group\n---\nRead the rules and join an organization.',
    'task-manager.md': '---\ndraft: true\n---\nSecret draft task guide.',
    'perpetualOrganization.md': 'Retired old guide.',
    'unlisted.md': 'Private unlisted guide.',
  })) fs.writeFileSync(path.join(postsDirectory, file), content);
  return { directory, postsDirectory };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('machine-readable published documentation', () => {
  it('exports only the public catalog and derives authored metadata and content from it', () => {
    const { postsDirectory } = fixture();
    const first = generateDiscovery(postsDirectory);
    const second = generateDiscovery(postsDirectory);
    expect(first).toEqual(second);
    expect(first.posts.map(post => post.id)).toEqual(['create', 'join']);
    expect(Object.keys(first.files).sort()).toEqual(['docs/create.md', 'docs/join.md', 'llms-full.txt', 'llms.txt']);
    expect(first.files['docs/create.md']).toContain('date: "2026-05-01"\nupdated: "2026-09-06"');
    expect(first.files['docs/create.md']).toContain('source_url: "https://poa.box/docs/create/"');
    expect(first.files['docs/create.md']).toContain('[Poa](https://poa.box/)');
    expect(first.files['docs/create.md']).toContain('https://poa.box/images/docs/studio.webp');
    expect(first.files['docs/join.md']).not.toMatch(/^date:|^updated:/m);
    expect(first.files['docs/join.md']).toContain('# Join a group');
    expect(first.files['llms.txt']).toContain('[Start an organization](https://poa.box/docs/create.md)');
    expect(first.files['llms-full.txt']).toContain('Source: https://poa.box/docs/create/\nPublished: 2026-05-01\nUpdated: 2026-09-06');
    expect(first.files['llms-full.txt']).not.toMatch(/Secret draft|Retired old|Private unlisted/);
    expect(generateSitemap(postsDirectory).postCount).toBe(first.posts.length);
  });

  it('resolves real Markdown links and definitions without changing code examples', () => {
    const markdown = '[join](../join#entry) [old](/blog/perpetualOrganization) [section](#rules) [repo](https://github.com/poa-box/Poa-frontend)\n\n![image](./photo.webp "Caption")\n\n[reference][data]\n\n[data]: /docs/TheGraph\n\n```md\n[example](/unresolved)\n```\n\nInline `[example](/unchanged)`';
    const result = absoluteMarkdown(markdown, 'https://poa.box/docs/create/');
    expect(result).toContain('https://poa.box/docs/join/#entry');
    expect(result).toContain('https://poa.box/docs/what-is-poa/');
    expect(result).toContain('https://poa.box/docs/create/#rules');
    expect(result).toContain('https://poa.box/docs/create/photo.webp "Caption"');
    expect(result).toContain('[data]: https://poa.box/docs/TheGraph/');
    expect(result).toContain('[example](/unresolved)');
    expect(result).toContain('`[example](/unchanged)`');
  });

  it('uses the same metadata heading and heading levels as the HTML article', () => {
    const result = absoluteMarkdown('# Old title\n\nA paragraph.\n\n# A section\n\n```md\n# An example\n```', 'https://poa.box/docs/create/', { title: 'Updated title' });
    expect(result.startsWith('# Updated title\n')).toBe(true);
    expect(result).not.toContain('Old title');
    expect(result).toContain('## A section');
    expect(result).toContain('```md\n# An example\n```');
  });

  it('removes obsolete generated guides while retaining other public assets', () => {
    const { directory, postsDirectory } = fixture();
    const publicDirectory = path.join(directory, 'public');
    writeDiscovery(publicDirectory, generateDiscovery(postsDirectory));
    fs.writeFileSync(path.join(publicDirectory, 'docs', 'retired.md'), '# Retired');
    fs.writeFileSync(path.join(publicDirectory, 'docs', 'figure.svg'), '<svg/>');
    fs.writeFileSync(path.join(postsDirectory, 'join.md'), '---\ndraft: true\n---\nA private revision.');
    writeDiscovery(publicDirectory, generateDiscovery(postsDirectory));
    expect(fs.existsSync(path.join(publicDirectory, 'docs', 'join.md'))).toBe(false);
    expect(fs.existsSync(path.join(publicDirectory, 'docs', 'retired.md'))).toBe(false);
    expect(fs.existsSync(path.join(publicDirectory, 'docs', 'figure.svg'))).toBe(true);
  });
});

const html = (url, doc) => `<html><head><title>${doc?.title || `Poa ${url}`}</title><meta name="description" content="${doc?.description || `Organize together: ${url}`}"><meta name="robots" content="index, follow"><meta property="og:url" content="${url}"><link rel="canonical" href="${url}"><link rel="alternate" href="https://poa.box/llms.txt">${doc ? `<link rel="alternate" type="text/markdown" href="https://poa.box/docs/${doc.id}.md"><script type="application/ld+json">${JSON.stringify(getDocsArticleSchema(doc)[0])}</script>` : ''}</head><body><h1>${doc?.title || 'Organize together'}</h1><div class="article-content"><p>Members share ownership and decisions.</p></div></body></html>`;

function exportedFixture() {
  const { directory, postsDirectory } = fixture();
  const exportDirectory = path.join(directory, 'out');
  const discovery = generateDiscovery(postsDirectory);
  const sitemap = generateSitemap(postsDirectory);
  writeDiscovery(exportDirectory, discovery);
  fs.writeFileSync(path.join(exportDirectory, 'sitemap.xml'), sitemap.xml);
  const bots = ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User'];
  fs.writeFileSync(path.join(exportDirectory, 'robots.txt'), `${bots.map(bot => `User-agent: ${bot}\nAllow: /`).join('\n\n')}\nSitemap: https://poa.box/sitemap.xml\n`);
  for (const [, url] of sitemap.xml.matchAll(/<loc>(.*?)<\/loc>/g)) {
    const pathname = new URL(url).pathname;
    const file = path.join(exportDirectory, pathname, 'index.html');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const doc = discovery.posts.find(post => pathname === `/docs/${post.id}/`);
    fs.writeFileSync(file, html(url, doc));
  }
  return { exportDirectory, postsDirectory };
}

describe('production SEO artifact guard', () => {
  it('rejects crawler-visible regressions in canonical, indexability, content and schema', () => {
    const doc = { id: 'create', title: 'Start an organization', description: 'Choose rules.', date: '2026-05-01', updated: '2026-09-06' };
    const url = 'https://poa.box/docs/create/';
    const valid = html(url, doc);
    expect(inspectSeoHtml(valid, url, { doc })).toEqual([]);
    expect(inspectSeoHtml(valid.replace('content="index, follow"', 'content="noindex, follow"'), url, { doc })).toContain('sitemap page is not indexable');
    expect(inspectSeoHtml(valid.replace('rel="canonical"', 'rel="other"'), url, { doc })).toContain('missing, duplicate, or incorrect canonical URL');
    expect(inspectSeoHtml(valid.replace('<h1>', '<h2>').replace('</h1>', '</h2>'), url, { doc })).toContain('page must have one readable H1 in exported HTML');
    expect(inspectSeoHtml(valid.replace('article-content', 'empty-shell'), url, { doc })).toContain('documentation body is absent from exported HTML');
    expect(inspectSeoHtml(valid.replace('{"@context"', '{invalid:"@context"'), url, { doc })).toContain('invalid JSON-LD');
    expect(inspectSeoHtml(valid.replace('2026-09-06', '2099-01-01'), url, { doc })).toContain('article schema does not preserve authored dates');
    expect(inspectSeoHtml(valid.replace('</head>', '<title>Another title</title></head>'), url)).toContain('missing, duplicate, or empty page title');
    expect(inspectSeoHtml(valid.replace('</head>', '<meta name="description" content="Another description"></head>'), url)).toContain('missing, duplicate, or empty description');
    expect(inspectSeoHtml(valid.replace('</body>', '<svg><title>Accessible illustration</title></svg></body>'), url, { doc })).toEqual([]);
  });

  it('checks the completed export and fails for stale or unpublished discovery artifacts', () => {
    const { exportDirectory, postsDirectory } = exportedFixture();
    expect(checkSeo({ exportDirectory, postsDirectory })).toEqual({ urlCount: 8, postCount: 2, artifactCount: 4, noIndexCount: 0 });
    fs.writeFileSync(path.join(exportDirectory, 'llms.txt'), 'Stale index');
    fs.writeFileSync(path.join(exportDirectory, 'docs', 'unlisted.md'), 'Unlisted content');
    expect(() => checkSeo({ exportDirectory, postsDirectory })).toThrow('llms.txt: exported documentation is stale');
    expect(() => checkSeo({ exportDirectory, postsDirectory })).toThrow('Unpublished Markdown was exported: docs/unlisted.md');
  });

  it('requires non-sitemap application, redirect and error exports to remain noindex', () => {
    const options = exportedFixture();
    for (const file of ['tasks/index.html', 'browser/index.html', 'blog/create/index.html', '500.html']) {
      const target = path.join(options.exportDirectory, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, '<html><head></head><body>Loading</body></html>');
      expect(() => checkSeo(options)).toThrow(`${file}: page outside the public sitemap must declare noindex`);
      fs.writeFileSync(target, '<html><head><meta name="robots" content="noindex, follow"></head></html>');
    }
    expect(checkSeo(options).noIndexCount).toBe(4);
    expect(inspectNoIndexHtml('<html><head><meta name="googlebot" content="noindex"></head></html>')).not.toEqual([]);
    expect(inspectNoIndexHtml('<html><head><meta name="robots" content="none"></head></html>')).toEqual([]);
  });

  it('requires real head metadata instead of noindex text inside examples or inert markup', () => {
    const noindex = '<meta name="robots" content="noindex">';
    for (const example of [noindex, `<template>${noindex}</template>`, `<script>const example = '${noindex}'</script>`, `<!--${noindex}-->`]) {
      expect(inspectNoIndexHtml(`<html><head></head><body>${example}</body></html>`)).not.toEqual([]);
    }
    for (const example of [`<template>${noindex}</template>`, `<script>const example = '${noindex}'</script>`, `<!--${noindex}-->`]) {
      expect(inspectNoIndexHtml(`<html><head>${example}</head><body></body></html>`)).not.toEqual([]);
    }
  });

  it('rejects duplicate titles and descriptions across canonical public pages', () => {
    const options = exportedFixture();
    const target = path.join(options.exportDirectory, 'about/index.html');
    fs.writeFileSync(target, html('https://poa.box/about/').replace('Poa https://poa.box/about/', 'Poa https://poa.box/'));
    expect(() => checkSeo(options)).toThrow('duplicate title shared with https://poa.box/');
    fs.writeFileSync(target, html('https://poa.box/about/').replace('Organize together: https://poa.box/about/', 'Organize together: https://poa.box/'));
    expect(() => checkSeo(options)).toThrow('duplicate description shared with https://poa.box/');
  });

  it('checks exported internal destinations without treating queries or fragments as separate app routes', () => {
    const files = new Set(['index.html', 'docs/create/index.html', 'docs/create.md', 'tasks/index.html', 'images/guide.webp', '404.html']);
    const links = ['#voting', '/tasks?userDAO=42&view=list#task-7', '/tasks/?userDAO=42', './index.html', '/images/guide.webp', '../create.md', '/404', '/404/', '/404.html', 'https://poa.box/', 'https://external.example/missing', 'mailto:hello@example.com'];
    const valid = links.map(href => `<a href="${href.replace(/&/g, '&amp;')}">Read more</a>`).join('');
    expect(inspectInternalLinks(valid, 'https://poa.box/docs/create/', files)).toEqual([]);
    expect(inspectInternalLinks('<a href="/docs/missing/">Missing guide</a><a href="/images/missing.webp">Missing asset</a>', 'https://poa.box/', files)).toEqual([
      'broken internal link: /docs/missing/', 'broken internal link: /images/missing.webp',
    ]);
    const options = exportedFixture();
    const target = path.join(options.exportDirectory, 'index.html');
    fs.writeFileSync(target, html('https://poa.box/').replace('</body>', '<a href="/docs/missing/">Guide</a></body>'));
    expect(() => checkSeo(options)).toThrow('https://poa.box/: broken internal link: /docs/missing/');
  });
});
