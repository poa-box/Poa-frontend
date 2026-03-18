import React from "react";
import Link from "next/link";
import Head from "next/head";
import {
  Box,
  Flex,
  Button,
  VStack,
  HStack,
  Text,
  Container,
  Heading,
  SimpleGrid,
  Icon,
  chakra,
} from "@chakra-ui/react";
import { motion } from "framer-motion";
import {
  HiUserGroup,
  HiShieldCheck,
  HiSparkles,
  HiLightningBolt,
} from "react-icons/hi";

import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

const MotionBox = chakra(motion.div);
const MotionSpan = motion.span;

/* ── Custom SVGs ────────────────────────────────────────────── */

/* Ownership constellation — shows people connected to a shared center */
const OwnershipGraphic = () => (
  <svg viewBox="0 0 400 400" width="100%" height="100%" style={{ maxWidth: 400 }}>
    <defs>
      <linearGradient id="ownerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#9055E8" stopOpacity="0.6" />
        <stop offset="100%" stopColor="#E85D85" stopOpacity="0.4" />
      </linearGradient>
      <linearGradient id="ownerDot" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#9055E8" />
        <stop offset="100%" stopColor="#E85D85" />
      </linearGradient>
      <radialGradient id="ownerGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#9055E8" stopOpacity="0.1" />
        <stop offset="100%" stopColor="#9055E8" stopOpacity="0" />
      </radialGradient>
    </defs>
    {/* Ambient glow */}
    <circle cx="200" cy="200" r="190" fill="url(#ownerGlow)" />
    {/* Outer orbit */}
    <circle cx="200" cy="200" r="170" fill="none" stroke="url(#ownerGrad)" strokeWidth="1" strokeDasharray="6 10" />
    {/* Middle orbit */}
    <circle cx="200" cy="200" r="120" fill="none" stroke="url(#ownerGrad)" strokeWidth="1.5" />
    {/* Inner orbit */}
    <circle cx="200" cy="200" r="65" fill="none" stroke="url(#ownerGrad)" strokeWidth="2" />
    {/* Core — the organization */}
    <circle cx="200" cy="200" r="30" fill="url(#ownerDot)" opacity="0.12" />
    <circle cx="200" cy="200" r="12" fill="url(#ownerDot)" opacity="0.4" />
    {/* People on outer orbit — contributors */}
    {[0, 40, 80, 120, 160, 200, 240, 280, 320].map((angle) => {
      const r = 170;
      const x = 200 + r * Math.cos((angle * Math.PI) / 180);
      const y = 200 + r * Math.sin((angle * Math.PI) / 180);
      return <circle key={`o-${angle}`} cx={x} cy={y} r="4.5" fill="#9055E8" opacity="0.35" />;
    })}
    {/* People on middle orbit — active members */}
    {[15, 75, 135, 195, 255, 315].map((angle) => {
      const r = 120;
      const x = 200 + r * Math.cos((angle * Math.PI) / 180);
      const y = 200 + r * Math.sin((angle * Math.PI) / 180);
      return <circle key={`m-${angle}`} cx={x} cy={y} r="6" fill="#E85D85" opacity="0.35" />;
    })}
    {/* People on inner orbit — core governance */}
    {[0, 90, 180, 270].map((angle) => {
      const r = 65;
      const x = 200 + r * Math.cos((angle * Math.PI) / 180);
      const y = 200 + r * Math.sin((angle * Math.PI) / 180);
      return <circle key={`i-${angle}`} cx={x} cy={y} r="7" fill="url(#ownerDot)" opacity="0.4" />;
    })}
    {/* Lines from inner members to core */}
    {[0, 90, 180, 270].map((angle) => {
      const r = 65;
      const x = 200 + r * Math.cos((angle * Math.PI) / 180);
      const y = 200 + r * Math.sin((angle * Math.PI) / 180);
      return (
        <line key={`li-${angle}`} x1={x} y1={y} x2={200} y2={200}
          stroke="url(#ownerDot)" strokeWidth="1.2" opacity="0.18" />
      );
    })}
    {/* Cross-connections on middle orbit */}
    {[15, 75, 135, 195, 255, 315].map((angle, i, arr) => {
      const r = 120;
      const next = arr[(i + 1) % arr.length];
      const x1 = 200 + r * Math.cos((angle * Math.PI) / 180);
      const y1 = 200 + r * Math.sin((angle * Math.PI) / 180);
      const x2 = 200 + r * Math.cos((next * Math.PI) / 180);
      const y2 = 200 + r * Math.sin((next * Math.PI) / 180);
      return (
        <line key={`cm-${angle}`} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="#E85D85" strokeWidth="0.8" opacity="0.1" />
      );
    })}
    {/* Lines from middle to inner orbit */}
    {[15, 135, 255].map((angle) => {
      const r1 = 120, r2 = 65;
      const x1 = 200 + r1 * Math.cos((angle * Math.PI) / 180);
      const y1 = 200 + r1 * Math.sin((angle * Math.PI) / 180);
      const closestInner = [0, 90, 180, 270].reduce((closest, a) => {
        const dx = Math.abs(angle - a);
        const dxClosest = Math.abs(angle - closest);
        return dx < dxClosest ? a : closest;
      }, 0);
      const x2 = 200 + r2 * Math.cos((closestInner * Math.PI) / 180);
      const y2 = 200 + r2 * Math.sin((closestInner * Math.PI) / 180);
      return (
        <line key={`mi-${angle}`} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="url(#ownerGrad)" strokeWidth="0.6" opacity="0.15" />
      );
    })}
  </svg>
);

