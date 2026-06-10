import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { MonoLabel } from "./Bones";

const ROWS = [
  ["founded", "12 March 2026"],
  ["members", "14"],
  ["rules", "worker cooperative, adjusted"],
  ["votes", "one worker, one vote"],
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
      px={{ base: 6, md: 9 }}
      py={{ base: 6, md: 8 }}
    >
      <Flex justify="space-between" align="baseline" mb={5}>
        <MonoLabel color="ink.500">specimen</MonoLabel>
        <MonoLabel color="ink.500">no. 0001</MonoLabel>
      </Flex>

      <Box borderTop="2px solid" borderColor="ink.900" pt={5} pb={4} textAlign="center">
        <Text fontFamily="charter" fontWeight="500" fontSize={{ base: "1.625rem", md: "1.875rem" }} lineHeight="1.2" color="ink.900">
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

      <Box borderBottom="2px solid" borderColor="ink.900" pt={4} pb={5}>
        <Text fontFamily="ledger" fontSize="0.8125rem" letterSpacing="0.1em" textTransform="uppercase" color="ink.500" mb={1.5}>
          decision no. 0007
        </Text>
        <Text fontFamily="charter" fontSize="1.0625rem" color="ink.900">
          Buy the second oven.{" "}
          <Text as="span" fontFamily="ledger" fontSize="0.875rem" color="meadow.600" ml={2}>
            passed, 11 to 2
          </Text>
        </Text>
      </Box>

      <Text as="figcaption" fontFamily="ledger" fontSize="0.75rem" color="ink.500" mt={4} textAlign="center">
        a charter as it appears here, set as a specimen
      </Text>
    </Box>
  );
};

export default Specimen;
