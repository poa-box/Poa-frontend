import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { getDefaultOrgForHost } from '@/config/hostDefaultOrg';
import SEOHead from '@/components/common/SEOHead';
import { useLandingAccount } from '@/components/marketing/LandingAccountContext';
import { PRODUCT_SHOTS } from '@/components/marketing/productShots';

// Marketing landing — direction A ("public works"). All sections share the
// single scrollable page, so bundling them into the page chunk is cheaper than
// separate HTTP requests with duplicated imports.
import { MarketingRoot } from "@/components/marketing/primitives";
import MarketingNav from "@/components/marketing/chrome/MarketingNav";
import MarketingFooter from "@/components/marketing/chrome/MarketingFooter";
import {
  Hero,
  LedgerStrip,
  Problem,
  TheWork,
  TheSay,
  TheMoney,
  ThePeople,
  Ethos,
  StartClose,
} from "@/components/marketing/landing";

export default function LandingPage() {
  const router = useRouter();
  const { accountNav, isSignInOpen, setIsSignInOpen } = useLandingAccount();
  const [isWhiteLabelHost, setIsWhiteLabelHost] = useState(false);

  // White-label hosts (e.g. dao.kublockchain.com) skip the generic POA landing
  // and go straight to the org home. Skipping render avoids a content flash
  // after hydration.
  useEffect(() => {
    if (getDefaultOrgForHost()) {
      setIsWhiteLabelHost(true);
      router.replace('/home');
    }
  }, [router]);

  if (isWhiteLabelHost) {
    return <div style={{ minHeight: "100vh", background: "#ffffff" }} />;
  }

  const webSite = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Poa",
    "alternateName": ["poa", "poa.box", "poa box", "Poa.box"],
    "url": "https://poa.box",
    "description":
      "Poa (poa.box) turns your group into an organization you own together. Finished work earns ownership: a share of the revenue and a real say in the decisions.",
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": "https://poa.box/explore/?search={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    },
  };

  const organizationLD = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Poa",
    "alternateName": ["poa", "poa.box", "poa box", "Poa.box"],
    "url": "https://poa.box",
    "logo": "https://poa.box/images/poa_og.webp",
    "sameAs": [
      "https://twitter.com/PoaPerpetual",
      "https://discord.gg/9SD6u4QjTt",
      "https://github.com/poa-box",
    ],
    "foundingDate": "2024",
    "founder": {
      "@type": "Person",
      "name": "Hudson Headley",
      "sameAs": [
        "https://github.com/hudsonhrh",
        "https://twitter.com/PoaPerpetual",
      ],
    },
    "knowsAbout": [
      "Worker owned organization",
      "Community ownership",
      "Cooperative software",
      "Revenue sharing",
      "Group governance",
      "Task management for communities",
      "Start a cooperative",
    ],
    "description":
      "Poa (poa.box) turns your group into an organization you own together. Finished work earns ownership: revenue share and voting power for the tasks you complete. Open-source and free.",
  };

  const softwareLD = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Poa",
    "alternateName": ["poa", "poa.box", "Poa Perpetual Organization Architect"],
    "applicationCategory": "BusinessApplication",
    "applicationSubCategory": "Worker owned organization platform",
    "operatingSystem": "Web",
    "url": "https://poa.box",
    "description":
      "Start an organization your group owns together: tasks, voting, membership, and a shared treasury in one place. Finished work earns ownership, and voting power is earned by participating. Open-source and free to use on poa.box.",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
    },
    "creator": { "@type": "Organization", "name": "Poa" },
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://poa.box" },
      { "@type": "ListItem", "position": 2, "name": "Docs", "item": "https://poa.box/docs/" },
    ],
  };

  return (
    <>
      <SEOHead
        title="Poa: organizations that pay you with ownership"
        description="Turn your group into an organization you own together. Finished work earns ownership: revenue share and voting power for the tasks you complete. Free and open."
        path="/"
        ogImageAlt="Poa.box — Build together. Own Together"
        keywords={[
          "worker owned organization",
          "community ownership",
          "cooperative software",
          "revenue sharing",
          "group governance",
          "task management for communities",
          "start a cooperative",
          "vouch based membership",
          "participation based voting",
          "poa.box",
        ]}
        jsonLd={[webSite, organizationLD, softwareLD, breadcrumb]}
      />

      {/* Prioritize the visible hero image and the exact font faces it uses. */}
      <Head>
        <link rel="preload" href="/fonts/archivo-vf.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/public-sans-vf.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/plex-mono-400-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href={PRODUCT_SHOTS.taskDetail.src} as="image" />
      </Head>

      <MarketingRoot className="pa-landing">
        {/* Skip link — off-screen until focused, then pinned top-left. Same
            anchor semantics + focus behavior as before, plain <a> + styled-jsx. */}
        <a href="#main-content" className="pa-skip">
          Skip to content
        </a>

        <MarketingNav
          mounted
          isAuthHydrated={!!accountNav?.isAuthHydrated}
          onAccountIntent={accountNav?.preloadRuntime}
          isPasskeyUser={accountNav?.isPasskeyUser}
          isConnected={accountNav?.isConnected}
          isAuthenticated={accountNav?.isAuthenticated}
          accountMenuItem={accountNav?.accountMenuItem}
          onSignInOpen={() => setIsSignInOpen(true)}
          signInPending={isSignInOpen && !accountNav}
        />

        <main id="main-content">
          <Hero />
          <Problem />
          <TheWork />
          <TheSay />
          <TheMoney />
          <ThePeople />
          <LedgerStrip />
          <Ethos />
          <StartClose />
        </main>

        <MarketingFooter />

        <style jsx>{`
          .pa-skip {
            position: absolute;
            left: -9999px;
            top: 0;
            z-index: 100;
            background: var(--paper);
            color: var(--ink);
            font-family: var(--mono);
            font-size: 0.875rem;
            padding: 12px 16px;
            border: 2px solid var(--signal);
            text-decoration: none;
          }
          .pa-skip:focus {
            left: 8px;
            top: 8px;
            outline: none;
            box-shadow: none;
          }
        `}</style>
      </MarketingRoot>

    </>
  );
}
