import React from "react";
import { Box, Flex, Grid, Text } from "@chakra-ui/react";
import { Wrap, SectionRule, SectionHeading, SECTION_PY } from "./Bones";

// Every row is a real surface of the product, one line each, annotated in
// the ledger voice. Nothing here is aspirational.
const SURFACES = [
  {
    name: "Votes",
    line: "One person one vote, weight earned by participation, or a hybrid your group tunes.",
    note: "kept forever",
  },
  {
    name: "Tasks",
    line: "Post the work, claim it, review it, pay it.",
    note: "paid in dollars",
  },
  {
    name: "Treasury",
    line: "The books in the open, spendable only by the rules.",
    note: "every transfer public",
  },
  {
    name: "Members",
    line: "Vouches, roles, and exactly what each role may do.",
    note: "trust, written down",
  },
  {
    name: "Learning",
    line: "Onboarding courses your organization writes; passing them earns voting weight.",
    note: "earned, not bought",
  },
];

// Section 03. The product, enumerated. The page shows its surface area the
// way a charter lists its articles.
const WhatsInside = () => {
  return (
    <Box as="section" aria-labelledby="inside-heading" pb={SECTION_PY}>
      <Wrap>
        <SectionRule number="03" label="The articles" />
        <SectionHeading numeral="3" numeralColor="ochre.600" id="inside-heading" mb={{ base: 10, md: 14 }}>
          What an organization gets
        </SectionHeading>

        <Box as="ul" listStyleType="none" m={0} p={0}>
          {SURFACES.map((s, idx) => (
            <Grid
              as="li"
              key={s.name}
              templateColumns={{ base: "1fr", md: "200px 1fr 220px" }}
              gap={{ base: 1, md: 8 }}
              alignItems="baseline"
              py={{ base: 5, md: 6 }}
              borderBottom="1px solid"
              borderColor="ink.300"
            >
              <Flex align="baseline" gap={3}>
                <Box
                  aria-hidden="true"
                  w="11px"
                  h="11px"
                  flexShrink={0}
                  bg={["meadow.600", "oxblood.600", "ochre.600", "ink.900", "meadow.600"][idx]}
                  transform="translateY(-1px)"
                />
                <Text fontFamily="charter" fontWeight="540" fontSize={{ base: "1.375rem", md: "1.5rem" }} lineHeight="1.2" color="ink.900">
                  {s.name}
                </Text>
              </Flex>
              <Text fontFamily="charter" fontSize={{ base: "1.0625rem", md: "1.125rem" }} lineHeight="1.55" color="ink.500">
                {s.line}
              </Text>
              <Text
                fontFamily="ledger"
                fontSize="0.8125rem"
                letterSpacing="0.06em"
                color="meadow.600"
                textAlign={{ base: "left", md: "right" }}
                mt={{ base: 1, md: 0 }}
              >
                {s.note}
              </Text>
            </Grid>
          ))}
        </Box>
      </Wrap>
    </Box>
  );
};

export default WhatsInside;
