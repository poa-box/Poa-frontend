import React from "react";
import { Box, Flex, Link, Text } from "@chakra-ui/react";
import { Wrap, MonoLabel } from "./Bones";
import useLandingRegistry, { internalOrgUrl } from "./useLandingRegistry";

// Section 07. The reason, set as the page's deepest plate: paper and gold
// on the green, like a union banner. This is where the mission speaks
// plainly, and where "we" gets a structural answer: Poa itself runs as an
// organization on Poa (the /about page makes the same claim), so the line
// renders with a live link only when the registry confirms the org exists.
const Ethos = () => {
  const { isLoading, orgs } = useLandingRegistry();
  const poaOrg = !isLoading ? orgs.find((po) => po.id?.toLowerCase() === "poa") : null;
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
            Most software is rented. Walk away and it is gone. Poa is
            different. Your group owns the whole thing, for real, the rules
            and the money and all of it. The people who do the work own the
            most, and no one can take it from you, including us.{" "}
            <Box as="em" fontStyle="italic" color="ochre.400">
              Good institutions outlast their founders. We think the tools
              should too.
            </Box>
          </Text>

          {/* The structural answer to "who is we": skin in the game.
              Linked only once the live registry confirms the org exists. */}
          <Text
            fontFamily="charter"
            fontSize={{ base: "1.0625rem", md: "1.1875rem" }}
            lineHeight="1.6"
            color="paper.200"
            mt={{ base: 7, md: 9 }}
          >
            Poa itself runs as an organization on Poa.{" "}
            {poaOrg ? (
              <Link
                href={internalOrgUrl(poaOrg.id)}
                fontFamily="ledger"
                fontSize="0.9375rem"
                color="ochre.400"
                textDecoration="underline"
                textDecorationThickness="1px"
                textUnderlineOffset="4px"
                whiteSpace="nowrap"
                _hover={{ color: "paper.50", textDecorationThickness: "2px" }}
                _focusVisible={{ outline: "2px solid", outlineColor: "ochre.400", outlineOffset: "3px", boxShadow: "none" }}
              >
                Our books are public too
              </Link>
            ) : (
              <Box as="span">Our books are public too</Box>
            )}
            .
          </Text>
        </Box>
      </Wrap>
    </Box>
  );
};

export default Ethos;
