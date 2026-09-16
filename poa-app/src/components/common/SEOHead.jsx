import Head from "next/head";
import { SITE_URL, canonicalUrl as getCanonicalUrl, serializeJsonLd } from '@/lib/seo.mjs';

const DEFAULT_OG_IMAGE = `${SITE_URL}/images/poa-og-landing.png`;
const DEFAULT_OG_IMAGE_ALT = "Poa.box — Build together. Own Together";

export default function SEOHead({
  title,
  description,
  path,
  ogImage = DEFAULT_OG_IMAGE,
  ogImageAlt = DEFAULT_OG_IMAGE_ALT,
  ogType = "website",
  noIndex = false,
  jsonLd,
  keywords,
  markdownPath,
  publishedTime,
  modifiedTime,
}) {
  // Brand presence check is case-insensitive ("Poa", "poa", "poa.box" all
  // count) so lowercase-brand titles don't get a redundant suffix.
  const fullTitle = title.toLowerCase().includes("poa")
    ? title
    : `${title} | Poa`;
  // Match the static export and edge redirects, without query/fragment aliases.
  const canonicalUrl = getCanonicalUrl(path);
  const truncatedDescription =
    description.length > 160 ? `${description.slice(0, 157)}...` : description;
  const keywordsContent = Array.isArray(keywords) ? keywords.join(", ") : keywords;

  return (
    <Head>
      {/* viewport-fit=cover lets iOS Safari report a non-zero
          env(safe-area-inset-bottom); the mobile task board's bottom
          tab bar + FAB rely on it to clear the home indicator. */}
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, viewport-fit=cover"
      />
      <title>{fullTitle}</title>
      <meta name="description" content={truncatedDescription} />
      {keywordsContent && <meta name="keywords" content={keywordsContent} />}
      <link key="canonical" rel="canonical" href={canonicalUrl} />
      <link key="llms" rel="alternate" type="text/plain" href={`${SITE_URL}/llms.txt`} title="Poa documentation for AI agents" />
      {markdownPath && <link key="markdown" rel="alternate" type="text/markdown" href={`${SITE_URL}${markdownPath}`} title="Read this guide as Markdown" />}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={truncatedDescription} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={ogImage} />
      {ogImageAlt && <meta property="og:image:alt" content={ogImageAlt} />}
      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content="Poa" />
      <meta property="og:locale" content="en_US" />
      {publishedTime && <meta property="article:published_time" content={publishedTime} />}
      {modifiedTime && <meta property="article:modified_time" content={modifiedTime} />}

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@PoaPerpetual" />
      <meta name="twitter:creator" content="@PoaPerpetual" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={truncatedDescription} />
      <meta name="twitter:image" content={ogImage} />
      {ogImageAlt && <meta name="twitter:image:alt" content={ogImageAlt} />}

      {/* Robots */}
      <meta key="robots" name="robots" content={noIndex ? 'noindex, follow' : 'index, follow, max-image-preview:large'} />

      {/* Structured Data */}
      {jsonLd &&
        (Array.isArray(jsonLd) ? jsonLd : [jsonLd]).map((data, i) => (
          <script
            key={`jsonld-${i}`}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
          />
        ))}
    </Head>
  );
}
