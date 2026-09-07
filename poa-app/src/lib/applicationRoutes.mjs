// Fully static reading and redirect routes do not initialize wallets, Apollo,
// passkeys, or organization data. About opts into only the public registry;
// protocol opts into wallet services for donations. Unknown routes default to
// the full application shell.
export const PUBLIC_ROUTES = new Set([
  '/404',
  '/_error',
  '/blog/[id]',
  '/browser',
  '/docs',
  '/docs/[id]',
  '/edu-Hub',
  '/org-structure',
  '/profileHub',
  '/user',
  '/voting-history',
]);

export const REGISTRY_ONLY_ROUTES = new Set(['/about']);
export const CORE_ONLY_ROUTES = new Set(['/protocol']);
// These public application pages retain their server-rendered body content.
export const SSR_APP_ROUTES = new Set(['/create', '/explore', '/protocol', '/u']);


/** Public organization routes eligible for an early shared-reader asset hint. */
export function usesDeferredAccountBootstrap(pathname) {
  return typeof pathname === 'string' && pathname.startsWith('/')
    && pathname !== '/' && !pathname.startsWith('/_')
    && !PUBLIC_ROUTES.has(pathname) && !REGISTRY_ONLY_ROUTES.has(pathname)
    && !SSR_APP_ROUTES.has(pathname);
}
