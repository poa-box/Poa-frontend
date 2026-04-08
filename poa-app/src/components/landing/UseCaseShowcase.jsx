import React from "react";
import Link from "next/link";
import {
  Box,
  Flex,
  Text,
  VStack,
  Heading,
  Grid,
  GridItem,
  Icon,
  Container,
  chakra,
} from "@chakra-ui/react";
import { motion } from "framer-motion";
import {
  HiAcademicCap,
  HiUserGroup,
  HiCode,
} from "react-icons/hi";

const MotionBox = chakra(motion.div);

/* ── Option 1: Overlapping translucent circles ── */
const OverlappingCircles = () => (
  <svg viewBox="0 0 280 200" width="100%" height="100%" style={{ maxWidth: 420 }}>
    <defs>
      <linearGradient id="ucCircleGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#9055E8" stopOpacity="0.22" />
        <stop offset="100%" stopColor="#9055E8" stopOpacity="0.08" />
      </linearGradient>
      <linearGradient id="ucCircleGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#E85D85" stopOpacity="0.18" />
        <stop offset="100%" stopColor="#E85D85" stopOpacity="0.06" />
      </linearGradient>
      <linearGradient id="ucCircleGrad3" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#7DD3FC" stopOpacity="0.2" />
        <stop offset="100%" stopColor="#67E8F9" stopOpacity="0.08" />
      </linearGradient>
      <linearGradient id="ucCircleGrad4" x1="100%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#9055E8" stopOpacity="0.16" />
        <stop offset="100%" stopColor="#E85D85" stopOpacity="0.12" />
      </linearGradient>
    </defs>
    {/* Large anchor circle */}
    <circle cx="120" cy="100" r="90" fill="url(#ucCircleGrad1)" />
    {/* Overlapping right */}
    <circle cx="185" cy="80" r="75" fill="url(#ucCircleGrad2)" />
    {/* Overlapping bottom-left */}
    <circle cx="90" cy="140" r="60" fill="url(#ucCircleGrad3)" />
    {/* Small top-right accent */}
    <circle cx="220" cy="45" r="42" fill="url(#ucCircleGrad4)" />
    {/* Tiny accent circles */}
    <circle cx="45" cy="55" r="24" fill="url(#ucCircleGrad2)" />
    <circle cx="245" cy="135" r="30" fill="url(#ucCircleGrad3)" />
    {/* Subtle connecting overlap highlights */}
    <circle cx="155" cy="90" r="18" fill="#9055E8" opacity="0.06" />
    <circle cx="108" cy="125" r="14" fill="#E85D85" opacity="0.05" />
  </svg>
);

/* ── Option 2: Petals / leaves radiating from center ── */
const RadiatingPetals = () => (
  <svg viewBox="0 0 280 200" width="100%" height="100%" style={{ maxWidth: 280 }}>
    <defs>
      <linearGradient id="ucPetalGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#9055E8" stopOpacity="0.18" />
        <stop offset="100%" stopColor="#9055E8" stopOpacity="0.04" />
      </linearGradient>
      <linearGradient id="ucPetalGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#E85D85" stopOpacity="0.15" />
        <stop offset="100%" stopColor="#E85D85" stopOpacity="0.03" />
      </linearGradient>
      <linearGradient id="ucPetalGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7DD3FC" stopOpacity="0.16" />
        <stop offset="100%" stopColor="#67E8F9" stopOpacity="0.04" />
      </linearGradient>
    </defs>
    {/* Center point */}
    <circle cx="140" cy="100" r="6" fill="#9055E8" opacity="0.12" />
    {/* Petals — elongated ellipses rotated around center */}
    {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
      const grads = ["url(#ucPetalGrad1)", "url(#ucPetalGrad2)", "url(#ucPetalGrad3)"];
      return (
        <ellipse
          key={angle}
          cx="140"
          cy="50"
          rx="18"
          ry="48"
          fill={grads[i % 3]}
          transform={`rotate(${angle} 140 100)`}
        />
      );
    })}
    {/* Inner ring of smaller petals */}
    {[22, 67, 112, 157, 202, 247, 292, 337].map((angle, i) => {
      const grads = ["url(#ucPetalGrad2)", "url(#ucPetalGrad3)", "url(#ucPetalGrad1)"];
      return (
        <ellipse
          key={`inner-${angle}`}
          cx="140"
          cy="72"
          rx="10"
          ry="26"
          fill={grads[i % 3]}
          transform={`rotate(${angle} 140 100)`}
        />
      );
    })}
    {/* Center bloom */}
    <circle cx="140" cy="100" r="16" fill="#9055E8" opacity="0.06" />
    <circle cx="140" cy="100" r="8" fill="#E85D85" opacity="0.08" />
  </svg>
);

