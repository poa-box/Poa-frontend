import { describe, expect, it } from 'vitest';
import { canonicalUrl, getPoaAboutSchema, getPoaOrganizationSchema, getPoaSchema, POA_ABOUT_DESCRIPTION, POA_DESCRIPTION, serializeJsonLd } from '@/lib/seo.mjs';

describe('public SEO metadata', () => {
  it('gives slash aliases and tracking links the same HTTPS canonical', () => {
    for (const path of ['/docs/create', '/docs/create/', '/docs/create?utm_source=news#start']) {
      expect(canonicalUrl(path)).toBe('https://poa.box/docs/create/');
    }
    expect(canonicalUrl('/?utm_source=search')).toBe('https://poa.box/');
    expect(canonicalUrl('/docs/create.md')).toBe('https://poa.box/docs/create.md');
    expect(canonicalUrl('https://elsewhere.example/')).toBe('https://poa.box/');
    expect(canonicalUrl('//elsewhere.example/')).toBe('https://poa.box/');
    expect(canonicalUrl()).toBe('https://poa.box/');
  });

  it('keeps authored script delimiters inert while preserving their JSON value', () => {
    const data = { description: '</script><script>alert(1)</script>\u2028\u2029' };
    const output = serializeJsonLd(data);
    expect(output).not.toContain('<');
    expect(output).not.toContain('\u2028');
    expect(output).not.toContain('\u2029');
    expect(JSON.parse(output)).toEqual(data);
  });

  it('links the site and software to a single publisher without unsupported actions', () => {
    const [organization, website, software] = getPoaSchema();
    expect(website.publisher['@id']).toBe(organization['@id']);
    expect(software.creator['@id']).toBe(organization['@id']);
    expect(website).not.toHaveProperty('potentialAction');
    expect(software).not.toHaveProperty('aggregateRating');
    expect(software.offers.description).toContain('Network');
  });

  it('uses the same complete organization identity on the homepage and About page', () => {
    const [homepageOrganization] = getPoaSchema();
    const [aboutOrganization, aboutPage] = getPoaAboutSchema();
    expect(aboutOrganization).toEqual(homepageOrganization);
    expect(aboutOrganization).toEqual(getPoaOrganizationSchema());
    expect(aboutOrganization).toMatchObject({
      '@type': 'Organization',
      '@id': 'https://poa.box/#organization',
      name: 'Poa',
      alternateName: ['poa.box', 'Perpetual Organization Architect'],
      url: 'https://poa.box/',
      logo: 'https://poa.box/images/poa_logo.png',
      description: POA_DESCRIPTION,
    });
    expect(aboutOrganization.sameAs).toContain('https://github.com/poa-box');
    expect(aboutPage.mainEntity).toEqual({ '@id': homepageOrganization['@id'] });
  });

  it('gives About its own canonical identity and the same description as its page metadata', () => {
    const [, aboutPage] = getPoaAboutSchema();
    expect(aboutPage).toMatchObject({
      '@type': 'AboutPage',
      '@id': 'https://poa.box/about/#webpage',
      name: 'About Poa',
      url: canonicalUrl('/about/'),
      description: POA_ABOUT_DESCRIPTION,
    });
    expect(aboutPage.description).not.toContain('finished work earns ownership');
    expect(aboutPage.description).not.toContain('Open-source and free');
  });
});
