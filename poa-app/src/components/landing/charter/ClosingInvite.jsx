import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { Wrap, CharterButton, CharterLink } from "./Bones";

// The colophon: one sentence and the action again, for the reader who made
// it to the end.
const ClosingInvite = () => {
  return (
    <Box as="section" aria-label="Invitation" py={{ base: 16, md: 24 }}>
      <Wrap>
        <Box textAlign="center" maxW="640px" mx="auto">
          <Text
            fontFamily="charter"
            fontSize={{ base: "1.5rem", md: "1.875rem" }}
            lineHeight="1.35"
            color="ink.900"
            mb={8}
          >
            Starting takes minutes.{" "}
            <Box as="em" fontStyle="italic">
              Lasting is the point.
            </Box>
          </Text>
          <Flex justify="center" align="center" gap={8} wrap="wrap">
            <CharterButton href="/create">Start an organization</CharterButton>
            <CharterLink href="/explore">Browse the organizations</CharterLink>
          </Flex>
        </Box>
      </Wrap>
    </Box>
  );
};

export default ClosingInvite;
