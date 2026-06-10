import React from "react";
import { Box, Text } from "@chakra-ui/react";
import { Wrap, SectionRule, SECTION_PY } from "./Bones";

// Section 05. The quiet manifesto. Restraint here is everything: one
// paragraph, no heading theatrics, no buttons.
const Ethos = () => {
  return (
    <Box as="section" aria-labelledby="ethos-heading" pb={SECTION_PY}>
      <Wrap>
        <SectionRule number="05" label="The reason" />
        <Box maxW="760px">
          <Text
            as="h2"
            id="ethos-heading"
            fontFamily="charter"
            fontWeight="470"
            fontSize={{ base: "1.9rem", md: "2.5rem" }}
            lineHeight="1.15"
            letterSpacing="-0.015em"
            color="ink.900"
            mb={{ base: 8, md: 10 }}
          >
            Why we built it
          </Text>
          <Text
            fontFamily="charter"
            fontSize={{ base: "1.1875rem", md: "1.375rem" }}
            lineHeight="1.6"
            color="ink.900"
          >
            Most software is rented. An institution should not be. The
            organizations made here keep their own records, hold their own
            money, and can host their own copy of the tools. Good
            institutions outlast their founders. We think the tools should
            too.
          </Text>
        </Box>
      </Wrap>
    </Box>
  );
};

export default Ethos;