/* Cycle graphic — circular flow representing the virtuous cycle */
const CycleGraphic = () => (
  <svg viewBox="0 0 360 360" width="100%" height="100%" style={{ maxWidth: 360 }}>
    <defs>
      <linearGradient id="cycleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#9055E8" stopOpacity="0.5" />
        <stop offset="100%" stopColor="#E85D85" stopOpacity="0.3" />
      </linearGradient>
      <linearGradient id="cycleDot" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#9055E8" />
        <stop offset="100%" stopColor="#E85D85" />
      </linearGradient>
      <radialGradient id="cycleGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#E85D85" stopOpacity="0.08" />
        <stop offset="100%" stopColor="#E85D85" stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle cx="180" cy="180" r="170" fill="url(#cycleGlow)" />
    {/* Main cycle ring — dashed to show motion */}
    <circle cx="180" cy="180" r="130" fill="none" stroke="url(#cycleGrad)" strokeWidth="2"
      strokeDasharray="12 6" strokeLinecap="round" />
    {/* Inner pulse */}
    <circle cx="180" cy="180" r="45" fill="url(#cycleDot)" opacity="0.06" />
    <circle cx="180" cy="180" r="18" fill="url(#cycleDot)" opacity="0.15" />
    {/* Three stations around the cycle */}
    {[
      { angle: 270, label: "Community", color: "#9055E8" },
      { angle: 30, label: "Poa", color: "#E85D85" },
      { angle: 150, label: "Organizations", color: "#7DD3FC" },
    ].map(({ angle, color }) => {
      const r = 130;
      const x = 180 + r * Math.cos((angle * Math.PI) / 180);
      const y = 180 + r * Math.sin((angle * Math.PI) / 180);
      return (
        <g key={angle}>
          <circle cx={x} cy={y} r="20" fill={color} opacity="0.08" />
          <circle cx={x} cy={y} r="10" fill={color} opacity="0.2" />
          <circle cx={x} cy={y} r="5" fill={color} opacity="0.4" />
        </g>
      );
    })}
    {/* Flow arrows — small triangles along the ring */}
    {[330, 90, 210].map((angle) => {
      const r = 130;
      const x = 180 + r * Math.cos((angle * Math.PI) / 180);
      const y = 180 + r * Math.sin((angle * Math.PI) / 180);
      const tangent = angle + 90;
      const size = 6;
      const tx = Math.cos((tangent * Math.PI) / 180);
      const ty = Math.sin((tangent * Math.PI) / 180);
      const nx = -ty;
      const ny = tx;
      return (
        <polygon key={`arr-${angle}`}
          points={`${x + tx * size},${y + ty * size} ${x - tx * size * 0.4 + nx * size * 0.6},${y - ty * size * 0.4 + ny * size * 0.6} ${x - tx * size * 0.4 - nx * size * 0.6},${y - ty * size * 0.4 - ny * size * 0.6}`}
          fill="url(#cycleDot)" opacity="0.3" />
      );
    })}
  </svg>
);

/* ── Animation helpers ──────────────────────────────────────── */

const HEADLINE_WORDS = "Community Ownership, Reimagined".split(" ");

const wordVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: "easeOut" },
  }),
};

/* ── Principles data ────────────────────────────────────────── */

const PRINCIPLES = [
  {
    icon: HiUserGroup,
    title: "Community Owned",
    description:
      "Votes are earned through contribution, not purchased with capital. Every member has a real voice in the direction of their organization.",
  },
  {
    icon: HiShieldCheck,
    title: "Fully Decentralized",
    description:
      "No single point of failure, no central authority. Once deployed, your organization can't be stopped or changed by anyone but its members.",
  },
  {
    icon: HiSparkles,
    title: "AI-Guided",
    description:
      "Poa walks you through every decision — governance model, roles, treasury setup — making decentralized organization building accessible to everyone.",
  },
  {
    icon: HiLightningBolt,
    title: "Transparent by Default",
    description:
      "Every transaction, every vote, every decision is on-chain and auditable. Trust is built into the infrastructure, not promised in a policy.",
  },
];

/* ── Steps data ─────────────────────────────────────────────── */

const STEPS = [
  {
    number: "01",
    title: "Describe Your Vision",
    description:
      "Tell Poa about your community. Our AI guide recommends the right governance model, voting system, and treasury structure for your goals.",
  },
  {
    number: "02",
    title: "Deploy in Minutes",
    description:
      "Poa deploys your smart contracts and sets up your infrastructure automatically. No code, no devops, no blockchain expertise required.",
  },
  {
    number: "03",
    title: "Govern Together",
    description:
      "Manage projects, track contributions, vote on proposals, and grow your treasury. Everything your community needs, owned by the people who built it.",
  },
];

/* ── Page Component ─────────────────────────────────────────── */

