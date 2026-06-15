import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { Wrap, MonoLabel, CharterButton, CharterLink, TriRule } from "./Bones";

// The masthead, built the way the logo is built: a name between rules,
// here in the banner colors. Entrance is the repo's pure-CSS .poa-fade
// (opacity only): visible at first paint even before hydration, honest
// under reduced motion.
const CharterHero = () => {
  return (
    <Box as="section" aria-label="Introduction">
      <Wrap>
        <Box
          className="poa-fade"
          textAlign="center"
          maxW="980px"
          mx="auto"
          pt={{ base: 12, md: 20 }}
          pb={{ base: 16, md: 24 }}
        >
          {/* The category, named before the poetry: a stranger should know
              what this is before the headline asks them to feel anything. */}
          <MonoLabel as="p" color="oxblood.600" mb={3}>
            organizations owned by the people in them
          </MonoLabel>

          {/* rules — headline — rules, like the mark */}
          <TriRule />
          <Text
            as="h1"
            fontFamily="charter"
            fontWeight="470"
            fontSize={{ base: "3rem", sm: "4.25rem", md: "6.25rem" }}
            lineHeight="1.02"
            letterSpacing="-0.02em"
            color="ink.900"
            py={{ base: 7, md: 10 }}
          >
            Start something
            <br />
            <Box as="em" fontStyle="italic" fontWeight="440" color="oxblood.600">
              that lasts.
            </Box>
          </Text>
          <TriRule transform="scaleY(-1)" />

          <Text
            fontFamily="charter"
            fontSize={{ base: "1.25rem", md: "1.5rem" }}
            lineHeight="1.5"
            color="ink.900"
            maxW="780px"
            mx="auto"
            mt={{ base: 8, md: 11 }}
            mb={4}
          >
            Poa turns a group into an organization: rules you choose together,
            members who vouch for each other, and a treasury that pays people
            in dollars.
          </Text>
          <Text
            fontFamily="charter"
            fontStyle="italic"
            fontSize={{ base: "1.125rem", md: "1.25rem" }}
            color="ink.500"
            mb={10}
          >
            Built for worker and community ownership. Open, decentralized,
            impossible to shut down. Nothing to install.
          </Text>

          <Flex justify="center" align="center" gap={9} wrap="wrap">
            <CharterButton href="/create" fontSize="1.0625rem" px={9} py={7}>
              Start an organization
            </CharterButton>
            <CharterLink href="/docs" fontSize="1.0625rem">
              Read how it works
            </CharterLink>
          </Flex>

          <Text
            fontFamily="ledger"
            fontSize="0.8125rem"
            letterSpacing="0.02em"
            color="ink.500"
            mt={10}
          >
            An account is a username and a passkey. Poa charges nothing.
          </Text>
        </Box>
      </Wrap>
    </Box>
  );
};

export default CharterHero;
