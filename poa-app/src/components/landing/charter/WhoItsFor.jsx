import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { Wrap, SectionRule, SectionHeading, CharterLink, Prose, SECTION_PY } from "./Bones";

// The template tags are the real template names from the deployment flow
// (src/features/deployer/templates/definitions/).
const AUDIENCES = [
  {
    line: "Student organizations. Officers change every spring; the organization keeps its memory.",
    template: "student organization",
  },
  {
    line: "Worker owned businesses. One worker, one vote, and the books in the open.",
    template: "worker cooperative",
  },
  {
    line: "Creative collectives. Decide together what gets made, and what it pays.",
    template: "creative collective",
  },
  {
    line: "Community organizations. Dues, decisions, and projects, all in the open.",
    template: "community organization",
  },
  {
    line: "Open source projects. The people who build it steer it.",
    template: "open source project",
  },
];

// Section 04. Who it is for, set as ledger rows, with the proof line at the
// end: no invented numbers, just the public record.
const WhoItsFor = () => {
  return (
    <Box as="section" id="who-its-for" aria-labelledby="who-heading" pb={SECTION_PY}>
      <Wrap>
        <SectionRule number="05" label="The members" />
        <SectionHeading numeral="5" numeralColor="meadow.600" id="who-heading" mb={{ base: 10, md: 14 }}>
          Who it is for
        </SectionHeading>

        <Box as="ul" listStyleType="none" m={0} p={0}>
          {AUDIENCES.map((row) => (
            <Flex
              as="li"
              key={row.template}
              justify="space-between"
              align="baseline"
              gap={{ base: 3, md: 8 }}
              direction={{ base: "column", md: "row" }}
              py={{ base: 5, md: 5 }}
              borderBottom="1px solid"
              borderColor="ink.300"
            >
              <Text fontFamily="charter" fontSize={{ base: "1.125rem", md: "1.1875rem" }} lineHeight="1.5" color="ink.900" maxW="640px">
                {row.line}
              </Text>
              <Text fontFamily="ledger" fontSize="0.8125rem" color="oxblood.600" flexShrink={0}>
                template: {row.template}
              </Text>
            </Flex>
          ))}
        </Box>

        <Prose mt={{ base: 8, md: 10 }} color="ink.500">
          Every organization on poa is public: its rules, its decisions, its
          books.{" "}
          <CharterLink href="/explore" fontSize="1rem">
            Browse the organizations
          </CharterLink>
        </Prose>
      </Wrap>
    </Box>
  );
};

export default WhoItsFor;
