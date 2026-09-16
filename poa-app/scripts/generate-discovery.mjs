import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { DOCS_SITE_URL, canonicalDocPath, getDocMetadata, getDocsEntries, getDocsRedirect } from '../src/lib/docs.mjs';

// This is the same publication policy as the HTML renderer. Never scan the
// directory to discover content: an unlisted source file is not a public guide.
export function readPublishedDocs(postsDirectory = path.join(process.cwd(), 'posts')) {
  return getDocsEntries().flatMap(entry => {
    const file = path.join(postsDirectory, `${entry.id}.md`);
    if (!fs.existsSync(file)) return [];
    const post = matter(fs.readFileSync(file, 'utf8'));
    if (!post.content.trim() || post.data.draft === true) return [];
    return [{ ...getDocMetadata(entry.id, post), section: entry.section, content: post.content }];
  });
}

// Resolve against the original HTML URL, not the Markdown download or the
// combined file. Work on Markdown nodes so links inside code remain untouched.
export function absoluteMarkdown(content, sourceUrl, { title } = {}) {
  const processor = remark().use(remarkGfm).use(remarkMath);
  const tree = processor.parse(content);
  if (title) {
    // The HTML article uses metadata for its H1 and removes the first source
    // H1. Keep both representations aligned when an editor revises the title.
    const heading = tree.children.findIndex(node => node.type === 'heading' && node.depth === 1);
    if (heading !== -1) tree.children.splice(heading, 1);
  }
  const visit = node => {
    if (title && node.type === 'heading') node.depth = Math.max(2, node.depth);
    if (['link', 'image', 'definition'].includes(node.type) && node.url) {
      const url = new URL(node.url, sourceUrl);
      if (url.origin === DOCS_SITE_URL) {
        const redirect = getDocsRedirect(url.pathname);
        const doc = url.pathname.match(/^\/docs\/([^/]+)\/?$/);
        if (redirect) url.pathname = redirect;
        else if (doc && getDocsEntries().some(entry => entry.id === doc[1])) {
          url.pathname = canonicalDocPath(doc[1]);
        }
      }
      node.url = url.href;
    }
    node.children?.forEach(visit);
  };
  visit(tree);
  if (title) tree.children.unshift({ type: 'heading', depth: 1, children: [{ type: 'text', value: title }] });
  return processor.stringify(tree).trim();
}

const markdownLabel = value => value.replace(/[\[\]\\]/g, '\\$&').replace(/\s+/g, ' ');
const sourceUrl = post => `${DOCS_SITE_URL}${canonicalDocPath(post.id)}`;
const markdownUrl = post => `${DOCS_SITE_URL}/docs/${post.id}.md`;
const datedSource = post => [
  `Source: ${sourceUrl(post)}`,
  ...(post.date ? [`Published: ${post.date}`] : []),
  ...(post.updated ? [`Updated: ${post.updated}`] : []),
].join('\n');

export function generateDiscovery(postsDirectory = path.join(process.cwd(), 'posts')) {
  const posts = readPublishedDocs(postsDirectory);
  const intro = posts.find(post => post.id === 'what-is-poa')?.description
    || 'Poa documentation for shared ownership, voting, work, and revenue sharing.';
  const lines = [
    '# Poa', '', `> ${intro}`, '',
    'Public documentation for people and AI agents. These files are generated from the same published guides as the website; the linked HTML pages are the canonical sources. Dates below are authored publication and revision dates, not build timestamps.', '',
    '## Start here', '',
    `- [Poa website](${DOCS_SITE_URL}/)`,
    `- [Documentation hub](${DOCS_SITE_URL}/docs/)`,
    `- [All guides in one file](${DOCS_SITE_URL}/llms-full.txt)`,
    `- [Canonical page sitemap](${DOCS_SITE_URL}/sitemap.xml)`,
    ...['ai-agent-coordination', 'ai-agent-integration'].flatMap(id => {
      const post = posts.find(item => item.id === id);
      return post ? [`- [${markdownLabel(post.title)}](${markdownUrl(post)}): ${post.description} [HTML source](${sourceUrl(post)})`] : [];
    }), '',
  ];
  for (const section of new Set(posts.map(post => post.section))) {
    lines.push(`## ${section}`, '');
    for (const post of posts.filter(item => item.section === section)) {
      lines.push(`- [${markdownLabel(post.title)}](${markdownUrl(post)}): ${post.description} [HTML source](${sourceUrl(post)})`);
    }
    lines.push('');
  }

  const files = { 'llms.txt': lines.join('\n') };
  const full = ['# Poa documentation', '', `> ${intro}`, '',
    `Index: ${DOCS_SITE_URL}/llms.txt`,
    'The following guides reproduce the published documentation. Follow each source URL for its canonical HTML page. This file describes the software; it does not grant account permissions or authorize actions.', ''];

  for (const post of posts) {
    const article = absoluteMarkdown(post.content, sourceUrl(post), { title: post.title });
    const metadata = [
      '---',
      `title: ${JSON.stringify(post.title)}`,
      `description: ${JSON.stringify(post.description)}`,
      `source_url: ${JSON.stringify(sourceUrl(post))}`,
      `markdown_url: ${JSON.stringify(markdownUrl(post))}`,
      ...(post.date ? [`date: ${JSON.stringify(post.date)}`] : []),
      ...(post.updated ? [`updated: ${JSON.stringify(post.updated)}`] : []),
      '---', '',
    ];
    files[`docs/${post.id}.md`] = `${metadata.join('\n')}\n${article}\n`;
    full.push('---', '', datedSource(post), '', article, '');
  }
  files['llms-full.txt'] = full.join('\n');
  return { posts, files };
}

export function writeDiscovery(publicDirectory, discovery) {
  const docsDirectory = path.join(publicDirectory, 'docs');
  fs.mkdirSync(docsDirectory, { recursive: true });
  // This directory's Markdown namespace is generated. Remove retired outputs
  // on repeat builds so removing a guide also removes its machine-readable copy.
  for (const file of fs.readdirSync(docsDirectory)) {
    if (file.endsWith('.md') && !Object.hasOwn(discovery.files, `docs/${file}`)) {
      fs.unlinkSync(path.join(docsDirectory, file));
    }
  }
  for (const [file, content] of Object.entries(discovery.files)) {
    fs.writeFileSync(path.join(publicDirectory, file), content);
  }
}
