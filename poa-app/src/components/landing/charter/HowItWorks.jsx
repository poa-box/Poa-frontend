import React from "react";
import { Box, SimpleGrid, Text } from "@chakra-ui/react";
import { Wrap, SectionRule, SectionHeading, MonoLabel, SECTION_PY } from "./Bones";
import Specimen from "./Specimen";

const STEPS = [
  {
    number: "one",
    title: "Choose your rules.",
    body: "Start from a named template: worker cooperative, student organization, creative collective, community organization, open source project. Each one is a readable set of rules: who can join, how votes are counted, who approves the work. Adjust anything, or write your own from scratch.",
  },
  {
    number: "two",
    title: "Invite your members.",
    body: "People join because a member vouches for them. Your group decides how many vouches it takes, and which roles stay open to anyone. Trust is the membership system.",
  },
  {
    number: "three",
    title: "Run it together.",
    body: "Proposals, votes, tasks, and money, all in one place. Work gets paid in dollars. Every decision is recorded with its reasoning and stays readable for as long as the organization exists.",
  },
];

// Section 02. Three steps that match the real product flow: template
// picker (/create), vouch links (/join), then the org pages themselves.
const HowItWorks = () => {
  return (
    <Box as="section" id="how-it-works" aria-labelledby="how-heading" pb={SECTION_PY}>
      <Wrap>
        <SectionRule number="02" label="The mechanism" />
        <SectionHeading id="how-heading" mb={{ base: 10, md: 14 }}>
          Three steps to an organization
        </SectionHeading>

        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={{ base: 9, md: 12 }} mb={{ base: 14, md: 20 }}>
          {STEPS.map((step) => (
            <Box key={step.number}>
              <MonoLabel as="p" mb={3}>
                step {step.number}
              </MonoLabel>
              <Text as="h3" fontFamily="charter" fontWeight="540" fontSize="1.3125rem" lineHeight="1.3" color="ink.900" mb={3}>
                {step.title}
              </Text>
              <Text fontFamily="charter" fontSize="1.0625rem" lineHeight="1.65" color="ink.500">
                {step.body}
              </Text>
            </Box>
          ))}
        </SimpleGrid>

        <Specimen />
      </Wrap>
    </Box>
  );
};

export default HowItWorks;
