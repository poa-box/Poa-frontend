import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { Wrap, MonoLabel } from "./Bones";

// Section 06. The reason, set as the page's deepest plate: paper and gold
// on the green, like a union banner. This is where the mission speaks
// plainly.
const Ethos = () => {
  return (
    <Box as="section" aria-labelledby="ethos-heading" bg="meadow.700" py={{ base: 16, md: 24 }}>
      <Wrap>
        <Box mb={{ base: 8, md: 10 }}>
          <Box borderTop="6px solid" borderColor="ochre.400" />
          <Box borderTop="2px solid" borderColor="rgba(247, 242, 232, 0.45)" mt="4px" />
          <Flex justify="space-between" align="baseline" gap={4} pt={3}>
            <MonoLabel color="ochre.400">07</MonoLabel>
            <MonoLabel color="ochre.400" textAlign="right">
              The reason
            </MonoLabel>
          </Flex>
        </Box>

        <Box maxW="860px">
          <Text
            as="h2"
            id="ethos-heading"
            fontFamily="charter"
            fontWeight="490"
            fontSize={{ base: "2.25rem", md: "3.25rem" }}
            lineHeight="1.08"
            letterSpacing="-0.018em"
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
            Most software is rented. An institution should not be. We built
            Poa because we believe worker and community ownership is how a
            better future gets made, and that the tools for it should be a
            public good: the organizations made here keep their own records,
            hold their own money, and can host their own copy of everything.{" "}
            <Box as="em" fontStyle="italic" color="ochre.400">
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
