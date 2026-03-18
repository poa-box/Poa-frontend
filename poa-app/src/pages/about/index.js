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

/* ── Data ────────────────────────────────────────────────────── */

const STATS = [
  { value: "100%", label: "Community Owned" },
  { value: "0", label: "Investors" },
  { value: "\u221E", label: "Possibilities" },
];

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
      "Once deployed, no one \u2014 not even us \u2014 can shut down or alter your organization. It belongs to your community.",
  },
  {
    icon: HiSparkles,
    title: "Guided Creation",
    description:
      "Our AI assistant walks you through governance design, treasury setup, and role configuration. No expertise required.",
  },
  {
    icon: HiLightningBolt,
    title: "Radical Transparency",
    description:
      "Every vote, every transaction, every decision lives on-chain. Trust isn\u2019t a promise \u2014 it\u2019s built into the system.",
  },
];

const STEPS = [
  {
    number: "1",
    title: "Describe your community",
    description:
      "Tell Poa what you\u2019re building. Our AI recommends the governance model, voting system, and structure that fits your goals.",
  },
  {
    number: "2",
    title: "Deploy automatically",
    description:
      "Smart contracts, infrastructure, and your organization dashboard \u2014 all deployed in minutes with zero code.",
  },
  {
    number: "3",
    title: "Govern together",
    description:
      "Manage projects, vote on proposals, track contributions, and grow your treasury. Everything owned by the people who built it.",
  },
];

/* ── Page ────────────────────────────────────────────────────── */

