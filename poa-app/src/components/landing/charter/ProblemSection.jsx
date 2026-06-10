import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { Wrap, SectionRule, SectionHeading, Prose, SECTION_PY, PROSE_MAX } from "./Bones";

const VIGNETTES = [
  "The dues live in one member's payment app, next to their grocery money.",
  "The treasurer graduates in May. By June nobody remembers what was decided, or why.",
  "The community spends six years on a platform. The platform changes the rules in an afternoon.",
];

const NUMERALS = ["i.", "ii.", "iii."];

// Section 01. Three vignettes of the default failure: no illustrations,
// the words do it.
const ProblemSection = () => {
  return (
    <Box as="section" aria-labelledby="problem-heading" pt={{ base: 4, md: 8 }} pb={SECTION_PY}>
      <Wrap>
        <SectionRule number="01" label="The usual story" />
        <SectionHeading id="problem-heading" mb={{ base: 10, md: 14 }}>
          How groups usually end
        </SectionHeading>

        <Box as="ol" listStyleType="none" m={0} p={0} maxW="760px">
          {VIGNETTES.map((line, idx) => (
            <Flex
              as="li"
              key={idx}
              gap={{ base: 4, md: 6 }}
              align="baseline"
              py={{ base: 5, md: 6 }}
              borderBottom="1px solid"
              borderColor="ink.300"
            >
              <Text
                as="span"
                fontFamily="ledger"
                fontSize="0.875rem"
                color="meadow.600"
                flexShrink={0}
                w="2.5rem"
                aria-hidden="true"
              >
                {NUMERALS[idx]}
              </Text>
              <Text
                fontFamily="charter"
                fontStyle="italic"
                fontSize={{ base: "1.25rem", md: "1.5rem" }}
                lineHeight="1.45"
                color="ink.900"
              >
                {line}
              </Text>
            </Flex>
          ))}
        </Box>

        <Prose mt={{ base: 8, md: 10 }} color="ink.500">
          None of this is anyone's fault. Becoming a real institution used to
          take months and lawyers, so almost nobody did it.
        </Prose>
      </Wrap>
    </Box>
  );
};

export default ProblemSection;
