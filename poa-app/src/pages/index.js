import { useState, useEffect } from "react";
import Head from "next/head";
import { Box, useDisclosure } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useAccount } from "wagmi";
import { useQuery } from "@apollo/client";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useGlobalAccount } from "@/hooks/useGlobalAccount";
import { useAuth } from "@/context/AuthContext";
import { FETCH_SOLIDARITY_FUND_STATUS } from "@/util/passkeyQueries";

// Auth modals
import SignupModal from "@/components/account/SignupModal";
import SolidarityOnboardingModal from "@/components/passkey/SolidarityOnboardingModal";
import SignInModal from "@/components/passkey/SignInModal";

// Landing page sections
import Navbar from "@/components/landing/Navbar";
import HeroSection from "@/components/landing/HeroSection";

import ValuesSection from "@/components/landing/ValuesSection";
import WhatIsPoa from "@/components/landing/WhatIsPoa";
import UseCaseShowcase from "@/components/landing/UseCaseShowcase";
// import HowItWorks from "@/components/landing/HowItWorks";
import FeatureCards from "@/components/landing/FeatureCards";

import ClosingCTA from "@/components/landing/ClosingCTA";
import Footer from "@/components/landing/Footer";

export default function Home() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { hasAccount, isLoading: isAccountLoading } = useGlobalAccount();
  const { isPasskeyUser, isAuthenticated, hasStoredPasskey } = useAuth();
  const [isSignupOpen, setIsSignupOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Prefetch key routes
  useEffect(() => {
    router.prefetch('/create');
    router.prefetch('/browser');
  }, [router]);

  const { isOpen: isOnboardingOpen, onOpen: onOnboardingOpen, onClose: onOnboardingClose } = useDisclosure();
  const { isOpen: isSignInOpen, onOpen: onSignInOpen, onClose: onSignInClose } = useDisclosure();

  // Check if solidarity fund is active
  const { data: solidarityData } = useQuery(FETCH_SOLIDARITY_FUND_STATUS);
  const solidarityBalance = solidarityData?.paymasterHubContracts?.[0]?.solidarityBalance || '0';
  const showSolidarityOnboarding = mounted && !isPasskeyUser && !isConnected && !hasStoredPasskey && BigInt(solidarityBalance) > 0n;

  // Account menu state
  const getAccountMenuItem = () => {
    if (mounted && isPasskeyUser) {
      return { text: "My Account", onClick: () => router.push("/account") };
    }
    if (!isConnected && showSolidarityOnboarding) {
      return { text: "Create Account", onClick: onOnboardingOpen };
    }
    if (!isConnected) {
      return { text: "Connect Wallet", onClick: openConnectModal };
    }
    if (isAccountLoading) {
      return { text: "Loading...", onClick: () => {} };
    }
    if (hasAccount) {
      return { text: "My Account", onClick: () => router.push("/account") };
    }
    return { text: "Sign Up", onClick: () => setIsSignupOpen(true) };
  };

  const accountMenuItem = getAccountMenuItem();

  const jsonLD = {
    "@context": "http://schema.org",
    "@type": "Organization",
    "name": "Poa",
    "url": "https://poa.community",
    "logo": "https://poa.community/images/high_res_poa.png",
    "sameAs": ["https://twitter.com/PoaPerpetual"],
    "description":
      "Poa is a no-code DAO builder for creating community-owned, democratically governed organizations. Voting power is earned through contribution, not purchased with capital.",
  };

  const breadcrumb = {
    "@context": "http://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://poa.community" },
      { "@type": "ListItem", "position": 2, "name": "Docs", "item": "https://poa.community/docs" },
    ],
  };

  return (
    <>
      <Head>
        <title>Poa — Community-Owned Organization Builder</title>
        <meta
          name="description"
          content="Manage projects, track participation, and govern collectively — no code required. Build community-owned organizations with Poa."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="canonical" href="https://poa.community" />
        <meta property="og:title" content="Poa — Build Community-Owned Organizations" />
        <meta
          property="og:description"
          content="Manage projects, track participation, and govern collectively — no code required. Build community-owned organizations with Poa."
        />
        <meta property="og:url" content="https://poa.community" />
        <meta property="og:image" content="https://poa.community/images/high_res_poa.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Poa — Build Community-Owned Organizations" />
        <meta
          name="twitter:description"
          content="Manage projects, track participation, and govern collectively — no code required. Build community-owned organizations with Poa."
        />
        <meta name="twitter:image" content="https://poa.community/images/high_res_poa.png" />

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLD) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
        />
      </Head>

      <Box minH="100vh" overflowX="hidden" bg="white">
        <Navbar
          mounted={mounted}
          isPasskeyUser={isPasskeyUser}
          isConnected={isConnected}
          isAuthenticated={isAuthenticated}
          accountMenuItem={accountMenuItem}
          onSignInOpen={onSignInOpen}
        />
        <HeroSection
          mounted={mounted}
          isAuthenticated={isAuthenticated}
          onSignInOpen={onSignInOpen}
          onOnboardingOpen={onOnboardingOpen}
        />

        <ValuesSection />
        <WhatIsPoa />
        <UseCaseShowcase />
        {/* <HowItWorks /> */}
        <FeatureCards />
        <ClosingCTA />
        <Footer />
      </Box>

      {/* Auth Modals */}
      <SignupModal isOpen={isSignupOpen} onClose={() => setIsSignupOpen(false)} />
      <SolidarityOnboardingModal
        isOpen={isOnboardingOpen}
        onClose={onOnboardingClose}
        onSuccess={() => router.push('/account')}
      />
      <SignInModal
        isOpen={isSignInOpen}
        onClose={onSignInClose}
        onSuccess={() => router.push('/account')}
        onCreateAccount={onOnboardingOpen}
      />
    </>
  );
}
