import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Box, useDisclosure } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useAccount } from "wagmi";
import { useQuery } from "@apollo/client";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useGlobalAccount } from "@/hooks/useGlobalAccount";
import { useAuth } from "@/context/AuthContext";
import { getDefaultOrgForHost } from "@/context/POContext";
import { FETCH_SOLIDARITY_FUND_STATUS } from "@/util/passkeyQueries";
import SEOHead from "@/components/common/SEOHead";

// Auth modals (lazy — only shown on user interaction)
const SignupModal = dynamic(() => import("@/components/account/SignupModal"), { ssr: false });
const SolidarityOnboardingModal = dynamic(() => import("@/components/passkey/SolidarityOnboardingModal"), { ssr: false });
const SignInModal = dynamic(() => import("@/components/passkey/SignInModal"), { ssr: false });

// Landing page — above fold (static imports)
import Navbar from "@/components/landing/Navbar";
import HeroSection from "@/components/landing/HeroSection";

// Landing page — below fold (code-split)
const ValuesSection = dynamic(() => import("@/components/landing/ValuesSection"));
const WhatIsPoa = dynamic(() => import("@/components/landing/WhatIsPoa"));
const UseCaseShowcase = dynamic(() => import("@/components/landing/UseCaseShowcase"));
const FeatureCards = dynamic(() => import("@/components/landing/FeatureCards"));
const ClosingCTA = dynamic(() => import("@/components/landing/ClosingCTA"));
const Footer = dynamic(() => import("@/components/landing/Footer"));

export default function Home() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { hasAccount, isLoading: isAccountLoading } = useGlobalAccount();
  const { isPasskeyUser, isAuthenticated, hasStoredPasskey } = useAuth();
  const [isSignupOpen, setIsSignupOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isWhiteLabelHost, setIsWhiteLabelHost] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // White-label hosts (e.g. dao.kublockchain.com) skip the generic POA landing
  // and go straight to the org home. Skipping render avoids a content flash
  // after hydration.
  useEffect(() => {
    if (getDefaultOrgForHost()) {
      setIsWhiteLabelHost(true);
      router.replace('/home');
    }
  }, [router]);

  // Prefetch key routes
  useEffect(() => {
    router.prefetch('/create');
    router.prefetch('/explore');
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

  if (isWhiteLabelHost) {
    return <Box minH="100vh" bg="white" />;
  }

  const webSite = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Poa",
    "alternateName": ["poa.box", "poa box", "Poa.box"],
    "url": "https://poa.box",
    "description":
      "Poa (poa.box) is a no-code platform for community-owned organizations. Economic democracy in software.",
  };

  const organizationLD = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Poa",
    "alternateName": ["poa.box", "poa box", "Poa.box"],
    "url": "https://poa.box",
    "logo": "https://poa.box/images/poa_og.webp",
    "sameAs": [
      "https://twitter.com/PoaPerpetual",
      "https://discord.gg/9SD6u4QjTt",
      "https://github.com/poa-box",
    ],
    "knowsAbout": [
      "Economic democracy",
      "Worker cooperatives",
      "Community-owned organizations",
      "Contribution-based voting",
      "Hybrid voting",
      "Direct democracy",
      "Open-source project governance",
      "Decentralized governance",
      "DAO governance",
      "On-chain voting",
      "Decentralized treasury management",
    ],
    "description":
      "Poa (poa.box) is a no-code builder for community-owned organizations. Members write the rules, vote on the rules, and hold the treasury. Governance power is earned by contributing, not bought with capital.",
  };

  const softwareLD = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Poa",
    "alternateName": ["poa.box", "Poa Perpetual Organization Architect"],
    "applicationCategory": "BusinessApplication",
    "applicationSubCategory": "Community-owned organization platform",
    "operatingSystem": "Web",
    "url": "https://poa.box",
    "description":
      "No-code platform to launch and govern community-owned organizations. Voting, treasury, tasks, and roles in one product. Governance power earned by contributing, not bought with capital.",
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
        title="Poa: Community-Owned Organization Builder (No-Code, poa.box)"
        description="Launch a community-owned organization on poa.box. Members write the rules, vote on the rules, and hold the treasury. Governance power earned by contributing, not bought with capital."
        path="/"
        keywords={[
          "community-owned organization",
          "no-code DAO",
          "DAO platform",
          "DAO builder",
          "decentralized governance",
          "contribution-based voting",
          "hybrid voting",
          "worker cooperative software",
          "student organization governance",
          "open-source project governance",
          "decentralized treasury",
          "on-chain voting",
          "poa.box",
        ]}
        jsonLd={[webSite, organizationLD, softwareLD, breadcrumb]}
      />

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
