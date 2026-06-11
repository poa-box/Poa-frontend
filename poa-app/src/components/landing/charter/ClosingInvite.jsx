import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { Wrap, CharterButton, CharterLink, TriRule } from "./Bones";

// The colophon: one sentence and the action again, for the reader who made
// it to the end.
const ClosingInvite = () => {
  return (
    <Box as="section" aria-label="Invitation" py={{ base: 16, md: 24 }}>
      <Wrap>
        <Box textAlign="center" maxW="680px" mx="auto">
          <TriRule maxW="160px" mx="auto" mb={{ base: 8, md: 10 }} />
          <Text
            fontFamily="charter"
            fontSize={{ base: "1.75rem", md: "2.25rem" }}
            lineHeight="1.3"
            color="ink.900"
            mb={9}
          >
            Starting takes minutes.{" "}
            <Box as="em" fontStyle="italic" color="oxblood.600">
              Lasting is the point.
            </Box>
          </Text>
          <Flex justify="center" align="center" gap={9} wrap="wrap">
            <CharterButton href="/create" fontSize="1.0625rem" px={9} py={7}>
              Start an organization
            </CharterButton>
            <CharterLink href="/explore" fontSize="1.0625rem" color="oxblood.600" _hover={{ color: "oxblood.700", textDecorationThickness: "2px" }}>
              Browse the organizations
            </CharterLink>
          </Flex>
        </Box>
      </Wrap>
    </Box>
  );
};

export default ClosingInvite;
