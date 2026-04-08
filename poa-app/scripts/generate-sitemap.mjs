import fs from 'fs';
import path from 'path';

const SITE_URL = 'https://poa.box';
const POSTS_DIR = path.join(process.cwd(), 'posts');
const OUTPUT = path.join(process.cwd(), 'public', 'sitemap.xml');
const TEST_FILES = new Set(['test', 'test2', 'letsSee']);

const today = new Date().toISOString().split('T')[0];

// Simple frontmatter parser (avoids gray-matter dependency)
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const data = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      data[key] = val;
    }
  }
  return data;
}

// Static public routes
const staticRoutes = [
  { path: '/',          priority: '1.00', changefreq: 'weekly' },
  { path: '/about/',    priority: '0.80', changefreq: 'monthly' },
  { path: '/docs/',     priority: '0.90', changefreq: 'weekly' },
  { path: '/browser/',  priority: '0.70', changefreq: 'weekly' },
  { path: '/protocol/', priority: '0.70', changefreq: 'weekly' },
  { path: '/create/',   priority: '0.80', changefreq: 'monthly' },
];

// Read posts and extract metadata
const postFiles = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
const posts = postFiles
  .map(f => {
    const id = f.replace(/\.md$/, '');
    if (TEST_FILES.has(id)) return null;
    const content = fs.readFileSync(path.join(POSTS_DIR, f), 'utf8');
    if (content.trim().length === 0) return null;
    const data = parseFrontmatter(content);
    const date = data.date
      ? new Date(data.date).toISOString().split('T')[0]
      : today;
    return { id, date };
  })
  .filter(Boolean);

// Build XML
const urlEntry = (loc, lastmod, changefreq, priority) =>
  `<url>\n  <loc>${SITE_URL}${loc}</loc>\n  <lastmod>${lastmod}</lastmod>\n  <changefreq>${changefreq}</changefreq>\n  <priority>${priority}</priority>\n</url>`;

const urls = [
  '<!-- Static pages -->',
  ...staticRoutes.map(r => urlEntry(r.path, today, r.changefreq, r.priority)),
  '',
  '<!-- Documentation pages -->',
  ...posts.map(p => urlEntry(`/docs/${p.id}/`, p.date, 'monthly', '0.70')),
  '',
  '<!-- Blog pages -->',
  ...posts.map(p => urlEntry(`/blog/${p.id}/`, p.date, 'monthly', '0.60')),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
      xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
            http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">

${urls.join('\n')}

</urlset>
`;

fs.writeFileSync(OUTPUT, xml);
console.log(`Sitemap generated: ${posts.length} posts, ${staticRoutes.length + posts.length * 2} total URLs`);
