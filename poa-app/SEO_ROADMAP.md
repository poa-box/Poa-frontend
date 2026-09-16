# Poa search and agent discovery

Updated September 11, 2026. Poa is open-source software for worker and community
ownership: membership, shared work, Shares, voting, shared treasury, and funded
revenue distributions. Describe those capabilities concretely while keeping the
site's warm voice and existing visual design.

## What the site publishes

The existing documentation covers the important search intents. Improve these
canonical sources instead of publishing overlapping keyword landing pages:

| Intent | Canonical page |
| --- | --- |
| What Poa does | `https://poa.box/docs/what-is-poa/` |
| Worker cooperative software | `https://poa.box/docs/worker-cooperatives/` |
| Shared treasury and member-approved spending | `https://poa.box/docs/treasury-management/` |
| Worker ownership and contribution rewards | `https://poa.box/docs/contribution-and-ownership/` |
| Democratic governance and executing decisions | `https://poa.box/docs/hybridVoting/` |
| Autonomous AI-agent organizations | `https://poa.box/docs/ai-agent-coordination/` |
| CLI, local MCP, and agent integration | `https://poa.box/docs/ai-agent-integration/` |

The documentation catalog and authored Markdown drive the sitemap, `/llms.txt`,
`/llms-full.txt`, and `/docs/<id>.md`. Drafts, retired articles, and unlisted source
files are excluded. AlphaV1 has no published article; its old docs/blog addresses
permanently redirect to `/docs/what-is-poa/`.

Homepage use-case links lead into these guides. JSON-LD describes supported
capabilities and shares publisher identities across the site. Do not add invented
ratings, invisible FAQs, unsupported search actions, or promises of rich results.
The frontend is not a hosted MCP/API service: the agent guide points to the actual
installable `poa-cli` and agent package, including their current setup requirements.

## Verify before deployment

Run from `poa-app/` with Node 22.23.2:

- `yarn test` for pure logic and worker routing tests.
- `yarn build` for static export and generated discovery files.
- `yarn seo:check` for exported canonical URLs, metadata, readable content,
  structured data, and discovery-file consistency.
- `yarn e2e:check` for production E2E leakage.
- Follow AGENTS.md for a single passkey E2E server and Playwright verification.

The worker enforces HTTPS, apex `poa.box`, and canonical public trailing slashes,
while preserving white-label organization routing. Discovery files must revalidate
after deployment; content-hashed assets retain their normal caching.

## Hudson: after deployment

1. **Check the live deployment, then Search Console.** Inspect the HTTPS homepage
   and the priority guides above. Confirm the live test sees the correct content,
   crawling is allowed, and the Google-selected canonical is the expected HTTPS
   URL. Submit `https://poa.box/sitemap.xml` and request indexing for those updated
   canonical pages. Do not resubmit retired URLs.
2. **Bing Webmaster Tools.** Verify `poa.box` (or import the verified Search Console
   property), submit the same sitemap, and inspect priority URLs. Use its actual
   crawl/index reports instead of assuming Google and Bing agree.
3. **Cloudflare.** Check AI Crawl Control, WAF, bot challenges, and any managed
   robots settings for both `poa.box` and `ipfs.poa.earth`. The checked live
   robots.txt matched the repository on September 11; account rules still need
   verification. Allow legitimate search/retrieval traffic. The named search and user-fetch bots are
   allowed. Other existing restrictions remain: Google-Extended controls both
   Gemini training and grounding, so its retained block limits those Gemini
   uses without affecting Google Search. Choose that combined policy explicitly. Recheck live
   robots and content after changing account rules.
4. **Publish real evidence.** Ask participating organizations to link to Poa where
   relevant. Publish a case study with their permission, real usage, and an
   attributable account of why they use it. Keep GitHub descriptions and social
   profiles consistent. Do not buy links, invent testimonials, or make directory
   submissions to unrelated sites.
5. **Make agent adoption repeatable.** In `poa-cli`, publish and version the
   installable packages when ready; test the documented MCP setup against a
   tagged release. Supply a small funded sandbox with explicit entry rules and a
   reproducible two-agent contribution/review/vote example. Publish the results
   and precise prerequisites. Keep source commands and manifest links current.
6. **Measure weekly.** Track impressions, clicks, indexed canonical pages, crawl
   failures, and useful queries in Google and Bing. Group interest around worker
   ownership, cooperative governance, shared treasury, and AI-agent coordination.
   Add content where real questions reveal a gap. Track agent setup success and
   completed contributions separately from page views.

## Interpreting Search Console

The reports shared September 11 were last updated September 3. They list:

- **Excluded by noindex:** `/home/`, `/home?org=`, and `/voting?org=` are application
  shells. Their exclusion is intentional. They should not compete with public
  explanatory pages. Empty task/profile shells are also excluded.
- **Alternate page with proper canonical:** HTTP aliases and retired AlphaV1
  addresses are duplicates. The canonical HTTPS content is the target to inspect.
- **Page with redirect:** `www` and retired-document URLs should redirect. Their
  exclusion is the intended result; do not remove good redirects to clear a report.

These examples do not establish whether the HTTPS homepage and current docs are
indexed. Google explicitly says `site:` results are not exhaustive; use URL
Inspection. After deploying, recrawling and report updates take time. Code cannot
guarantee crawling, indexing, rankings, or AI citations.

## Primary references

- [Google: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
  — ordinary crawlability, readable content, useful links, and accurate schema
  remain the foundation; no special AI file is required.
- [Google: limitations of the site operator](https://developers.google.com/search/docs/monitor-debug/search-operators/all-search-site)
- [Google: canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google: Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [OpenAI crawler identities](https://developers.openai.com/api/docs/bots)
- [Anthropic crawler identities](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler)
- [Perplexity crawlers](https://docs.perplexity.ai/docs/resources/perplexity-crawlers)
- [Google-Extended product control](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers#google-extended)
- [Poa CLI integration guide](https://github.com/poa-box/poa-cli/blob/main/docs/guides/integrators.md)
