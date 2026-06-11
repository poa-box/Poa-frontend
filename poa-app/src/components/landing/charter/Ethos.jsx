import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { Wrap, MonoLabel } from "./Bones";

// Section 06. The quiet manifesto, set as the page's one color plate:
// paper type on the deep green, like the cloth cover of the book the rest
// of the page is printed in.
const Ethos = () => {
  return (
    <Box as="section" aria-labelledby="ethos-heading" bg="meadow.700" py={{ base: 16, md: 24 }}>
      <Wrap>
        <Box mb={{ base: 8, md: 10 }}>
          <Box borderTop="3px solid" borderColor="paper.100" />
          <Box borderTop="1px solid" borderColor="rgba(247, 242, 232, 0.35)" mt="4px" />
          <Flex justify="space-between" align="baseline" gap={4} pt={3}>
            <MonoLabel color="paper.200">06</MonoLabel>
            <MonoLabel color="paper.200" textAlign="right">
              The reason
            </MonoLabel>
          </Flex>
        </Box>

        <Box maxW="820px">
          <Text
            as="h2"
            id="ethos-heading"
            fontFamily="charter"
            fontWeight="470"
            fontSize={{ base: "2.1rem", md: "2.75rem" }}
            lineHeight="1.12"
            letterSpacing="-0.015em"
            color="paper.50"
            mb={{ base: 7, md: 9 }}
          >
            Why we built it
          </Text>
          <Text
            fontFamily="charter"
            fontSize={{ base: "1.25rem", md: "1.5rem" }}
            lineHeight="1.55"
            color="paper.100"
          >
            Most software is rented. An institution should not be. The
            organizations made here keep their own records, hold their own
            money, and can host their own copy of the tools.{" "}
            <Box as="em" fontStyle="italic">
              Good institutions outlast their founders. We think the tools
              should too.
            </Box>
          </Text>
        </Box>
      </Wrap>
    </Box>
  );
};

export default Ethos;
