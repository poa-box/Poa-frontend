import { canonicalDocPath, getDocsEntries, getDocsRedirect } from '../poa-app/src/lib/docs.mjs';
import { PUBLIC_INDEXABLE_ROUTES, SITE_URL } from '../poa-app/src/lib/seo.mjs';

const PINATA_GATEWAY = 'https://ipfs.poa.earth';

// White-label hosts whose root ("/") should land directly on the org home page
// instead of the generic POA landing. The org itself is picked up client-side
// from window.location.hostname in POContext (HOST_DEFAULT_ORG).
// Redirecting at the edge avoids any flash of the landing HTML.
const WHITE_LABEL_HOSTS = new Set([
  'dao.kublockchain.com',
  'www.poa.earth',
]);

const DOC_IDS = new Set(getDocsEntries().map(entry => entry.id));
const PUBLIC_PATHS = new Set([
  ...PUBLIC_INDEXABLE_ROUTES,
  ...Array.from(DOC_IDS, canonicalDocPath),
]);

function publicCanonicalPath(pathname) {
  // Static-export directory URLs and their explicit index files identify the
  // same page. Keep the list bounded so assets and application routes retain
  // their existing routing (including organization query parameters).
  const path = pathname.endsWith('/index.html') ? pathname.slice(0, -10) : pathname;
  const slashed = path.endsWith('/') ? path : `${path}/`;
  return PUBLIC_PATHS.has(slashed) ? slashed : null;
}

function discoveryType(pathname) {
  if (['/robots.txt', '/llms.txt', '/llms-full.txt'].includes(pathname)) return 'text/plain; charset=utf-8';
  if (pathname === '/sitemap.xml') return 'application/xml; charset=utf-8';
  const id = pathname.match(/^\/docs\/([^/]+)\.md$/)?.[1];
  return DOC_IDS.has(id) ? 'text/markdown; charset=utf-8' : null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let redirectStatus = 301;

    // Collapse scheme, host, and public-path aliases into a single hop.
    // White-label hosts keep their own domain and organization landing.
    url.protocol = 'https:';

    // poa.earth: bare -> www (and fold root -> /home/ for the white-label landing).
    if (url.hostname === 'poa.earth') {
      url.hostname = 'www.poa.earth';
      // If they hit the root, fold the white-label redirect into this hop.
      // Trailing slash matches next.config.mjs `trailingSlash: true`.
      if (url.pathname === '/') url.pathname = '/home/';
    }
    // poa.box: www -> apex. The apex domain is the canonical and matches every
    // <link rel="canonical"> / og:url emitted by the static site. Collapsing
    // www.poa.box hits into the apex avoids the "Page with redirect" /
    // "Alternate page with proper canonical tag" splits in Google Search
    // Console and keeps the brand URL consistent.
    if (url.hostname === 'www.poa.box') {
      url.hostname = 'poa.box';
    }

    // White-label root -> org home (302, not 301 — we may change this).
    if (url.pathname === '/' && WHITE_LABEL_HOSTS.has(url.hostname)) {
      url.pathname = '/home/';
      redirectStatus = 302;
    }

    // Documentation migrations happen before the IPFS fetch. The exported
    // site also includes a noindex fallback for gateways without this worker.
    const docsRedirect = getDocsRedirect(url.pathname);
    if (docsRedirect) {
      url.pathname = docsRedirect;
    } else {
      url.pathname = publicCanonicalPath(url.pathname) || url.pathname;
    }

    if (url.toString() !== request.url) {
      // Static pages use GET/HEAD. Preserve request bodies if another method
      // reaches a host or path alias rather than turning it into a GET.
      const status = request.method === 'GET' || request.method === 'HEAD'
        ? redirectStatus : redirectStatus === 301 ? 308 : 307;
      return Response.redirect(url.toString(), status);
    }

    // Get CID from environment variable (set by CI/CD)
    const cid = env.SITE_CID;
    if (!cid) {
      return new Response('SITE_CID not configured', { status: 500 });
    }

    // proxy www.poa.earth to Pinata while keeping URL clean
    const upstreamUrl = new URL(PINATA_GATEWAY);
    const isErrorPage = ['/404', '/404/', '/404.html'].includes(url.pathname);
    upstreamUrl.pathname = `/ipfs/${cid}${isErrorPage ? '/404.html' : url.pathname}`;
    upstreamUrl.search = url.search;

    const upstreamHeaders = new Headers(request.headers);
    if (isErrorPage) {
      for (const name of ['range', 'if-range', 'if-none-match', 'if-modified-since']) upstreamHeaders.delete(name);
    }
    const upstreamReq = new Request(upstreamUrl.toString(), {
      method: request.method,
      headers: upstreamHeaders,
      body:
        request.method === 'GET' || request.method === 'HEAD'
          ? null
          : request.body,
      redirect: 'follow',
    });

    let upstreamRes = await fetch(upstreamReq);
    const isNotFound = upstreamRes.status === 404 || (isErrorPage && upstreamRes.ok);

    // A gateway's missing-file response should display the site's error page
    // with a real 404, never a successful homepage fallback. Do not reclassify
    // gateway/network failures as missing pages, or buffer successful HTML.
    if (upstreamRes.status === 404 && !isErrorPage && ['GET', 'HEAD'].includes(request.method)) {
      const errorUrl = new URL(`/ipfs/${cid}/404.html`, PINATA_GATEWAY);
      const errorHeaders = new Headers(request.headers);
      for (const name of ['range', 'if-range', 'if-none-match', 'if-modified-since']) errorHeaders.delete(name);
      try {
        const errorRes = await fetch(new Request(errorUrl, { method: request.method, headers: errorHeaders }));
        if (errorRes.ok) upstreamRes = errorRes;
      } catch {
        // The original gateway 404 remains usable if its error page is absent.
      }
    }

    const headers = new Headers(upstreamRes.headers);

    // HTML pages must not be cached long-term — each deploy produces a new CID
    // with new content-hashed JS/CSS references. Without this, browsers serve
    // stale HTML that points to old JS bundles missing build-time env vars.
    const contentType = headers.get('content-type') || '';
    const publicDiscoveryType = discoveryType(url.pathname);
    if (contentType.includes('text/html') || publicDiscoveryType || isNotFound) {
      headers.set('cache-control', 'public, max-age=0, must-revalidate');
      headers.delete('expires');
    }

    if (publicDiscoveryType && (upstreamRes.ok || upstreamRes.status === 304) && !isNotFound) {
      headers.set('content-type', publicDiscoveryType);
      headers.set('x-content-type-options', 'nosniff');
      const id = url.pathname.match(/^\/docs\/([^/]+)\.md$/)?.[1];
      if (DOC_IDS.has(id)) headers.append('link', `<${SITE_URL}${canonicalDocPath(id)}>; rel="canonical"`);
    }

    if (isNotFound) {
      headers.set('x-robots-tag', 'noindex');
    }

    // WebAuthn Related Origins spec requires application/json on this file;
    // Pinata serves it as octet-stream because it has no extension.
    if (url.pathname === '/.well-known/webauthn') {
      headers.set('content-type', 'application/json');
    }

    return new Response(upstreamRes.body, {
      status: isNotFound ? 404 : upstreamRes.status,
      statusText: isNotFound ? 'Not Found' : upstreamRes.statusText,
      headers,
    });
  },
};
