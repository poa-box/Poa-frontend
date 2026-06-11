import React from "react";
import { Box, Grid, Text } from "@chakra-ui/react";
import { Wrap, SectionRule, SectionHeading } from "./Bones";

// Every answer here is verified against the product docs (posts/
// treasury-management.md, cashout.md, gas-sponsor.md). Plain words, no
// euphemism, no promise the code does not keep.
const QA = [
  {
    q: "Who holds the money?",
    a: "The organization does, under its own rules. Poa never holds it and cannot move it.",
  },
  {
    q: "How does money come in?",
    a: "Anyone can fund the treasury: members, supporters, revenue from what you do. Giving requires no vote.",
  },
  {
    q: "How does it go out?",
    a: "Spending follows the rules the group chose. Work gets paid, and payouts land in the member's own account, not in a pile someone guards.",
  },
  {
    q: "Can I turn it into cash?",
    a: "Yes. Cash out to Cash App, Venmo, Revolut, or a bank account in a few minutes. The rate and any small marketplace fee are shown upfront. Poa charges nothing.",
  },
  {
    q: "What if Poa disappears?",
    a: "The treasury keeps working exactly the same way. The records stay readable, and any organization can run its own copy of the tools.",
  },
];

// Section 04. The fine print, printed large: where the money actually
// lives. Set on the page's one paper.200 band to break the long paper run.
const MoneyPlain = () => {
  return (
    <Box as="section" aria-labelledby="money-heading" bg="paper.200" py={{ base: 16, md: 24 }} mb={{ base: 16, md: 24 }}>
      <Wrap>
        <SectionRule number="04" label="The fine print" />
        <SectionHeading numeral="4" numeralColor="meadow.600" id="money-heading" mb={{ base: 10, md: 14 }}>
          Where the money lives
        </SectionHeading>

        <Box as="dl" m={0}>
          {QA.map((row) => (
            <Grid
              key={row.q}
              templateColumns={{ base: "1fr", md: "300px 1fr" }}
              gap={{ base: 1, md: 10 }}
              alignItems="baseline"
              py={{ base: 5, md: 6 }}
              borderBottom="1px solid"
              borderColor="ink.300"
            >
              <Text as="dt" fontFamily="charter" fontWeight="540" fontSize={{ base: "1.25rem", md: "1.375rem" }} lineHeight="1.3" color="ink.900">
                {row.q}
              </Text>
              <Text as="dd" m={0} fontFamily="charter" fontSize={{ base: "1.0625rem", md: "1.125rem" }} lineHeight="1.6" color="ink.500" maxW="640px">
                {row.a}
              </Text>
            </Grid>
          ))}
        </Box>
      </Wrap>
    </Box>
  );
};

export default MoneyPlain;
