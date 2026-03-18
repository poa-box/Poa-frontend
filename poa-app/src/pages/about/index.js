import React from "react";
import Link from "next/link";
import Head from "next/head";
import {
  Box,
  Flex,
  Button,
  VStack,
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

/* ── Data ────────────────────────────────────────────────────── */

const PRINCIPLES = [
  {
    icon: HiUserGroup,
    title: "Earned Governance",
    description:
      "Voting power comes from contribution, not capital. The people doing the work shape the direction.",
  },
  {
    icon: HiShieldCheck,
    title: "Unstoppable Infrastructure",
    description:
      "Once deployed, no one can shut down or alter your organization. Not even us. It belongs entirely to your community.",
  },
  {
    icon: HiSparkles,
    title: "Guided Creation",
    description:
      "Poa guides you through governance design, treasury setup, and role configuration step by step. No technical background needed.",
  },
  {
    icon: HiLightningBolt,
    title: "Radical Transparency",
    description:
      "Every vote, every transaction, every decision lives on-chain. Trust isn't something we promise. It's baked into the system.",
  },
];

const STEPS = [
  {
    number: "1",
    title: "Describe your community",
    description:
      "Tell Poa what you're building. You'll choose from governance models like direct democracy, contribution-weighted voting, or a hybrid, with Poa walking you through what each one means for your community.",
  },
  {
    number: "2",
    title: "Deploy on-chain",
    description:
      "Poa deploys your governance contracts, treasury, and organization dashboard to the blockchain. Everything is live and verifiable in minutes. Nothing to install, nothing to host.",
  },
  {
    number: "3",
    title: "Run your organization",
    description:
      "Create tasks and projects, submit and vote on proposals, manage your treasury, and onboard new members. It's a full operating system for your community, not just a voting tool.",
  },
];

/* ── Page ────────────────────────────────────────────────────── */

const AboutPage = () => {
  return (
    <>
      <Head>
        <title>About Poa - Community-Owned Organization Builder</title>
        <meta
          name="description"
          content="Learn how Poa enables communities to build democratic, decentralized organizations where voting power is earned through contribution."
        />
        <link rel="canonical" href="https://poa.community/about" />
      </Head>

      <Box minH="100vh" overflowX="hidden" bg="white">
        <Navbar />

        {/* ── Dark Hero ────────────────────────────────────── */}
        <Box
          as="section"
          bg="warmGray.900"
          pt={["32", "40", "48"]}
          pb={["20", "28", "36"]}
          px={[4, 6, 8]}
          position="relative"
          overflow="hidden"
        >
          <Box
            position="absolute"
            bottom="-20%"
            left="50%"
            transform="translateX(-50%)"
            w={["600px", "900px", "1200px"]}
            h={["300px", "450px", "600px"]}
            bgGradient="radial(circle, rgba(144, 85, 232, 0.22) 0%, rgba(232, 93, 133, 0.1) 40%, transparent 70%)"
            pointerEvents="none"
          />

          <Container maxW="container.lg" position="relative" zIndex={1}>
            <MotionBox
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <Text
                fontSize="sm"
                fontWeight="600"
                color="warmGray.500"
                letterSpacing="0.1em"
                textTransform="uppercase"
                mb={[5, 6]}
              >
                About Poa
              </Text>
              <Heading
                as="h1"
                fontSize={["4xl", "5xl", "6xl", "7xl"]}
                fontWeight="700"
                color="white"
                lineHeight="1.1"
                letterSpacing="-0.03em"
                maxW="800px"
                mb={[6, 8]}
              >
                Every community deserves infrastructure it truly owns.
              </Heading>
              <Text
                fontSize={["lg", "xl", "2xl"]}
                color="warmGray.300"
                maxW="620px"
                lineHeight="1.7"
                fontWeight="500"
              >
                Poa makes it possible to create, manage, and govern organizations where
                every contributor has a real stake. No investors, no middlemen, just
                people building together.
              </Text>
            </MotionBox>
          </Container>
        </Box>

        {/* ── The Problem ──────────────────────────────────── */}
        <Box as="section" py={["16", "24", "32"]} px={[4, 6, 8]}>
          <Container maxW="container.lg">
            <MotionBox
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 1 }}
            >
              <Text
                fontSize="sm"
                fontWeight="600"
                color="warmGray.400"
                letterSpacing="0.08em"
                textTransform="uppercase"
                mb={[4, 5]}
              >
                Why Poa exists
              </Text>
              <Text
                fontSize={["2xl", "3xl", "4xl"]}
                fontWeight="600"
                color="warmGray.800"
                lineHeight="1.5"
                maxW="900px"
              >
                Running a group is hard. Coordinating decisions, tracking who did what, managing
                money, keeping things fair. Most tools either don&apos;t solve these problems or
                put someone else in control.{" "}
                <Text
                  as="span"
                  sx={{
                    background: "linear-gradient(135deg, #9055E8, #E85D85)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  Poa gives that control to the community itself.
                </Text>
              </Text>
            </MotionBox>
          </Container>
        </Box>

        {/* ── What you get ──────────────────────────────────── */}
        <Box as="section" bg="warmGray.50" py={["16", "20", "28"]} px={[4, 6, 8]}>
          <Container maxW="container.lg">
            <MotionBox
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.7 }}
              mb={[8, 10, 14]}
            >
              <Text
                fontSize="sm"
                fontWeight="600"
                color="warmGray.400"
                letterSpacing="0.08em"
                textTransform="uppercase"
                mb={[3, 4]}
              >
                What you get
              </Text>
              <Heading
                as="h2"
                fontSize={["2xl", "3xl", "4xl"]}
                fontWeight="700"
                letterSpacing="-0.02em"
                color="warmGray.900"
                maxW="600px"
              >
                Everything your group needs to run itself
              </Heading>
            </MotionBox>

            <SimpleGrid columns={[1, 2, 3]} spacing={[5, 6, 8]}>
              {[
                { label: "Governance and voting", detail: "Create proposals, vote on decisions, and set the rules for how your group makes choices." },
                { label: "Task and project management", detail: "Post tasks, assign work, and track progress. Contributions are recorded and visible to everyone." },
                { label: "Shared treasury", detail: "Pool and manage funds together. Every transaction is transparent and governed by your community." },
                { label: "Roles and permissions", detail: "Define who can do what. Set up trust levels, vouching, and role-based access for your members." },
                { label: "Contribution tracking", detail: "Members earn influence based on what they actually do. The more someone contributes, the more say they have." },
                { label: "On-chain and permanent", detail: "Everything runs on smart contracts. Your org can't be shut down or changed by anyone outside your community." },
              ].map((item, i) => (
                <MotionBox
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.5, delay: i * 0.06 }}
                >
                  <Box
                    p={[4, 5]}
                    bg="white"
                    borderRadius="lg"
                    border="1px solid"
                    borderColor="warmGray.100"
                    h="100%"
                    transition="box-shadow 0.3s, border-color 0.3s"
                    _hover={{
                      boxShadow: "0 2px 12px rgba(0, 0, 0, 0.04)",
                      borderColor: "warmGray.200",
                    }}
                  >
                    <Text fontWeight="700" color="warmGray.900" fontSize="md" mb={2}>
                      {item.label}
                    </Text>
                    <Text color="warmGray.500" fontSize="sm" lineHeight="1.6" fontWeight="500">
                      {item.detail}
                    </Text>
                  </Box>
                </MotionBox>
              ))}
            </SimpleGrid>
          </Container>
        </Box>

        {/* ── How It Works ─────────────────────────────────── */}
        <Box as="section" py={["16", "20", "28"]} px={[4, 6, 8]}>
          <Container maxW="container.md">
            <MotionBox
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.7 }}
              textAlign="center"
              mb={[12, 16]}
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
                fontSize={["2xl", "3xl", "4xl"]}
                fontWeight="700"
                letterSpacing="-0.02em"
              >
                Three steps. Zero code. Fully yours.
              </Heading>
            </MotionBox>

            <VStack spacing={0} align="stretch" position="relative">
              <Box
                position="absolute"
                left={["20px", "24px"]}
                top="0"
                bottom="0"
                w="1px"
                bgGradient="linear(to-b, warmGray.200, warmGray.100)"
                display={["none", "block"]}
              />

              {STEPS.map((step, index) => (
                <MotionBox
                  key={step.number}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  pb={index < STEPS.length - 1 ? [8, 12] : 0}
                >
                  <Flex align="flex-start" gap={[4, 6]}>
                    <Flex
                      flexShrink={0}
                      w={["40px", "48px"]}
                      h={["40px", "48px"]}
                      borderRadius="full"
                      bg="warmGray.900"
                      color="white"
                      align="center"
                      justify="center"
                      fontWeight="700"
                      fontSize={["sm", "md"]}
                      position="relative"
                      zIndex={1}
                    >
                      {step.number}
                    </Flex>
                    <Box pt={[1, 2]}>
                      <Heading as="h3" fontSize={["lg", "xl"]} fontWeight="700" mb={2}>
                        {step.title}
                      </Heading>
                      <Text fontSize={["md", "lg"]} color="warmGray.600" lineHeight="1.7" fontWeight="500">
                        {step.description}
                      </Text>
                    </Box>
                  </Flex>
                </MotionBox>
              ))}
            </VStack>
          </Container>
        </Box>

        {/* ── Principles (dark section) ────────────────────── */}
        <Box as="section" bg="warmGray.900" py={["16", "20", "28"]} px={[4, 6, 8]}>
          <Container maxW="container.xl">
            <MotionBox
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.7 }}
              mb={[10, 12, 16]}
              textAlign={["center", "center", "left"]}
            >
              <Heading
                as="h2"
                fontSize={["2xl", "3xl", "4xl"]}
                fontWeight="700"
                letterSpacing="-0.02em"
                color="white"
                mb={[3, 4]}
              >
                What We Believe
              </Heading>
              <Text
                fontSize={["lg", "xl"]}
                color="warmGray.400"
                lineHeight="1.7"
                fontWeight="500"
                maxW="500px"
                mx={["auto", "auto", 0]}
              >
                Every decision in Poa is guided by these principles.
              </Text>
            </MotionBox>

            <SimpleGrid columns={[1, 2, 4]} spacing={[6, 8]}>
              {PRINCIPLES.map((principle, index) => (
                <MotionBox
                  key={principle.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.6, delay: index * 0.08 }}
                >
                  <Box
                    p={[5, 6]}
                    borderRadius="xl"
                    bg="whiteAlpha.50"
                    border="1px solid"
                    borderColor="whiteAlpha.100"
                    h="100%"
                    transition="background 0.3s, border-color 0.3s"
                    _hover={{
                      bg: "whiteAlpha.100",
                      borderColor: "whiteAlpha.200",
                    }}
                  >
                    <Icon
                      as={principle.icon}
                      boxSize={5}
                      color="amethyst.400"
                      mb={4}
                    />
                    <Heading as="h3" fontSize="lg" fontWeight="700" color="white" mb={3}>
                      {principle.title}
                    </Heading>
                    <Text fontSize="md" color="warmGray.400" lineHeight="1.7" fontWeight="500">
                      {principle.description}
                    </Text>
                  </Box>
                </MotionBox>
              ))}
            </SimpleGrid>
          </Container>
        </Box>

        {/* ── Poa is community-owned too ───────────────────── */}
        <Box as="section" py={["16", "20", "28"]} px={[4, 6, 8]}>
          <Container maxW="container.md">
            <MotionBox
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.7 }}
            >
              <Text
                fontSize="sm"
                fontWeight="600"
                color="warmGray.400"
                letterSpacing="0.08em"
                textTransform="uppercase"
                mb={[3, 4]}
              >
                Eating our own cooking
              </Text>
              <Heading
                as="h2"
                fontSize={["2xl", "3xl", "4xl"]}
                fontWeight="700"
                letterSpacing="-0.02em"
                mb={[5, 6]}
              >
                Poa is built on Poa
              </Heading>
              <Box
                borderLeft="3px solid"
                borderImage="linear-gradient(to bottom, #9055E8, #E85D85) 1"
                pl={[5, 6]}
              >
                <VStack spacing={[4, 5]} align="stretch">
                  <Text
                    fontSize={["lg", "xl"]}
                    color="warmGray.600"
                    lineHeight="1.8"
                    fontWeight="500"
                  >
                    We didn&apos;t just build a tool for community-owned organizations. We are one.
                    Poa itself runs as a community-owned organization on its own platform. Our
                    contributors earn governance power and shape what gets built next.
                  </Text>
                  <Text
                    fontSize={["lg", "xl"]}
                    color="warmGray.600"
                    lineHeight="1.8"
                    fontWeight="500"
                  >
                    That means every improvement to Poa is decided by the people who use it and
                    build it. If the platform doesn&apos;t work for real communities, we&apos;re the first
                    to feel it. It keeps us honest.
                  </Text>
                </VStack>
              </Box>
            </MotionBox>
          </Container>
        </Box>

        {/* ── Where we are ─────────────────────────────────── */}
        <Box as="section" bg="warmGray.50" py={["16", "20", "24"]} px={[4, 6, 8]}>
          <Container maxW="container.lg">
            <MotionBox
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.7 }}
            >
              <Text
                fontSize="sm"
                fontWeight="600"
                color="warmGray.400"
                letterSpacing="0.08em"
                textTransform="uppercase"
                mb={[3, 4]}
              >
                Where we are
              </Text>
              <Heading
                as="h2"
                fontSize={["2xl", "3xl", "4xl"]}
                fontWeight="700"
                letterSpacing="-0.02em"
                mb={[5, 6]}
              >
                Live and growing
              </Heading>
              <SimpleGrid columns={[1, 1, 3]} spacing={[5, 6, 10]}>
                <Box>
                  <Text fontWeight="700" color="warmGray.900" fontSize="lg" mb={2}>
                    Open source
                  </Text>
                  <Text color="warmGray.600" fontSize={["md", "lg"]} lineHeight="1.7" fontWeight="500">
                    Every line of Poa&apos;s code is public. The smart contracts, the frontend, the
                    subgraph. Anyone can audit it, fork it, or contribute to it.
                  </Text>
                </Box>
                <Box>
                  <Text fontWeight="700" color="warmGray.900" fontSize="lg" mb={2}>
                    Multi-chain
                  </Text>
                  <Text color="warmGray.600" fontSize={["md", "lg"]} lineHeight="1.7" fontWeight="500">
                    Deploy your organization on the network that makes sense for your community.
                    Poa supports multiple EVM-compatible chains and is expanding to more.
                  </Text>
                </Box>
                <Box>
                  <Text fontWeight="700" color="warmGray.900" fontSize="lg" mb={2}>
                    Early and active
                  </Text>
                  <Text color="warmGray.600" fontSize={["md", "lg"]} lineHeight="1.7" fontWeight="500">
                    Poa is live today and being used by real communities. We&apos;re still early,
                    which means you can shape what the platform becomes.
                  </Text>
                </Box>
              </SimpleGrid>
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
                  See it for yourself
                </Heading>
                <Text
                  fontSize={["lg", "xl"]}
                  color="warmGray.600"
                  maxW="480px"
                >
                  Create your first community-owned organization or explore what others have already built.
                </Text>
                <Flex
                  gap={[3, 4]}
                  justify="center"
                  direction={["column", "row"]}
                  align="center"
                  w="100%"
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
                      Get Started
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
                      Browse Organizations
                    </Button>
                  </Link>
                </Flex>
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
