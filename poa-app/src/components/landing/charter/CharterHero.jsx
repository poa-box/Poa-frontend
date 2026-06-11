import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { Wrap, MonoLabel, CharterButton, CharterLink } from "./Bones";

// The frontispiece, built the way the logo is built: a name between two
// heavy rules. Entrance is the repo's pure-CSS .poa-fade (opacity only):
// visible at first paint even before hydration, honest under reduced motion.
const CharterHero = () => {
  return (
    <Box as="section" aria-label="Introduction">
      <Wrap>
        <Box
          className="poa-fade"
          textAlign="center"
          maxW="900px"
          mx="auto"
          pt={{ base: 14, md: 24 }}
          pb={{ base: 16, md: 24 }}
        >
          <Flex justify="space-between" align="baseline" mb={3} px={1}>
            <MonoLabel color="ink.500">est. 2024</MonoLabel>
            <MonoLabel color="ink.500">poa.box</MonoLabel>
          </Flex>

          {/* rule — headline — rule, like the mark */}
          <Box borderTop="3px solid" borderColor="ink.900" />
          <Text
            as="h1"
            fontFamily="charter"
            fontWeight="450"
            fontSize={{ base: "3rem", sm: "3.75rem", md: "5.25rem" }}
            lineHeight="1.05"
            letterSpacing="-0.018em"
            color="ink.900"
            py={{ base: 6, md: 9 }}
          >
            Start something
            <Box as="br" display={{ base: "none", sm: "inline" }} />{" "}
            <Box as="em" fontStyle="italic" fontWeight="430">
              that lasts.
            </Box>
          </Text>
          <Box borderBottom="3px solid" borderColor="ink.900" />

          <Text
            fontFamily="charter"
            fontSize={{ base: "1.1875rem", md: "1.375rem" }}
            lineHeight="1.55"
            color="ink.500"
            maxW="640px"
            mx="auto"
            mt={{ base: 8, md: 10 }}
            mb={10}
          >
            Poa turns a group into an organization: rules you choose together,
            members who vouch for each other, and a treasury that pays people
            in dollars. Nothing to install.
          </Text>

          <Flex justify="center" align="center" gap={8} wrap="wrap">
            <CharterButton href="/create">Start an organization</CharterButton>
            <CharterLink href="/docs">Read how it works</CharterLink>
          </Flex>

          <Text
            fontFamily="ledger"
            fontSize="0.8125rem"
            letterSpacing="0.02em"
            color="ink.500"
            mt={9}
          >
            An account is a username and a passkey. Poa charges nothing.
          </Text>
        </Box>
      </Wrap>
    </Box>
  );
};

export default CharterHero;