/* ── Option 3: Rising circles / bubbles ── */
const RisingBubbles = () => (
  <svg viewBox="0 0 280 200" width="100%" height="100%" style={{ maxWidth: 280 }}>
    <defs>
      <linearGradient id="ucBubGrad1" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#9055E8" stopOpacity="0.16" />
        <stop offset="100%" stopColor="#9055E8" stopOpacity="0.04" />
      </linearGradient>
      <linearGradient id="ucBubGrad2" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#E85D85" stopOpacity="0.14" />
        <stop offset="100%" stopColor="#E85D85" stopOpacity="0.03" />
      </linearGradient>
      <linearGradient id="ucBubGrad3" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#7DD3FC" stopOpacity="0.15" />
        <stop offset="100%" stopColor="#67E8F9" stopOpacity="0.04" />
      </linearGradient>
      <radialGradient id="ucBubGlow" cx="50%" cy="80%" r="60%">
        <stop offset="0%" stopColor="#9055E8" stopOpacity="0.08" />
        <stop offset="100%" stopColor="#9055E8" stopOpacity="0" />
      </radialGradient>
    </defs>
    {/* Ambient glow at base */}
    <ellipse cx="140" cy="180" rx="120" ry="40" fill="url(#ucBubGlow)" />
    {/* Bubbles rising — larger at bottom, smaller toward top */}
    {/* Bottom layer — large */}
    <circle cx="100" cy="165" r="28" fill="url(#ucBubGrad1)" />
    <circle cx="160" cy="158" r="34" fill="url(#ucBubGrad2)" />
    <circle cx="210" cy="170" r="22" fill="url(#ucBubGrad3)" />
    {/* Middle layer */}
    <circle cx="75" cy="120" r="22" fill="url(#ucBubGrad2)" />
    <circle cx="130" cy="110" r="26" fill="url(#ucBubGrad3)" />
    <circle cx="190" cy="118" r="20" fill="url(#ucBubGrad1)" />
    <circle cx="235" cy="128" r="15" fill="url(#ucBubGrad2)" />
    {/* Upper layer — smaller */}
    <circle cx="95" cy="72" r="16" fill="url(#ucBubGrad3)" />
    <circle cx="150" cy="65" r="18" fill="url(#ucBubGrad1)" />
    <circle cx="205" cy="78" r="13" fill="url(#ucBubGrad2)" />
    {/* Top — tiny, fading out */}
    <circle cx="120" cy="35" r="10" fill="url(#ucBubGrad1)" />
    <circle cx="170" cy="28" r="12" fill="url(#ucBubGrad3)" />
    <circle cx="80" cy="42" r="7" fill="url(#ucBubGrad2)" />
    <circle cx="220" cy="50" r="9" fill="url(#ucBubGrad1)" />
  </svg>
);

// ← Swap which graphic is active here:
const SectionGraphic = OverlappingCircles;
// const SectionGraphic = RadiatingPetals;
// const SectionGraphic = RisingBubbles;