const AboutPage = () => {
  return (
    <>
      <Head>
        <title>About Poa — Community-Owned Organization Builder</title>
        <meta
          name="description"
          content="Learn how Poa enables communities to build democratic, decentralized organizations where voting power is earned through contribution, not purchased with capital."
        />
        <link rel="canonical" href="https://poa.community/about" />
      </Head>

      <Box minH="100vh" overflowX="hidden" bg="white">
        <Navbar />

        {/* ── Hero ─────────────────────────────────────────── */}
        <Box
          as="section"
          pt={["28", "36", "44"]}
          pb={["16", "24", "32"]}
          px={[4, 6, 8]}
          position="relative"
          overflow="visible"
        >
          {/* Morphing ambient orbs */}
          <Box
            position="absolute"
            top="-8%"
            left="-6%"
            w={["280px", "400px", "520px"]}
            h={["280px", "400px", "520px"]}
            bg="#7DD3FC"
            opacity={0.2}
            filter="blur(80px)"
            pointerEvents="none"
            sx={{
              animation: "aboutMorph1 20s ease-in-out infinite",
              "@keyframes aboutMorph1": {
                "0%": { borderRadius: "42% 58% 58% 42% / 58% 42% 58% 42%", transform: "translate(0, 0) rotate(0deg)" },
                "33%": { borderRadius: "58% 42% 50% 50% / 42% 58% 42% 58%", transform: "translate(25px, 15px) rotate(50deg)" },
                "66%": { borderRadius: "50% 50% 42% 58% / 50% 42% 58% 50%", transform: "translate(-15px, 35px) rotate(100deg)" },
                "100%": { borderRadius: "42% 58% 58% 42% / 58% 42% 58% 42%", transform: "translate(0, 0) rotate(0deg)" },
              },
            }}
          />
          <Box
            position="absolute"
            top="10%"
            right="-4%"
            w={["240px", "360px", "480px"]}
            h={["240px", "360px", "480px"]}
            bg="#67E8F9"
            opacity={0.16}
            filter="blur(80px)"
            pointerEvents="none"
            sx={{
              animation: "aboutMorph2 24s ease-in-out infinite",
              "@keyframes aboutMorph2": {
                "0%": { borderRadius: "58% 42% 50% 50% / 50% 58% 42% 50%", transform: "translate(0, 0) rotate(0deg)" },
                "33%": { borderRadius: "42% 58% 58% 42% / 58% 42% 58% 42%", transform: "translate(-20px, 25px) rotate(-50deg)" },
                "66%": { borderRadius: "50% 42% 50% 58% / 42% 58% 50% 42%", transform: "translate(15px, -10px) rotate(-100deg)" },
                "100%": { borderRadius: "58% 42% 50% 50% / 50% 58% 42% 50%", transform: "translate(0, 0) rotate(0deg)" },
              },
            }}
          />

          <Container maxW="container.md" textAlign="center" position="relative" zIndex={1}>
            <Text
              fontSize="sm"
              fontWeight="600"
              color="warmGray.400"
              letterSpacing="0.08em"
              textTransform="uppercase"
              mb={[4, 5]}
            >
              About Poa
            </Text>

            {/* Word-by-word gradient headline */}
            <Heading
              as="h1"
              fontSize={["4xl", "5xl", "6xl"]}
              fontWeight="700"
              lineHeight="1.15"
              mb={[6, 8]}
              letterSpacing="-0.02em"
              sx={{
                background: "linear-gradient(135deg, #7C3AED 0%, #A855F7 40%, #EC4899 100%)",
                backgroundSize: "200% 200%",
                animation: "gradientShift 8s ease infinite",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                "@keyframes gradientShift": {
                  "0%": { backgroundPosition: "0% 50%" },
                  "50%": { backgroundPosition: "100% 50%" },
                  "100%": { backgroundPosition: "0% 50%" },
                },
              }}
            >
              {HEADLINE_WORDS.map((word, i) => (
                <MotionSpan
                  key={i}
                  custom={i}
                  initial="hidden"
                  animate="visible"
                  variants={wordVariants}
                  style={{ display: "inline-block", marginRight: "0.3em" }}
                >
                  {word}
                </MotionSpan>
              ))}
            </Heading>

            <MotionBox
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.4 }}
            >
              <Text
                fontSize={["xl", "xl", "1.375rem"]}
                color="warmGray.600"
                maxW="560px"
                mx="auto"
                lineHeight="1.8"
                fontWeight="500"
              >
                Poa is a no-code platform for building organizations that are
                fully owned and governed by the people who create them.
                No investors, no middlemen — just community.
              </Text>
            </MotionBox>
          </Container>
        </Box>

        {/* ── What is a Community-Owned Organization? ───────── */}
        <Box as="section" py={["12", "16", "24"]} px={[4, 6, 8]}>
          <Container maxW="container.xl">
            <Flex
              direction={["column", "column", "row"]}
              align="center"
              gap={[8, 8, 12]}
            >
              <Box flex="1">
                <MotionBox
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.7 }}
                >
                  <VStack spacing={[4, 5]} align={["center", "center", "flex-start"]} textAlign={["center", "center", "left"]}>
                    <Text
                      fontSize="sm"
                      fontWeight="600"
                      color="warmGray.400"
                      letterSpacing="0.08em"
                      textTransform="uppercase"
                    >
                      The core idea
                    </Text>
                    <Heading
                      as="h2"
                      fontSize={["3xl", "4xl", "5xl"]}
                      fontWeight="700"
                      letterSpacing="-0.02em"
                      color="warmGray.900"
                    >
                      Built for People, Not Shareholders
                    </Heading>
                    <Text
                      fontSize={["xl", "2xl"]}
                      color="warmGray.600"
                      maxW="560px"
                      lineHeight="1.8"
                      fontWeight="500"
                    >
                      A community-owned organization is exactly what it sounds like: an organization
                      fully owned by the people who build it. Not investors, not a board of directors —
                      the community.
                    </Text>
                    <Text
                      fontSize={["lg", "xl"]}
                      color="warmGray.500"
                      maxW="560px"
                      lineHeight="1.8"
                      fontWeight="500"
                    >
                      Voting power is earned through contribution, making governance truly democratic
                      and resistant to capture. The value your community creates stays with the people
                      who created it.
                    </Text>
                  </VStack>
                </MotionBox>
              </Box>

              <Flex
                flex="1"
                justify="center"
                align="center"
                display={["none", "none", "flex"]}
                maxW="420px"
              >
                <MotionBox
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: 0.3 }}
                >
                  <OwnershipGraphic />
                </MotionBox>
              </Flex>
            </Flex>
          </Container>
        </Box>

        {/* ── How Poa Works ────────────────────────────────── */}
        <Box as="section" py={["16", "20", "28"]} px={[4, 6, 8]}>
          <Container maxW="container.xl">
            <MotionBox
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.7 }}
              mb={[10, 12, 16]}
              maxW="540px"
            >
              <Text
                fontSize="sm"
                fontWeight="600"
                color="warmGray.400"
                letterSpacing="0.08em"
                textTransform="uppercase"
                mb={[3, 4]}
              >
                How it works
              </Text>
              <Heading
                as="h2"
                fontSize={["3xl", "4xl", "5xl"]}
                fontWeight="700"
                letterSpacing="-0.01em"
                mb={[3, 4]}
              >
                From Idea to Organization in Minutes
              </Heading>
              <Text
                fontSize={["lg", "xl"]}
                color="warmGray.600"
                lineHeight="1.7"
                fontWeight="500"
              >
                Poa&apos;s AI guide walks you through every decision so you can focus on
                what matters — your community.
              </Text>
            </MotionBox>

            <SimpleGrid columns={[1, 1, 3]} spacing={[8, 10, 16]}>
              {STEPS.map((step, index) => (
                <MotionBox
                  key={step.number}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.6, delay: index * 0.12 }}
                >
                  <VStack align="flex-start" spacing={4}>
                    <Text
                      fontSize={["5xl", "6xl"]}
                      fontWeight="800"
                      lineHeight="1"
                      letterSpacing="-0.03em"
                      sx={{
                        background: "linear-gradient(135deg, #9055E8 0%, #E85D85 100%)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                        opacity: 0.25,
                      }}
                    >
                      {step.number}
                    </Text>
                    <Heading as="h3" fontSize="xl" fontWeight="700">
                      {step.title}
                    </Heading>
                    <Text fontSize="lg" color="warmGray.600" lineHeight="1.7" fontWeight="500">
                      {step.description}
                    </Text>
                  </VStack>
                </MotionBox>
              ))}
            </SimpleGrid>
          </Container>
        </Box>

        {/* ── Core Principles ──────────────────────────────── */}
        <Box as="section" py={["16", "20", "28"]} px={[4, 6, 8]}>
          <Container maxW="container.xl">
            <MotionBox
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.7 }}
              mb={[10, 12, 16]}
              maxW="540px"
            >
              <Heading
                as="h2"
                fontSize={["2xl", "3xl", "4xl"]}
                fontWeight="700"
                letterSpacing="-0.01em"
                mb={[3, 4]}
              >
                What We Believe
              </Heading>
              <Text
                fontSize={["lg", "xl"]}
                color="warmGray.600"
                lineHeight="1.7"
                fontWeight="500"
              >
                Every design decision in Poa is guided by these principles.
              </Text>
            </MotionBox>

            <SimpleGrid columns={[1, 2, 4]} spacing={[10, 12, 16]}>
              {PRINCIPLES.map((principle, index) => (
                <MotionBox
                  key={principle.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                >
                  <VStack
                    align="flex-start"
                    spacing={3}
                    pt={6}
                    role="group"
                    cursor="default"
                    sx={{
                      borderTop: "2px solid",
                      borderColor: "var(--chakra-colors-warmGray-100)",
                      transition: "border-color 0.3s",
                      _hover: {
                        borderImage: "linear-gradient(90deg, #9055E8, #E85D85) 1",
                      },
                    }}
                  >
                    <Icon
                      as={principle.icon}
                      boxSize={5}
                      color="warmGray.400"
                      transition="color 0.3s"
                      _groupHover={{ color: "amethyst.500" }}
                    />
                    <Heading as="h3" fontSize="xl" fontWeight="700">
                      {principle.title}
                    </Heading>
                    <Text fontSize="lg" color="warmGray.600" lineHeight="1.7" fontWeight="500">
                      {principle.description}
                    </Text>
                  </VStack>
                </MotionBox>
              ))}
            </SimpleGrid>
          </Container>
        </Box>

        {/* ── The Virtuous Cycle ───────────────────────────── */}
        <Box as="section" py={["12", "16", "24"]} px={[4, 6, 8]}>
          <Container maxW="container.xl">
            <Flex
              direction={["column", "column", "row-reverse"]}
              align="center"
              gap={[8, 8, 12]}
            >
              <Box flex="1">
                <MotionBox
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.7 }}
                  maxW="600px"
                >
                  <Text
                    fontSize="sm"
                    fontWeight="600"
                    color="warmGray.400"
                    letterSpacing="0.08em"
                    textTransform="uppercase"
                    mb={[3, 4]}
                  >
                    The community cycle
                  </Text>
                  <Heading
                    as="h2"
                    fontSize={["3xl", "4xl", "5xl"]}
                    fontWeight="700"
                    letterSpacing="-0.01em"
                    mb={[4, 5]}
                  >
                    Built by Community, for Communities
                  </Heading>
                  <Text
                    fontSize={["xl", "2xl"]}
                    color="warmGray.600"
                    lineHeight="1.8"
                    fontWeight="500"
                    mb={[3, 4]}
                  >
                    Poa itself is a community-owned organization. Our community builds Poa so that
                    Poa can help others build their own communities. Every improvement we make
                    benefits every organization on the platform.
                  </Text>
                  <Text
                    fontSize={["lg", "xl"]}
                    color="warmGray.500"
                    lineHeight="1.8"
                    fontWeight="500"
                  >
                    It&apos;s a virtuous cycle: the more communities that use Poa, the stronger the
                    platform becomes, and the better it serves everyone.
                  </Text>
                </MotionBox>
              </Box>

              <Flex
                flex="1"
                justify="center"
                align="center"
                display={["none", "none", "flex"]}
                maxW="380px"
              >
                <MotionBox
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                >
                  <CycleGraphic />
                </MotionBox>
              </Flex>
            </Flex>
          </Container>
        </Box>

        {/* ── Quote / Ethos ────────────────────────────────── */}
        <Box as="section" py={["16", "20", "24"]} px={[4, 6, 8]}>
          <Container maxW="container.md" textAlign="center">
            <MotionBox
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.8 }}
            >
              <Box
                h="1px"
                maxW="120px"
                mx="auto"
                mb={[10, 12]}
                bgGradient="linear(to-r, transparent, #9055E8, #E85D85, transparent)"
              />
              <Heading
                as="h2"
                fontSize={["2xl", "3xl", "4xl"]}
                fontWeight="700"
                letterSpacing="-0.02em"
                lineHeight="1.3"
                color="warmGray.800"
                maxW="640px"
                mx="auto"
                fontStyle="italic"
              >
                &ldquo;Building a future owned by people, not capital.&rdquo;
              </Heading>
              <Box
                h="1px"
                maxW="120px"
                mx="auto"
                mt={[10, 12]}
                bgGradient="linear(to-r, transparent, #9055E8, #E85D85, transparent)"
              />
            </MotionBox>
          </Container>
        </Box>

        {/* ── CTA ──────────────────────────────────────────── */}
        <Box as="section" py={["16", "20", "24"]} px={[4, 6, 8]}>
          <Container maxW="container.md" textAlign="center">
            <MotionBox
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.7 }}
            >
              <VStack spacing={[5, 6]}>
                <Heading
                  as="h2"
                  fontSize={["2xl", "3xl", "4xl"]}
                  fontWeight="700"
                  letterSpacing="-0.02em"
                >
                  Ready to Build?
                </Heading>
                <Text
                  fontSize={["lg", "xl"]}
                  color="warmGray.600"
                  maxW="480px"
                >
                  Start your community-owned organization in minutes.
                </Text>
                <HStack
                  spacing={[3, 4]}
                  justify="center"
                  flexWrap="wrap"
                  direction={["column", "row"]}
                >
                  <Link href="/create" style={{ textDecoration: "none" }}>
                    <Button
                      size="lg"
                      bg="warmGray.900"
                      color="white"
                      borderRadius="full"
                      px={[6, 8]}
                      fontSize="md"
                      fontWeight="600"
                      _hover={{ bg: "warmGray.800" }}
                      _active={{ bg: "warmGray.700" }}
                      transition="background 0.2s"
                    >
                      Create an Organization
                    </Button>
                  </Link>
                  <Link href="/browser" style={{ textDecoration: "none" }}>
                    <Button
                      size="lg"
                      variant="outline"
                      borderColor="warmGray.200"
                      color="warmGray.700"
                      borderRadius="full"
                      px={[6, 8]}
                      fontSize="md"
                      fontWeight="600"
                      bg="white"
                      _hover={{
                        borderColor: "warmGray.400",
                        bg: "warmGray.50",
                      }}
                      _active={{ bg: "warmGray.100" }}
                      transition="background 0.2s, border-color 0.2s"
                    >
                      Explore Organizations
                    </Button>
                  </Link>
                </HStack>
              </VStack>
            </MotionBox>
          </Container>
        </Box>

        <Footer />
      </Box>
    </>
  );
};

export default AboutPage;
