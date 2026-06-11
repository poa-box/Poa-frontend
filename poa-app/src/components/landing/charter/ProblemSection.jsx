import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { Wrap, SectionRule, SectionHeading, Prose, SECTION_PY } from "./Bones";

// Each vignette is a color plate: paper type on a deep ink, like the
// panels of a printed broadside. Paper text passes AA on all three
// (meadow.700 9.5:1, oxblood.700 10.5:1, ink.900 15:1).
const VIGNETTES = [
  {
    numeral: "i.",
    text: "The dues live in one member's payment app, next to their grocery money.",
    bg: "meadow.700",
  },
  {
    numeral: "ii.",
    text: "The treasurer graduates in May. By June nobody remembers what was decided, or why.",
    bg: "oxblood.700",
  },
  {
    numeral: "iii.",
    text: "The community spends six years on a platform. The platform changes the rules in an afternoon.",
    bg: "ink.900",
  },
];

// Section 01. Three vignettes of the default failure: no illustrations,
// the words do it, printed big.
const ProblemSection = () => {
  return (
    <Box as="section" aria-labelledby="problem-heading" pt={{ base: 4, md: 8 }} pb={SECTION_PY}>
      <Wrap>
        <SectionRule number="01" label="The usual story" />
        <SectionHeading numeral="1" numeralColor="oxblood.600" id="problem-heading" mb={{ base: 10, md: 14 }}>
          How groups usually end
        </SectionHeading>

        <Box as="ol" listStyleType="none" m={0} p={0}>
          {VIGNETTES.map((v) => (
            <Flex
              as="li"
              key={v.numeral}
              bg={v.bg}
              borderRadius="2px"
              mb={{ base: 3, md: 4 }}
              px={{ base: 6, md: 12 }}
              py={{ base: 7, md: 9 }}
              gap={{ base: 5, md: 9 }}
              align="baseline"
            >
              <Text
                as="span"
                aria-hidden="true"
                fontFamily="charter"
                fontStyle="italic"
                fontSize={{ base: "1.5rem", md: "2rem" }}
                lineHeight="1"
                color="ochre.400"
                flexShrink={0}
                w={{ base: "2.25rem", md: "3rem" }}
              >
                {v.numeral}
              </Text>
              <Text
                fontFamily="charter"
                fontStyle="italic"
                fontWeight="430"
                fontSize={{ base: "1.5rem", md: "2rem" }}
                lineHeight="1.35"
                color="paper.100"
              >
                {v.text}
              </Text>
            </Flex>
          ))}
        </Box>

        <Prose mt={{ base: 8, md: 10 }} color="ink.500" fontSize="1.125rem" maxW="760px">
          None of this is anyone's fault. Becoming a real institution used to
          take months and lawyers, so almost nobody did it. The group stayed a
          group chat, and everything it built stayed borrowed.
        </Prose>
      </Wrap>
    </Box>
  );
};

export default ProblemSection;
