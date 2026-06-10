import React from "react";
import { Box, SimpleGrid, Text } from "@chakra-ui/react";
import { Wrap, SectionRule, SectionHeading, SECTION_PY } from "./Bones";

const PILLARS = [
  {
    title: "Owned by the members.",
    body: "Voting power is earned by participating, not bought. The people who do the work decide what happens next, and the organization answers to no one else.",
  },
  {
    title: "A memory.",
    body: "Every proposal is kept with its reasoning, in a record no one can quietly rewrite. Organizations here accumulate precedent, character, and proof of what they are.",
  },
  {
    title: "The door is open.",
    body: "What you earn lands in your own account and cashes out to the payment app you already use. The record is public, and any organization can run its own copy of the tools. Built so no one can lock you in, including us.",
  },
];

// Section 03. The three properties that make this different, stated plainly.
const Pillars = () => {
  return (
    <Box as="section" aria-labelledby="pillars-heading" pb={SECTION_PY}>
      <Wrap>
        <SectionRule number="03" label="The properties" />
        <SectionHeading id="pillars-heading" mb={{ base: 10, md: 14 }}>
          What makes it different
        </SectionHeading>

        <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={{ base: 9, lg: 12 }}>
          {PILLARS.map((pillar) => (
            <Box key={pillar.title}>
              <Text as="h3" fontFamily="charter" fontWeight="540" fontSize="1.3125rem" lineHeight="1.3" color="ink.900" mb={3}>
                {pillar.title}
              </Text>
              <Text fontFamily="charter" fontSize="1.0625rem" lineHeight="1.65" color="ink.500">
                {pillar.body}
              </Text>
            </Box>
          ))}
        </SimpleGrid>
      </Wrap>
    </Box>
  );
};

export default Pillars;
