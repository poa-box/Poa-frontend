import React from "react";
import { Box, SimpleGrid, Text } from "@chakra-ui/react";
import { Wrap, SectionRule, SectionHeading, SECTION_PY } from "./Bones";

const PILLARS = [
  {
    title: "Owned by the members.",
    body: "Voting power is earned by participating, not bought. There are no shares to sell and no investors to please. The people who do the work decide what happens next.",
  },
  {
    title: "A memory.",
    body: "Every proposal is kept with its reasoning, in a record no one can quietly rewrite. Ten years from now, a new member can read what was decided and why.",
  },
  {
    title: "The door is open.",
    body: "What you earn lands in your own account and cashes out to the payment app you already use. The record is public, and any organization can run its own copy of the tools. Built so no one can lock you in, including us.",
  },
];

// Section 04. The three properties that make this different, stated plainly.
const Pillars = () => {
  return (
    <Box as="section" aria-labelledby="pillars-heading" pb={SECTION_PY}>
      <Wrap>
        <SectionRule number="04" label="The properties" />
        <SectionHeading numeral="4" id="pillars-heading" mb={{ base: 10, md: 14 }}>
          What makes it different
        </SectionHeading>

        <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={{ base: 10, lg: 14 }}>
          {PILLARS.map((pillar) => (
            <Box key={pillar.title} borderTop="1px solid" borderColor="ink.300" pt={5}>
              <Text as="h3" fontFamily="charter" fontWeight="540" fontSize={{ base: "1.375rem", md: "1.5rem" }} lineHeight="1.25" color="ink.900" mb={3}>
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
