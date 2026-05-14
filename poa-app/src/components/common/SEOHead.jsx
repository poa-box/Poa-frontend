import Head from "next/head";

const SITE_URL = "https://poa.box";
const DEFAULT_OG_IMAGE = `${SITE_URL}/images/poa_og.webp`;

export default function SEOHead({
  title,
  description,
  path,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = "website",
  noIndex = false,
  jsonLd,
  keywords,
}) {
  const fullTitle = title.includes("Poa") || title.includes("poa.box")
    ? title
    : `${title} | Poa`;
  // next.config has `trailingSlash: true`, so the site canonical for any
  // non-root, non-querystring path must end with `/`. Without this, the
  // canonical URL itself 308-redirects to the slashed version, which Google
  // Search Console reports as "Page with redirect". Normalize here so
  // callers don't have to remember.
  const normalizedPath =
    path === "/" || path.includes("?") || path.includes("#") || path.endsWith("/")
      ? path
      : `${path}/`;
  const canonicalUrl = `${SITE_URL}${normalizedPath}`;
  const truncatedDescription =
    description.length > 160 ? `${description.slice(0, 157)}...` : description;
  const keywordsContent = Array.isArray(keywords) ? keywords.join(", ") : keywords;

  return (
    <Head>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{fullTitle}</title>
      <meta name="description" content={truncatedDescription} />
      {keywordsContent && <meta name="keywords" content={keywordsContent} />}
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={truncatedDescription} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content="Poa" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@PoaPerpetual" />
      <meta name="twitter:creator" content="@PoaPerpetual" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={truncatedDescription} />
      <meta name="twitter:image" content={ogImage} />

      {/* Robots */}
      {noIndex && <meta name="robots" content="noindex, nofollow" />}

      {/* Structured Data */}
      {jsonLd &&
        (Array.isArray(jsonLd) ? jsonLd : [jsonLd]).map((data, i) => (
          <script
            key={i}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
          />
        ))}
    </Head>
  );
}
