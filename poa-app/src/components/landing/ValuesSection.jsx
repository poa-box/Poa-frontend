import React from "react";
import Link from "next/link";
import {
  Box,
  Text,
  VStack,
  Heading,
  Flex,
  Container,
  chakra,
} from "@chakra-ui/react";
import { motion } from "framer-motion";

const MotionBox = chakra(motion.div);

/* Concentric community rings — layers of governance and membership */
const CommunityGraphic = () => (
  <svg viewBox="0 0 360 360" width="100%" height="100%" style={{ maxWidth: 360 }}>
    <defs>
      <linearGradient id="valRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#9055E8" stopOpacity="0.6" />
        <stop offset="100%" stopColor="#E85D85" stopOpacity="0.4" />
      </linearGradient>
      <linearGradient id="valDotGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#9055E8" />
        <stop offset="100%" stopColor="#E85D85" />
      </linearGradient>
      <radialGradient id="valGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#9055E8" stopOpacity="0.12" />
        <stop offset="100%" stopColor="#9055E8" stopOpacity="0" />
      </radialGradient>
    </defs>
    {/* Ambient glow */}
    <circle cx="180" cy="180" r="170" fill="url(#valGlow)" />
    {/* Outer ring */}
    <circle cx="180" cy="180" r="155" fill="none" stroke="url(#valRingGrad)" strokeWidth="1.5" strokeDasharray="4 8" />
    {/* Middle ring */}
    <circle cx="180" cy="180" r="115" fill="none" stroke="url(#valRingGrad)" strokeWidth="1.5" />
    {/* Inner ring */}
    <circle cx="180" cy="180" r="75" fill="none" stroke="url(#valRingGrad)" strokeWidth="2" />
    {/* Core */}
    <circle cx="180" cy="180" r="28" fill="url(#valDotGrad)" opacity="0.15" />
    <circle cx="180" cy="180" r="8" fill="url(#valDotGrad)" opacity="0.5" />
    {/* People dots on outer ring */}
    {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
      const r = 155;
      const x = 180 + r * Math.cos((angle * Math.PI) / 180);
      const y = 180 + r * Math.sin((angle * Math.PI) / 180);
      return <circle key={`o-${angle}`} cx={x} cy={y} r="4" fill="#9055E8" opacity="0.4" />;
    })}
    {/* People dots on middle ring */}
    {[20, 80, 140, 200, 260, 320].map((angle) => {
      const r = 115;
      const x = 180 + r * Math.cos((angle * Math.PI) / 180);
      const y = 180 + r * Math.sin((angle * Math.PI) / 180);
      return <circle key={`m-${angle}`} cx={x} cy={y} r="5" fill="#E85D85" opacity="0.35" />;
    })}
    {/* People dots on inner ring */}
    {[0, 72, 144, 216, 288].map((angle) => {
      const r = 75;
      const x = 180 + r * Math.cos((angle * Math.PI) / 180);
      const y = 180 + r * Math.sin((angle * Math.PI) / 180);
      return <circle key={`i-${angle}`} cx={x} cy={y} r="6" fill="url(#valDotGrad)" opacity="0.45" />;
    })}
    {/* Connecting lines from inner dots to core */}
    {[0, 72, 144, 216, 288].map((angle) => {
      const r1 = 75;
      const x1 = 180 + r1 * Math.cos((angle * Math.PI) / 180);
      const y1 = 180 + r1 * Math.sin((angle * Math.PI) / 180);
      return (
        <line
          key={`l-${angle}`}
          x1={x1}
          y1={y1}
          x2={180}
          y2={180}
          stroke="url(#valDotGrad)"
          strokeWidth="1"
          opacity="0.2"
        />
      );
    })}
    {/* Cross-connections on middle ring */}
    {[20, 80, 140, 200, 260, 320].map((angle, i, arr) => {
      const r = 115;
      const nextAngle = arr[(i + 1) % arr.length];
      const x1 = 180 + r * Math.cos((angle * Math.PI) / 180);
      const y1 = 180 + r * Math.sin((angle * Math.PI) / 180);
      const x2 = 180 + r * Math.cos((nextAngle * Math.PI) / 180);
      const y2 = 180 + r * Math.sin((nextAngle * Math.PI) / 180);
      return (
        <line
          key={`c-${angle}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="#E85D85"
          strokeWidth="0.8"
          opacity="0.12"
        />
      );
    })}
  </svg>
);

const ValuesSection = () => {
  return (
    <Box as="section" py={["12", "16", "20"]} px={[4, 6, 8]}>
      <Container maxW="container.xl">
          <Flex
            direction={["column", "column", "row"]}
            align="center"
            gap={[8, 8, 10]}
          >
            {/* Text side */}
            <Box flex="1">
              <MotionBox
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.7 }}
              >
                <VStack spacing={[4, 5]} align={["center", "center", "flex-start"]} textAlign={["center", "center", "left"]}>
                  <Text
                    fontSize={["sm", "sm"]}
                    fontWeight="600"
                    color="warmGray.400"
                    letterSpacing="0.08em"
                    textTransform="uppercase"
                  >
                    The infrastructure for community-owned organizations
                  </Text>
                  <Heading
                    as="h2"
                    fontSize={["3xl", "4xl", "5xl"]}
                    fontWeight="700"
                    letterSpacing="-0.02em"
                    color="warmGray.900"
                  >
                    Built for People, Not shareholders
                  </Heading>
                  <Text
                    fontSize={["xl", "2xl"]}
                    color="warmGray.600"
                    maxW="540px"
                    lineHeight="1.8"
                    fontWeight="500"
                  >
                    Organizations should serve the people who build them. Every contribution earns real ownership: more influence and more upside. The value your community creates stays with the people who created it.
                  </Text>
                  <Link href="/about" style={{ textDecoration: "none" }}>
                    <Text
                      fontSize={["sm", "md"]}
                      fontWeight="600"
                      color="warmGray.500"
                      _hover={{ color: "amethyst.500" }}
                      transition="color 0.2s"
                    >
                      Learn more about how Poa empowers communities &rarr;
                    </Text>
                  </Link>
                </VStack>
              </MotionBox>
            </Box>

            {/* Graphic side */}
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
                <CommunityGraphic />
              </MotionBox>
            </Flex>
          </Flex>
      </Container>
    </Box>
  );
};

export default ValuesSection;
