import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { MonoLabel } from "./Bones";

const ROWS = [
  ["founded", "12 March 2026"],
  ["members", "14"],
  ["rules", "worker cooperative, adjusted"],
  ["votes", "one worker, one vote"],
  ["treasury", "$1,840.16"],
];

const DECISIONS = [
  ["no. 0006", "Hire a Saturday baker.", "passed, 9 to 4"],
  ["no. 0007", "Buy the second oven.", "passed, 11 to 2"],
];

// A charter, set as a specimen. Clearly labeled so it cannot be mistaken
// for a real organization; it shows the shape of the thing you get. Echoes
// the logo's construction: a name between two rules.
const Specimen = () => {
  return (
    <Box
      as="figure"
      maxW="560px"
      mx="auto"
      bg="paper.50"
      border="1px solid"
      borderColor="paper.300"
      borderRadius="2px"
      boxShadow="0 1px 0 rgba(33, 29, 21, 0.06)"
      px={{ base: 6, md: 8 }}
      py={{ base: 6, md: 7 }}
    >
      <Flex justify="space-between" align="baseline" mb={5}>
        <MonoLabel color="ink.500">specimen</MonoLabel>
        <MonoLabel color="ink.500">exhibit a</MonoLabel>
      </Flex>

      <Box borderTop="3px solid" borderColor="ink.900" pt={5} pb={4} textAlign="center">
        <Text fontFamily="charter" fontWeight="500" fontSize={{ base: "1.625rem", md: "1.75rem" }} lineHeight="1.2" color="ink.900">
          Hill Street Bakery
        </Text>
        <Text fontFamily="charter" fontStyle="italic" fontSize="1.0625rem" color="ink.500" mt={1}>
          a worker owned cooperative
        </Text>
      </Box>

      <Box borderTop="1px solid" borderColor="ink.300">
        {ROWS.map(([k, v]) => (
          <Flex
            key={k}
            justify="space-between"
            align="baseline"
            gap={4}
            py={2.5}
            borderBottom="1px solid"
            borderColor="paper.300"
          >
            <Text fontFamily="ledger" fontSize="0.8125rem" letterSpacing="0.1em" textTransform="uppercase" color="ink.500">
              {k}
            </Text>
            <Text fontFamily="ledger" fontSize="0.875rem" color="ink.900" textAlign="right">
              {v}
            </Text>
          </Flex>
        ))}
      </Box>

      <Box pt={4} pb={2}>
        <Text fontFamily="ledger" fontSize="0.8125rem" letterSpacing="0.1em" textTransform="uppercase" color="ink.500" mb={3}>
          the record
        </Text>
        {DECISIONS.map(([no, text, verdict]) => (
          <Flex key={no} gap={3} align="baseline" mb={2.5}>
            <Text fontFamily="ledger" fontSize="0.75rem" color="ink.500" flexShrink={0} w="4.25rem" whiteSpace="nowrap">
              {no}
            </Text>
            <Text fontFamily="charter" fontSize="1rem" color="ink.900">
              {text}{" "}
              <Text as="span" fontFamily="ledger" fontSize="0.8125rem" color="meadow.600" whiteSpace="nowrap">
                {verdict}
              </Text>
            </Text>
          </Flex>
        ))}
      </Box>

      <Box borderBottom="3px solid" borderColor="ink.900" pt={2} />

      <Text as="figcaption" srOnly>
        An illustrative example of an organization charter as it appears on Poa.
      </Text>
    </Box>
  );
};

export default Specimen;
