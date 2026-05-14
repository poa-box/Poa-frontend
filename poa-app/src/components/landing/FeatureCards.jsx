import React from "react";
import {
  Box,
  Text,
  VStack,
  Heading,
  SimpleGrid,
  Icon,
  Container,
  chakra,
} from "@chakra-ui/react";
import { motion } from "framer-motion";
import {
  HiUserGroup,
  HiSparkles,
  HiClipboardList,
  HiCurrencyDollar,
  HiShieldCheck,
  HiAcademicCap,
} from "react-icons/hi";

const MotionBox = chakra(motion.div);

const FEATURES = [
  {
    icon: HiUserGroup,
    title: "Community Governance",
    description:
      "Democratic voting, contribution-weighted influence, or a hybrid. Every governance model is custom, transparent, and community-owned.",
  },
  {
    icon: HiClipboardList,
    title: "Task & Project Management",
    description:
      "Create tasks, assign work, and track progress. Contributors earn influence for completed work.",
  },
  {
    icon: HiShieldCheck,
    title: "Roles & Permissions",
    description:
      "Custom roles with granular permissions, vouching requirements, and trust-based progression.",
  },
  {
    icon: HiCurrencyDollar,
    title: "Treasury",
    description:
      "Manage funds transparently. Every transaction visible, every spending decision governed by community vote.",
  },
  {
    icon: HiSparkles,
    title: "Contribution-Based Rewards",
    description:
      "Earn voting power and a share of the treasury through actual contributions. The more you participate, the more you earn.",
  },
  {
    icon: HiAcademicCap,
    title: "Learn & Earn",
    description:
      "Build educational modules where members complete courses and earn recognition while growing their skills.",
  },
];

const FeatureCards = () => {
  return (
    <Box as="section" py={["16", "20", "28"]} px={[4, 6, 8]}>
      <Container maxW="container.xl">
        <Box mb={[10, 12, 16]} maxW="540px">
          <Heading
            as="h2"
            fontSize={["2xl", "3xl", "4xl"]}
            fontWeight="700"
            letterSpacing="-0.01em"
            mb={[3, 4]}
          >
            Everything your community needs
          </Heading>
          <Text
            fontSize={["lg", "xl"]}
            color="warmGray.600"
            lineHeight="1.7"
            fontWeight="500"
          >
            Every tool your organization needs to operate transparently and democratically. Use what you need and customize everything.
          </Text>
        </Box>

        <SimpleGrid columns={[1, 2, 3]} spacing={[10, 12, 16]}>
          {FEATURES.map((feature, index) => (
            <MotionBox
              key={feature.title}
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
                  as={feature.icon}
                  boxSize={5}
                  color="warmGray.400"
                  transition="color 0.3s"
                  _groupHover={{ color: "amethyst.500" }}
                />
                <Heading as="h3" fontSize="xl" fontWeight="700">
                  {feature.title}
                </Heading>
                <Text fontSize="lg" color="warmGray.600" lineHeight="1.7" fontWeight="500">
                  {feature.description}
                </Text>
              </VStack>
            </MotionBox>
          ))}
        </SimpleGrid>
      </Container>
    </Box>
  );
};

export default FeatureCards;
