import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { Wrap, MonoLabel, CharterButton, CharterLink } from "./Bones";

// The frontispiece. One sentence, one action, set like a title page.
// Entrance is the repo's pure-CSS .poa-fade (opacity only): visible at
// first paint even before hydration, honest under reduced motion.
const CharterHero = () => {
  return (
    <Box as="section" aria-label="Introduction">
      <Wrap>
        <Box
          className="poa-fade"
          textAlign="center"
          pt={{ base: 20, md: 32 }}
          pb={{ base: 16, md: 24 }}
        >
          <MonoLabel as="p" color="ink.500">
            est. 2024
          </MonoLabel>

          <Text
            as="h1"
            fontFamily="charter"
            fontWeight="460"
            fontSize={{ base: "2.75rem", sm: "3.25rem", md: "4.5rem" }}
            lineHeight="1.06"
            letterSpacing="-0.015em"
            color="ink.900"
            mt={6}
            mb={7}
          >
            Start something
            <Box as="br" display={{ base: "none", sm: "inline" }} />{" "}
            that lasts.
          </Text>

          <Text
            fontFamily="charter"
            fontSize={{ base: "1.125rem", md: "1.25rem" }}
            lineHeight="1.6"
            color="ink.500"
            maxW="620px"
            mx="auto"
            mb={10}
          >
            Poa turns a group into an organization: rules you choose together,
            membership built on vouching, and a treasury that pays people in
            dollars. Nothing to install.
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
