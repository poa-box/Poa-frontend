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
const FAQSection = dynamic(() => import("@/components/landing/FAQSection"));
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

  const faqLD = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "How is Poa different from Slack, Notion, or Google Workspace?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text":
            "Those tools help you talk and collaborate. They're good at that. What they don't do is give the members real authority over the money, the rules, or who holds what role. The final word still sits with whoever owns the workspace. Poa is built the other way around. Every vote, every spending decision, every role change is governed by the community's own rules. The founder is just another member.",
        },
      },
      {
        "@type": "Question",
        "name": "Can a student organization or worker cooperative actually use this?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text":
            "Yes. Student clubs and worker co-ops are exactly who Poa is designed for. Members join with a passkey, the same kind your phone already uses for face or fingerprint sign-in. No apps. No wallets. Nothing to install. Officers, members, and contributors get accountability and transparency on every consequential decision the community makes.",
        },
      },
      {
        "@type": "Question",
        "name": "How does contribution-based voting work?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text":
            "Members earn participation tokens by completing tasks and doing real work for the organization. Those tokens convert into voting power. The people building the community shape its direction. Not the loudest voice in the room. Not the biggest donor. The full mechanics live in the contribution-based voting guide at poa.box/docs/contributionVoting.",
        },
      },
      {
        "@type": "Question",
        "name": "What happens if a member or officer goes rogue?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text":
            "No single person can override the community's rules. There's no admin password. There's no support agent who can bypass a vote. There's no founder with a kill switch. Every consequential action, including spending money, changing rules, and adding or removing members, requires a community vote according to the governance model your group chose at the start.",
        },
      },
      {
        "@type": "Question",
        "name": "What happens if Poa as a company shuts down?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text":
            "Your organization keeps running. Member records, the treasury, voting history, and the rules of the organization all live in shared infrastructure that does not depend on us as a company. We built it that way on purpose. Even we could not take it away from you if we wanted to. That is the deal we are offering.",
        },
      },
      {
        "@type": "Question",
        "name": "Is Poa free to use?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text":
            "The platform is free. Each organization covers a small amount of infrastructure cost for the actions it takes, and most groups get this sponsored automatically by Poa's shared community fund. You'll see exactly what's covered when you set up your organization. No card required to start.",
        },
      },
      {
        "@type": "Question",
        "name": "How do payments and money management work?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text":
            "Every Poa organization has a shared treasury. Think of it as a checking account the community owns together. Spending requires a community vote. Every transaction is publicly visible to members. No outside party can freeze the funds. Not a bank. Not a payment processor. Not a platform admin. Not us. We build this on blockchain infrastructure (Poa is a DAO platform under the hood) because it is the only honest way to deliver what we are promising. The rules are enforced by code and cryptography, not by a company's policy team. If a bank does not like your community, they can close your account. If a software provider changes their terms, they can lock you out. Poa was built so that the rules of your organization, including who controls the money, are enforced by the infrastructure itself. The same infrastructure keeps working even if we shut the company down tomorrow.",
        },
      },
    ],
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
        jsonLd={[webSite, organizationLD, softwareLD, faqLD, breadcrumb]}
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
        <FAQSection />
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
