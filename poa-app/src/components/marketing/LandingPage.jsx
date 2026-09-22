import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { getDefaultOrgForHost } from '@/config/hostDefaultOrg';
import SEOHead from '@/components/common/SEOHead';
import { getPoaSchema, POA_DESCRIPTION } from '@/lib/seo.mjs';
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

  return (
    <>
      <SEOHead
        title="Poa (poa.box) | Worker & community ownership software"
        description={POA_DESCRIPTION}
        path="/"
        ogImageAlt="Poa.box — Build together. Own Together"
        jsonLd={getPoaSchema()}
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
