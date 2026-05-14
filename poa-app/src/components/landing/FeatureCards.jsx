import React from "react";
import Link from "next/link";
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
    href: "/docs/hybridVoting",
    description:
      "Direct democracy, contribution-weighted voting, or a blend of the two. Every model is custom, transparent, and recorded openly. Every member can verify every vote.",
  },
  {
    icon: HiClipboardList,
    title: "Task & Project Management",
    href: "/docs/task-manager",
    description:
      "Create tasks, assign work, and track progress in a shared workspace. Completed work mints participation tokens, so the people doing the work also gain a voice in governing it.",
  },
  {
    icon: HiShieldCheck,
    title: "Roles & Permissions",
    href: "/docs/roles-and-permissions",
    description:
      "Role-based membership tiers. Custom roles, granular permissions, vouching requirements, and trust-based progression. The community decides who gets which key.",
  },
  {
    icon: HiCurrencyDollar,
    title: "Treasury",
    href: "/docs/treasury-management",
    description:
      "A shared treasury that the community controls together. Every transaction visible. Every spend approved by community vote. No single admin holds the keys.",
  },
  {
    icon: HiSparkles,
    title: "Contribution-Based Rewards",
    href: "/docs/contributionVoting",
    description:
      "Earn participation tokens, voting power, and a share of the treasury by contributing. Governance that rewards work rather than capital, and resists capture by either.",
  },
  {
    icon: HiAcademicCap,
    title: "Learn & Earn",
    href: "/docs/learn-and-earn",
    description:
      "Build onboarding modules where members complete courses, earn recognition, and develop skills. Education becomes a real path into governance and reward.",
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
                  <Link
                    href={feature.href}
                    style={{ color: "inherit", textDecoration: "none" }}
                  >
                    {feature.title}
                  </Link>
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
