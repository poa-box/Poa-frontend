import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCS_SITE_URL, canonicalDocPath } from '../src/lib/docs.mjs';
import { PUBLIC_INDEXABLE_ROUTES } from '../src/lib/seo.mjs';
import { generateDiscovery, readPublishedDocs, writeDiscovery } from './generate-discovery.mjs';

const escapeXml = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Use the same curated catalog and authored dates as the docs renderer.
// Redirects, legacy blog duplicates, drafts, and unlisted files are excluded.
export function generateSitemap(postsDirectory = path.join(process.cwd(), 'posts')) {
  const posts = readPublishedDocs(postsDirectory);
  const entry = (pathname, updated) => [
    '  <url>',
    `    <loc>${escapeXml(`${DOCS_SITE_URL}${pathname}`)}</loc>`,
    ...(updated ? [`    <lastmod>${updated}</lastmod>`] : []),
    '  </url>',
  ].join('\n');
  const urls = [
    ...PUBLIC_INDEXABLE_ROUTES.map(route => entry(route)),
    ...posts.map(post => entry(canonicalDocPath(post.id), post.updated)),
  ];
  return {
    postCount: posts.length,
    urlCount: urls.length,
    xml: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { xml, postCount, urlCount } = generateSitemap();
  fs.writeFileSync(path.join(process.cwd(), 'public', 'sitemap.xml'), xml);
  writeDiscovery(path.join(process.cwd(), 'public'), generateDiscovery());
  console.log(`Discovery generated: ${postCount} guides, ${urlCount} canonical URLs, Markdown downloads and llms files`);
}