const AboutPage = () => {
  return (
    <>
      <Head>
        <title>About Poa — Community-Owned Organization Builder</title>
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
          {/* Subtle gradient wash — NOT orbs */}
          <Box
            position="absolute"
            bottom="-20%"
            left="50%"
            transform="translateX(-50%)"
            w={["600px", "900px", "1200px"]}
            h={["300px", "450px", "600px"]}
            bgGradient="radial(circle, rgba(144, 85, 232, 0.15) 0%, rgba(232, 93, 133, 0.08) 40%, transparent 70%)"
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
                Organizations should belong to the people who build them.
              </Heading>
              <Text
                fontSize={["lg", "xl", "2xl"]}
                color="warmGray.400"
                maxW="600px"
                lineHeight="1.7"
                fontWeight="500"
              >
                Poa is a no-code platform for creating community-owned organizations —
                democratic, decentralized, and built to last.
              </Text>
            </MotionBox>
          </Container>
        </Box>

        {/* ── Stats Strip ──────────────────────────────────── */}
        <Box
          as="section"
          bgGradient="linear(135deg, #9055E8, #E85D85)"
          py={[8, 10]}
          px={[4, 6, 8]}
        >
          <Container maxW="container.lg">
            <SimpleGrid columns={[1, 3]} spacing={[6, 8]}>
              {STATS.map((stat) => (
                <Box key={stat.label} textAlign="center">
                  <Text
                    fontSize={["4xl", "5xl"]}
                    fontWeight="800"
                    color="white"
                    letterSpacing="-0.02em"
                    lineHeight="1"
                  >
                    {stat.value}
                  </Text>
                  <Text
                    fontSize="sm"
                    fontWeight="600"
                    color="whiteAlpha.800"
                    letterSpacing="0.06em"
                    textTransform="uppercase"
                    mt={2}
                  >
                    {stat.label}
                  </Text>
                </Box>
              ))}
            </SimpleGrid>
          </Container>
        </Box>

        {/* ── Manifesto ────────────────────────────────────── */}
        <Box as="section" py={["20", "28", "36"]} px={[4, 6, 8]}>
          <Container maxW="container.lg">
            <MotionBox
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 1 }}
            >
              <Text
                fontSize={["2xl", "3xl", "4xl"]}
                fontWeight="600"
                color="warmGray.800"
                lineHeight="1.5"
                maxW="900px"
              >
                We believe the people who contribute to an organization should own it.
                Not investors. Not a board. Not a platform.{" "}
                <Text
                  as="span"
                  sx={{
                    background: "linear-gradient(135deg, #9055E8, #E85D85)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  The community.
                </Text>
              </Text>
            </MotionBox>
          </Container>
        </Box>

        {/* ── What is a Community-Owned Organization? ───────── */}
        <Box as="section" bg="warmGray.50" py={["16", "20", "28"]} px={[4, 6, 8]}>
          <Container maxW="container.lg">
            <SimpleGrid columns={[1, 1, 2]} spacing={[8, 10, 16]} alignItems="center">
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
                  The core idea
                </Text>
                <Heading
                  as="h2"
                  fontSize={["2xl", "3xl", "4xl"]}
                  fontWeight="700"
                  letterSpacing="-0.02em"
                  color="warmGray.900"
                  mb={[4, 5]}
                >
                  What is a community-owned organization?
                </Heading>
                <Text
                  fontSize={["lg", "xl"]}
                  color="warmGray.600"
                  lineHeight="1.8"
                  fontWeight="500"
                >
                  It&apos;s exactly what it sounds like — an organization fully owned by the people who
                  build it. No shareholders extracting value. No central authority making decisions.
                  Just a community governing itself.
                </Text>
              </MotionBox>

              <MotionBox
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.7, delay: 0.15 }}
              >
                <VStack spacing={4} align="stretch">
                  {[
                    { label: "Voting power is earned", detail: "Through contribution, not purchased with capital" },
                    { label: "Governance is democratic", detail: "Every member has a real voice in decisions" },
                    { label: "Value stays with creators", detail: "The community captures what the community creates" },
                    { label: "Infrastructure is permanent", detail: "No one can shut it down — not even us" },
                  ].map((item, i) => (
                    <Box
                      key={i}
                      p={[4, 5]}
                      bg="white"
                      borderRadius="lg"
                      border="1px solid"
                      borderColor="warmGray.100"
                    >
                      <Text fontWeight="700" color="warmGray.900" fontSize="md" mb={1}>
                        {item.label}
                      </Text>
                      <Text color="warmGray.500" fontSize="sm" fontWeight="500">
                        {item.detail}
                      </Text>
                    </Box>
                  ))}
                </VStack>
              </MotionBox>
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
                From idea to organization in minutes
              </Heading>
            </MotionBox>

            {/* Vertical timeline */}
            <VStack spacing={0} align="stretch" position="relative">
              {/* Vertical line */}
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

        {/* ── The Story ────────────────────────────────────── */}
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
                Our story
              </Text>
              <Heading
                as="h2"
                fontSize={["2xl", "3xl", "4xl"]}
                fontWeight="700"
                letterSpacing="-0.02em"
                mb={[5, 6]}
              >
                Built by community, for communities
              </Heading>
              <VStack spacing={[4, 5]} align="stretch">
                <Text
                  fontSize={["lg", "xl"]}
                  color="warmGray.600"
                  lineHeight="1.8"
                  fontWeight="500"
                >
                  Poa itself is a community-owned organization. Our community builds Poa so
                  that Poa can help others build their own communities. Every improvement we
                  make benefits every organization on the platform.
                </Text>
                <Text
                  fontSize={["lg", "xl"]}
                  color="warmGray.600"
                  lineHeight="1.8"
                  fontWeight="500"
                >
                  It&apos;s a virtuous cycle: the more communities that join, the stronger the
                  platform becomes. We&apos;re not building a product to sell — we&apos;re building
                  infrastructure for a future where organizations serve their members, not their
                  investors.
                </Text>
              </VStack>
            </MotionBox>
          </Container>
        </Box>

        {/* ── Pull Quote ───────────────────────────────────── */}
        <Box as="section" bg="warmGray.50" py={["16", "20", "24"]} px={[4, 6, 8]}>
          <Container maxW="container.md" textAlign="center">
            <MotionBox
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 1 }}
            >
              <Box
                h="2px"
                w="40px"
                mx="auto"
                mb={[8, 10]}
                bgGradient="linear(to-r, #9055E8, #E85D85)"
                borderRadius="full"
              />
              <Text
                fontSize={["xl", "2xl", "3xl"]}
                fontWeight="600"
                color="warmGray.700"
                lineHeight="1.5"
                fontStyle="italic"
              >
                &ldquo;Building a future owned by people, not capital.&rdquo;
              </Text>
              <Box
                h="2px"
                w="40px"
                mx="auto"
                mt={[8, 10]}
                bgGradient="linear(to-r, #9055E8, #E85D85)"
                borderRadius="full"
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
                  Ready to build?
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
