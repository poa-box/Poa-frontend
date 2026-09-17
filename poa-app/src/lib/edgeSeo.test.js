import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../../../cloudflare-worker/worker.mjs';

const env = { SITE_CID: 'test-cid' };
const request = (path, options) => new Request(`https://poa.box${path}`, options);
const gatewayResponse = (body = '<html>page</html>', options = {}) => new Response(body, {
  headers: { 'content-type': 'text/html' },
  ...options,
});

afterEach(() => vi.unstubAllGlobals());

describe('public edge canonical URLs', () => {
  it.each([
    ['http://www.poa.box/docs', 'https://poa.box/docs/'],
    ['http://poa.box/', 'https://poa.box/'],
    ['https://poa.box/index.html', 'https://poa.box/'],
    ['https://poa.box/about/index.html?ref=guide', 'https://poa.box/about/?ref=guide'],
    ['https://poa.box/docs/what-is-poa', 'https://poa.box/docs/what-is-poa/'],
    ['https://poa.box/docs/what-is-poa/index.html', 'https://poa.box/docs/what-is-poa/'],
    ['http://www.poa.box/blog/perpetualOrganization?ref=old', 'https://poa.box/docs/what-is-poa/?ref=old'],
    ['https://poa.box/blog/create/index.html?ref=old', 'https://poa.box/docs/create/?ref=old'],
    ['https://poa.box/docs/perpetualOrganization/index.html', 'https://poa.box/docs/what-is-poa/'],
  ])('redirects %s directly to %s without fetching the gateway', async (from, to) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const response = await worker.fetch(new Request(from), {}, {});
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(to);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['http://poa.earth/', 'https://www.poa.earth/home/', 301],
    ['https://www.poa.earth/', 'https://www.poa.earth/home/', 302],
    ['https://dao.kublockchain.com/?userDAO=12', 'https://dao.kublockchain.com/home/?userDAO=12', 302],
    ['http://dao.kublockchain.com/docs', 'https://dao.kublockchain.com/docs/', 301],
  ])('preserves the white-label host and landing for %s', async (from, to, status) => {
    const response = await worker.fetch(new Request(from), {}, {});
    expect(response.status).toBe(status);
    expect(response.headers.get('location')).toBe(to);
  });

  it.each([
    '/docs/', '/docs/what-is-poa/', '/voting?userDAO=42&proposal=7',
    '/_next/static/chunks/main.js', '/images/poa_logo.png', '/.well-known/webauthn',
  ])('passes %s through without an extra redirect', async path => {
    const fetch = vi.fn().mockResolvedValue(gatewayResponse());
    vi.stubGlobal('fetch', fetch);
    const response = await worker.fetch(request(path), env, {});
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(fetch.mock.calls[0][0].url).toBe(`https://ipfs.poa.earth/ipfs/test-cid${path}`);
  });

  it('preserves non-GET methods when redirecting a host alias', async () => {
    const response = await worker.fetch(new Request('http://www.poa.box/docs', { method: 'POST', body: 'value=1' }), {}, {});
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('https://poa.box/docs/');
  });
});

describe('discovery response headers', () => {
  it.each([
    ['/robots.txt', 'text/plain; charset=utf-8'],
    ['/llms.txt', 'text/plain; charset=utf-8'],
    ['/llms-full.txt', 'text/plain; charset=utf-8'],
    ['/sitemap.xml', 'application/xml; charset=utf-8'],
    ['/docs/what-is-poa.md', 'text/markdown; charset=utf-8'],
  ])('serves %s with the right MIME type and deployment revalidation', async (path, type) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('content', {
      headers: {
        'content-type': 'application/octet-stream',
        'cache-control': 'public, max-age=29030400',
        expires: 'Fri, 13 Aug 2027 19:35:26 GMT',
        'access-control-allow-origin': '*',
      },
    })));
    const response = await worker.fetch(request(path), env, {});
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(type);
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    expect(response.headers.has('expires')).toBe(false);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(await response.text()).toBe('content');
    if (path.endsWith('.md')) {
      expect(response.headers.get('link')).toBe('<https://poa.box/docs/what-is-poa/>; rel="canonical"');
    }
  });

  it('preserves WebAuthn Related Origins JSON and asset caching', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"origins":[]}', {
      headers: { 'content-type': 'application/octet-stream', 'cache-control': 'public, max-age=3600' },
    })));
    const response = await worker.fetch(request('/.well-known/webauthn'), env, {});
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(await response.json()).toEqual({ origins: [] });
  });

  it('retains HEAD and conditional requests for discovery files', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 304, headers: { etag: '"abc"' } }));
    vi.stubGlobal('fetch', fetch);
    const response = await worker.fetch(request('/robots.txt', { method: 'HEAD', headers: { 'if-none-match': '"abc"' } }), env, {});
    expect(fetch.mock.calls[0][0].method).toBe('HEAD');
    expect(fetch.mock.calls[0][0].headers.get('if-none-match')).toBe('"abc"');
    expect(response.status).toBe(304);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await response.text()).toBe('');
  });
});

describe('missing pages and gateway errors', () => {
  it('returns the exported error page with HTTP 404 for a missing route', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('gateway file not found', { status: 404 }))
      .mockResolvedValueOnce(gatewayResponse('<html>404 - Page Not Found</html>'));
    vi.stubGlobal('fetch', fetch);
    const response = await worker.fetch(request('/does-not-exist/?from=search', { headers: { range: 'bytes=0-10', 'if-none-match': '"old"' } }), env, {});
    expect(response.status).toBe(404);
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    expect(await response.text()).toBe('<html>404 - Page Not Found</html>');
    const fallback = fetch.mock.calls[1][0];
    expect(fallback.url).toBe('https://ipfs.poa.earth/ipfs/test-cid/404.html');
    expect(fallback.headers.has('range')).toBe(false);
    expect(fallback.headers.has('if-none-match')).toBe(false);
  });

  it.each(['/404', '/404/', '/404.html'])('never exposes %s as a successful indexed page', async path => {
    const fetch = vi.fn().mockResolvedValue(gatewayResponse('Page not found'));
    vi.stubGlobal('fetch', fetch);
    const response = await worker.fetch(request(path, { headers: { 'if-none-match': '"old"' } }), env, {});
    expect(response.status).toBe(404);
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0].url).toBe('https://ipfs.poa.earth/ipfs/test-cid/404.html');
    expect(fetch.mock.calls[0][0].headers.has('if-none-match')).toBe(false);
  });

  it('preserves a gateway 404 if fetching the exported error page fails', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('Not found', { status: 404 }))
      .mockRejectedValueOnce(new Error('gateway unavailable')));
    const response = await worker.fetch(request('/absent/'), env, {});
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not found');
  });

  it('does not disguise a missing Markdown file as a valid discovery response', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('Not found', { status: 404 }))
      .mockResolvedValueOnce(gatewayResponse('Page not found')));
    const response = await worker.fetch(request('/docs/what-is-poa.md'), env, {});
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe('text/html');
    expect(response.headers.has('link')).toBe(false);
  });

  it('keeps gateway outages as retryable errors rather than returning false 404s', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503, headers: { 'retry-after': '30' } }));
    vi.stubGlobal('fetch', fetch);
    const response = await worker.fetch(request('/docs/what-is-poa/'), env, {});
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('30');
    expect(response.headers.has('x-robots-tag')).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
