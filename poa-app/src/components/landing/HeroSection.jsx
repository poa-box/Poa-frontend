import React from "react";
import Link from "next/link";
import {
  Box,
  Button,
  Text,
  HStack,
  Container,
  Heading,
  chakra,
} from "@chakra-ui/react";
import { motion } from "framer-motion";

const MotionBox = chakra(motion.div);
const MotionSpan = motion.span;

const HEADLINE_WORDS = "Build Organizations Owned by the People Who Run Them".split(" ");

const wordVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.06, ease: "easeOut" },
  }),
};

const HeroSection = ({ mounted, isAuthenticated, onSignInOpen, onOnboardingOpen }) => {
  return (
    <Box
      as="section"
      pt={["24", "32", "40"]}
      pb={["20", "28", "32"]}
      px={[4, 6, 8]}
      position="relative"
      overflow="visible"
    >
      {/* Morphing ambient orbs */}
      <Box
        position="absolute"
        top="-5%"
        left="-5%"
        w={["300px", "420px", "550px"]}
        h={["300px", "420px", "550px"]}
        bg="#7DD3FC"
        opacity={0.22}
        filter="blur(80px)"
        pointerEvents="none"
        sx={{
          animation: "morph1 18s ease-in-out infinite",
          "@keyframes morph1": {
            "0%": { borderRadius: "40% 60% 60% 40% / 60% 40% 60% 40%", transform: "translate(0, 0) rotate(0deg)" },
            "33%": { borderRadius: "60% 40% 50% 50% / 40% 60% 40% 60%", transform: "translate(30px, 20px) rotate(60deg)" },
            "66%": { borderRadius: "50% 50% 40% 60% / 50% 40% 60% 50%", transform: "translate(-10px, 40px) rotate(120deg)" },
            "100%": { borderRadius: "40% 60% 60% 40% / 60% 40% 60% 40%", transform: "translate(0, 0) rotate(0deg)" },
          },
        }}
      />
      <Box
        position="absolute"
        top="5%"
        right="-3%"
        w={["260px", "380px", "500px"]}
        h={["260px", "380px", "500px"]}
        bg="#67E8F9"
        opacity={0.18}
        filter="blur(80px)"
        pointerEvents="none"
        sx={{
          animation: "morph2 22s ease-in-out infinite",
          "@keyframes morph2": {
            "0%": { borderRadius: "60% 40% 50% 50% / 50% 60% 40% 50%", transform: "translate(0, 0) rotate(0deg)" },
            "33%": { borderRadius: "40% 60% 60% 40% / 60% 40% 60% 40%", transform: "translate(-25px, 30px) rotate(-60deg)" },
            "66%": { borderRadius: "50% 40% 50% 60% / 40% 60% 50% 40%", transform: "translate(20px, -15px) rotate(-120deg)" },
            "100%": { borderRadius: "60% 40% 50% 50% / 50% 60% 40% 50%", transform: "translate(0, 0) rotate(0deg)" },
          },
        }}
      />

      <Container maxW="container.md" textAlign="center" position="relative" zIndex={1}>
        {/* Word-by-word animated gradient headline */}
        <Heading
          as="h1"
          fontSize={["4xl", "5xl", "6xl", "6xl"]}
          fontWeight="700"
          lineHeight="1.15"
          mb={[6, 8, 10]}
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
          transition={{ duration: 0.7, delay: 0.6 }}
        >
          <Text
            fontSize={["xl", "xl", "1.375rem"]}
            color="warmGray.700"
            maxW="540px"
            mx="auto"
            mb={[10, 12]}
            lineHeight="1.7"
            fontWeight="500"
          >
            One platform to manage projects, track participation, and handle finances.
            <br />
            Governed entirely by your community.
          </Text>
        </MotionBox>

        <MotionBox
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.8 }}
        >
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
                fontSize="lg"
                fontWeight="600"
                _hover={{ bg: "warmGray.800" }}
                _active={{ bg: "warmGray.700" }}
                transition="background 0.2s"
              >
                Create an Organization
              </Button>
            </Link>
            <Link href="/explore" style={{ textDecoration: "none" }}>
              <Button
                size="lg"
                variant="outline"
                borderColor="warmGray.200"
                color="warmGray.700"
                borderRadius="full"
                px={[6, 8]}
                fontSize="lg"
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
        </MotionBox>


      </Container>
    </Box>
  );
};

export default HeroSection;
