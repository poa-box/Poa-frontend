import React from "react";
import { Box, Flex, Grid, Text } from "@chakra-ui/react";
import { Wrap, SectionRule, SectionHeading, SECTION_PY } from "./Bones";
import Specimen from "./Specimen";

const STEPS = [
  {
    numeral: "1.",
    title: "Choose your rules.",
    body: "Start from a named template: worker cooperative, student organization, creative collective, community organization, open source project. Each one is a readable set of rules: who can join, how votes are counted, who approves the work. Adjust anything, or write your own from scratch.",
  },
  {
    numeral: "2.",
    title: "Invite your members.",
    body: "People join because a member vouches for them. Your group decides how many vouches it takes, and which roles stay open to anyone. Trust is the membership system.",
  },
  {
    numeral: "3.",
    title: "Run it together.",
    body: "Propose, vote, assign the work, and pay for it in dollars, all in one place. Every decision is recorded with its reasoning and stays readable for as long as the organization exists.",
  },
];

// Section 02. Three steps that match the real product flow (template
// picker, vouch links, the org pages), set beside the charter they
// produce: the steps on the left, the result on the right.
const HowItWorks = () => {
  return (
    <Box as="section" id="how-it-works" aria-labelledby="how-heading" pb={SECTION_PY}>
      <Wrap>
        <SectionRule number="02" label="The mechanism" />
        <SectionHeading numeral="2" id="how-heading" mb={{ base: 10, md: 14 }}>
          Three steps to an organization
        </SectionHeading>

        <Grid templateColumns={{ base: "1fr", lg: "1fr 460px" }} gap={{ base: 12, lg: 20 }} alignItems="start">
          <Box as="ol" listStyleType="none" m={0} p={0}>
            {STEPS.map((step, idx) => (
              <Flex
                as="li"
                key={step.numeral}
                gap={{ base: 5, md: 7 }}
                align="baseline"
                pt={idx === 0 ? 0 : { base: 7, md: 9 }}
                pb={{ base: 7, md: 9 }}
                borderBottom={idx === STEPS.length - 1 ? "none" : "1px solid"}
                borderColor="ink.300"
              >
                <Text
                  as="span"
                  aria-hidden="true"
                  fontFamily="charter"
                  fontWeight="430"
                  fontSize={{ base: "2.25rem", md: "2.75rem" }}
                  lineHeight="1"
                  color="meadow.600"
                  flexShrink={0}
                  w={{ base: "2.5rem", md: "3rem" }}
                  transform="translateY(0.04em)"
                >
                  {step.numeral}
                </Text>
                <Box>
                  <Text as="h3" fontFamily="charter" fontWeight="540" fontSize={{ base: "1.375rem", md: "1.5rem" }} lineHeight="1.25" color="ink.900" mb={3}>
                    {step.title}
                  </Text>
                  <Text fontFamily="charter" fontSize="1.0625rem" lineHeight="1.65" color="ink.500" maxW="520px">
                    {step.body}
                  </Text>
                </Box>
              </Flex>
            ))}
          </Box>

          <Box position={{ lg: "sticky" }} top={{ lg: 8 }}>
            <Specimen />
          </Box>
        </Grid>
      </Wrap>
    </Box>
  );
};

export default HowItWorks;