const USE_CASES = [
  {
    icon: HiAcademicCap,
    title: "Student Organizations",
    tagline: "Run by students. Owned by students.",
    description:
      "Elect officers, plan meetups, organize projects, and give every member a real vote.",
    featured: false,
  },
  {
    icon: HiUserGroup,
    title: "Worker Cooperatives",
    tagline: "Every worker is an owner.",
    description:
      "Transparent decisions, share revenue, and governance that fits your cooperative.",
  },
  {
    icon: HiCode,
    title: "Open Source Projects",
    tagline: "Ship code. Earn influence.",
    description:
      "Governance weighted by contribution. The people who build the most shape what gets built next.",
  },
];

const UseCaseShowcase = () => {
  return (
    <Box as="section" pt={["20", "24", "32"]} pb={["16", "20", "28"]} px={[4, 6, 8]}>
      <Container maxW="container.lg">
        <Flex
          mb={[10, 12, 16]}
          align="center"
          justify="space-between"
        >
          <Box maxW="600px">
            <Heading
              as="h2"
              fontSize={["3xl", "4xl", "5xl"]}
              fontWeight="700"
              letterSpacing="-0.01em"
              mb={[3, 4]}
            >
              Made for how communities actually work
            </Heading>
            <Text
              fontSize={["xl", "2xl"]}
              color="warmGray.600"
              lineHeight="1.7"
              fontWeight="500"
            >
              From campus clubs to worker cooperatives, Poa gives your community the tools to govern itself.
            </Text>
          </Box>
          <Box display={["none", "none", "block"]} flexShrink={0} mr={8}>
            <MotionBox
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <SectionGraphic />
            </MotionBox>
          </Box>
        </Flex>

        <Grid
          templateColumns={["1fr", "1fr", "repeat(3, 1fr)"]}
          gap={[5, 6, 8]}
        >
          {USE_CASES.map((useCase, index) => (
            <GridItem key={useCase.title}>
              <MotionBox
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                h="100%"
              >
                <Link href="/create" style={{ textDecoration: "none" }}>
                  <Box
                    p={[6, 7]}
                    borderRadius="xl"
                    border="1px solid"
                    borderColor="warmGray.100"
                    bg={
                      useCase.featured
                        ? "linear-gradient(135deg, rgba(144, 85, 232, 0.03) 0%, rgba(232, 93, 133, 0.03) 100%)"
                        : "transparent"
                    }
                    cursor="pointer"
                    role="group"
                    h="100%"
                    transition="box-shadow 0.3s, border-color 0.3s"
                    _hover={{
                      boxShadow: "0 4px 20px rgba(0, 0, 0, 0.05)",
                      borderColor: "warmGray.200",
                    }}
                  >
                    <VStack align="flex-start" spacing={3}>
                      <Icon
                        as={useCase.icon}
                        boxSize={5}
                        color="warmGray.400"
                        transition="color 0.3s"
                        _groupHover={{ color: "amethyst.500" }}
                      />
                      <Heading
                        as="h3"
                        fontSize="xl"
                        fontWeight="700"
                      >
                        {useCase.title}
                      </Heading>
                      <Text
                        fontSize="lg"
                        fontWeight="600"
                        color="warmGray.800"
                      >
                        {useCase.tagline}
                      </Text>
                      <Text
                        fontSize="lg"
                        color="warmGray.600"
                        lineHeight="1.7"
                        fontWeight="500"
                      >
                        {useCase.description}
                      </Text>
                    </VStack>
                  </Box>
                </Link>
              </MotionBox>
            </GridItem>
          ))}
        </Grid>

        <Box mt={[8, 10]}>
          <Link href="/about" style={{ textDecoration: "none" }}>
            <Text
              fontSize={["sm", "md"]}
              fontWeight="600"
              color="warmGray.500"
              _hover={{ color: "amethyst.500" }}
              transition="color 0.2s"
            >
              See how Poa adapts to different types of communities &rarr;
            </Text>
          </Link>
        </Box>
      </Container>
    </Box>
  );
};

export default UseCaseShowcase;
