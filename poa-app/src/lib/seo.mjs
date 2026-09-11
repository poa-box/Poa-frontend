// Shared by the browser, static export scripts, and the Cloudflare worker.
export const SITE_URL = 'https://poa.box';
export const PUBLIC_INDEXABLE_ROUTES = ['/', '/about/', '/docs/', '/explore/', '/protocol/', '/create/'];
export const POA_DESCRIPTION = 'Open-source software for worker and community ownership: shared treasury, member voting, tasks, and contribution-based rewards.';

export function canonicalUrl(path = '/') {
  // Canonicals identify the page, not a campaign, fragment, or saved org filter.
  // Only local paths belong to this site; never accept a foreign canonical.
  const localPath = typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : '/';
  const pathname = new URL(localPath, SITE_URL).pathname;
  const normalized = pathname === '/' || pathname.endsWith('/') || /\/[^/]+\.[^/]+$/.test(pathname)
    ? pathname : `${pathname}/`;
  return `${SITE_URL}${normalized}`;
}

export function serializeJsonLd(value) {
  // A literal </script> in authored text must not break out of the JSON script.
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function getPoaSchema() {
  const publisher = { '@id': `${SITE_URL}/#organization` };
  return [
    {
      '@context': 'https://schema.org', '@type': 'Organization', ...publisher,
      name: 'Poa', alternateName: ['poa.box', 'Perpetual Organization Architect'],
      url: `${SITE_URL}/`, logo: `${SITE_URL}/images/poa_logo.png`,
      description: POA_DESCRIPTION,
      sameAs: ['https://github.com/poa-box', 'https://x.com/PoaPerpetual', 'https://discord.gg/9SD6u4QjTt'],
    },
    {
      '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${SITE_URL}/#website`,
      name: 'Poa', alternateName: 'poa.box', url: `${SITE_URL}/`,
      description: POA_DESCRIPTION, inLanguage: 'en', publisher,
    },
    {
      '@context': 'https://schema.org', '@type': 'SoftwareApplication', '@id': `${SITE_URL}/#software`,
      name: 'Poa', url: `${SITE_URL}/`, description: POA_DESCRIPTION,
      applicationCategory: 'BusinessApplication', applicationSubCategory: 'Cooperative governance and shared ownership software',
      operatingSystem: 'Web', isAccessibleForFree: true,
      license: 'https://github.com/poa-box/Poa-frontend/blob/main/LICENSE',
      creator: publisher,
      featureList: ['Member voting', 'Contribution-weighted voting', 'Shared treasury', 'Tasks and contribution rewards', 'Revenue distributions', 'Membership and permissions'],
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Poa charges no platform fee. Network and external service costs may apply.' },
    },
  ];
}
