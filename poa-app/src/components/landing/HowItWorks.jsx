import React from "react";
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

const STEPS = [
  {
    number: "1",
    title: "Configure",
    description:
      "Choose your governance model, membership rules, and voting structure in minutes.",
  },
  {
    number: "2",
    title: "Deploy",
    description:
      "Your organization goes live — fully transparent and permanently owned by your community.",
  },
  {
    number: "3",
    title: "Govern",
    description:
      "Propose projects, vote on decisions, and build together.",
  },
];

const HowItWorks = () => {
  return (
    <Box as="section" py={["16", "20", "28"]} px={[4, 6, 8]}>
      <Container maxW="container.lg">
        <Box mb={[10, 12, 16]} maxW="480px">
          <Heading
            as="h2"
            fontSize={["2xl", "3xl", "4xl"]}
            fontWeight="700"
            letterSpacing="-0.01em"
          >
            How It Works
          </Heading>
        </Box>

        <Flex
          direction={["column", "column", "row"]}
          align={["flex-start", "flex-start", "flex-start"]}
          gap={[10, 10, 0]}
        >
          {STEPS.map((step, index) => (
            <React.Fragment key={step.number}>
              <MotionBox
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                flex="1"
              >
                <VStack spacing={3} align={["flex-start", "flex-start", "center"]} textAlign={["left", "left", "center"]}>
                  <Text
                    fontSize="7xl"
                    fontWeight="700"
                    lineHeight="1"
                    opacity={0.6}
                    sx={{
                      background: "linear-gradient(135deg, #9055E8, #E85D85)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    {step.number}
                  </Text>
                  <Heading as="h3" fontSize="xl" fontWeight="700">
                    {step.title}
                  </Heading>
                  <Text
                    fontSize="lg"
                    color="warmGray.600"
                    maxW="280px"
                    lineHeight="1.7"
                    fontWeight="500"
                  >
                    {step.description}
                  </Text>
                </VStack>
              </MotionBox>

              {/* Connector line between steps (desktop only) */}
              {index < STEPS.length - 1 && (
                <Flex
                  display={["none", "none", "flex"]}
                  align="center"
                  pt={6}
                  px={2}
                >
                  <Box
                    w="60px"
                    h="1px"
                    bgGradient="linear(to-r, rgba(144, 85, 232, 0.2), rgba(232, 93, 133, 0.2))"
                  />
                </Flex>
              )}
            </React.Fragment>
          ))}
        </Flex>
      </Container>
    </Box>
  );
};

export default HowItWorks;
