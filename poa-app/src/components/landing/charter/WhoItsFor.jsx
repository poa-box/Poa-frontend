import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { Wrap, SectionRule, SectionHeading, CharterLink, SECTION_PY } from "./Bones";
import useLandingRegistry from "./useLandingRegistry";

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

// Who it is for, set as ledger rows, with the proof band at the end: no
// invented numbers, just the public record (and a live count of it).
const WhoItsFor = () => {
  const { isLoading, counts } = useLandingRegistry();
  const showCount = !isLoading && counts.orgs > 0;
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

        {/* The page's best trust claim, set at trust-claim size: nothing
            here is taken on faith, the ledgers are one click away. */}
        <Box
          mt={{ base: 10, md: 14 }}
          bg="paper.50"
          border="1px solid"
          borderColor="paper.300"
          borderRadius="2px"
          boxShadow="6px 6px 0 rgba(33, 29, 21, 0.9)"
          px={{ base: 6, md: 10 }}
          py={{ base: 7, md: 9 }}
          textAlign="center"
        >
          <Text
            fontFamily="charter"
            fontSize={{ base: "1.375rem", md: "1.75rem" }}
            lineHeight="1.4"
            color="ink.900"
            mb={5}
          >
            Every organization on Poa is public:{" "}
            <Box as="em" fontStyle="italic">
              its rules, its decisions, its books.
            </Box>
          </Text>
          {/* Height-reserved slot: fills with the live registry count once
              the fetch answers; stays quietly empty if it never does. */}
          <Box minH="1.75rem" mb={3}>
            {showCount && (
              <Text fontFamily="ledger" fontSize="0.875rem" letterSpacing="0.06em" color="meadow.600">
                {counts.orgs} organization{counts.orgs === 1 ? "" : "s"}
                {counts.members > 0
                  ? ` and ${counts.members} member${counts.members === 1 ? "" : "s"}`
                  : ""}{" "}
                keep their books here.
              </Text>
            )}
          </Box>
          <CharterLink href="/explore" fontSize="1.0625rem">
            Read the books for yourself
          </CharterLink>
        </Box>
      </Wrap>
    </Box>
  );
};

export default WhoItsFor;
