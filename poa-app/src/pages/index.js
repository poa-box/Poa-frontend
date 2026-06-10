import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Head from "next/head";
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

// Landing page sections — all part of the single scrollable page, so bundling
// them into the page chunk is cheaper than separate HTTP requests with
// duplicated Chakra imports.
import CharterNav from "@/components/landing/charter/CharterNav";
import CharterHero from "@/components/landing/charter/CharterHero";
import ProblemSection from "@/components/landing/charter/ProblemSection";
import HowItWorks from "@/components/landing/charter/HowItWorks";
import Pillars from "@/components/landing/charter/Pillars";
import WhoItsFor from "@/components/landing/charter/WhoItsFor";
import Ethos from "@/components/landing/charter/Ethos";
import CharterFooter from "@/components/landing/charter/CharterFooter";

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
      return { text: "My account", onClick: () => router.push("/account") };
    }
    if (!isConnected && showSolidarityOnboarding) {
      return { text: "Create account", onClick: onOnboardingOpen };
    }
    if (!isConnected) {
      return { text: "Connect", onClick: openConnectModal };
    }
    if (isAccountLoading) {
      return { text: "Loading", onClick: () => {} };
    }
    if (hasAccount) {
      return { text: "My account", onClick: () => router.push("/account") };
    }
    return { text: "Sign up", onClick: () => setIsSignupOpen(true) };
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
      "Poa (poa.box) is the simplest way for a group to become a real organization the members own together: rules, membership, and money in one place.",
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
    "alternateName": ["poa.box", "poa box", "Poa.box"],
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
      "Member owned organizations",
      "Worker cooperatives",
      "Student organizations",
      "Community organizations",
      "Direct democracy",
      "Participation based voting",
      "Vouch based membership",
      "Shared treasuries",
      "Open-source governance tools",
    ],
    "description":
      "Poa (poa.box) is the simplest way for a group to start an organization its members own: rules chosen from named templates, membership built on vouching, and a treasury that pays people in dollars.",
  };

  const softwareLD = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Poa",
    "alternateName": ["poa.box", "Poa Perpetual Organization Architect"],
    "applicationCategory": "BusinessApplication",
    "applicationSubCategory": "Member owned organization platform",
    "operatingSystem": "Web",
    "url": "https://poa.box",
    "description":
      "Start an organization your group owns: voting, membership, tasks, and a shared treasury in one place. Voting power is earned by participating. Free to use on poa.box.",
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
        title="Poa: start an organization your group owns"
        description="Poa is the simplest way for a group to become a real organization: rules you choose together, membership built on vouching, and a treasury that pays people in dollars. Nothing to install."
        path="/"
        keywords={[
          "member owned organization",
          "community owned organization",
          "start an organization",
          "worker cooperative software",
          "student organization governance",
          "creative collective",
          "club treasury",
          "vouch based membership",
          "participation based voting",
          "organization templates",
          "poa.box",
        ]}
        jsonLd={[webSite, organizationLD, softwareLD, breadcrumb]}
      />

      {/* Preload only the two faces the first paint needs; italic and the
          500 mono arrive on demand. */}
      <Head>
        <link rel="preload" href="/fonts/newsreader-var-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/plex-mono-500-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </Head>

      <Box
        as="a"
        href="#main-content"
        position="absolute"
        left="-9999px"
        top="0"
        zIndex="100"
        bg="paper.50"
        color="ink.900"
        fontFamily="ledger"
        fontSize="0.875rem"
        px={4}
        py={3}
        _focus={{ left: "8px", top: "8px" }}
      >
        Skip to content
      </Box>

      <Box minH="100vh" overflowX="hidden" bg="paper.100" sx={{ colorScheme: "light" }}>
        <CharterNav
          mounted={mounted}
          isPasskeyUser={isPasskeyUser}
          isConnected={isConnected}
          isAuthenticated={isAuthenticated}
          accountMenuItem={accountMenuItem}
          onSignInOpen={onSignInOpen}
        />

        <Box as="main" id="main-content">
          <CharterHero />
          <ProblemSection />
          <HowItWorks />
          <Pillars />
          <WhoItsFor />
          <Ethos />
        </Box>

        <CharterFooter />
      </Box>

      {/* Auth Modals — mount only after first open so dynamic() chunks
          stay deferred for visitors who never click sign-in. */}
      {isSignupOpen && (
        <SignupModal isOpen onClose={() => setIsSignupOpen(false)} />
      )}
      {isOnboardingOpen && (
        <SolidarityOnboardingModal
          isOpen
          onClose={onOnboardingClose}
          onSuccess={() => router.push('/account')}
        />
      )}
      {isSignInOpen && (
        <SignInModal
          isOpen
          onClose={onSignInClose}
          onSuccess={() => router.push('/account')}
          onCreateAccount={onOnboardingOpen}
        />
      )}
    </>
  );
}
