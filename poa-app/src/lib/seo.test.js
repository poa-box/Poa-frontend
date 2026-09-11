import { describe, expect, it } from 'vitest';
import { canonicalUrl, getPoaSchema, serializeJsonLd } from '@/lib/seo.mjs';

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
});
