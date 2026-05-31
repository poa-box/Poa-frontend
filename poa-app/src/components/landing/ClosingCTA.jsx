import React from "react";
import Link from "next/link";
import {
  Box,
  Button,
  Heading,
  Text,
  VStack,
  Container,
} from "@chakra-ui/react";

const ClosingCTA = () => {
  return (
    <Box as="section" py={["16", "20", "24"]} px={[4, 6, 8]}>
      <Container maxW="container.md" textAlign="center">
        <Box className="poa-reveal">
          <VStack spacing={[5, 6]}>
            <Heading
              as="h2"
              fontSize={["2xl", "3xl", "4xl"]}
              fontWeight="700"
              letterSpacing="-0.02em"
            >
              Ready to Build?
            </Heading>
            <Text
              fontSize={["lg", "xl"]}
              color="warmGray.600"
              maxW="480px"
            >
              Start your community-owned organization in minutes.
            </Text>
            <Link href="/create" style={{ textDecoration: "none" }}>
              <Button
                size="lg"
                bg="warmGray.900"
                color="white"
                borderRadius="full"
                px={8}
                fontSize="md"
                fontWeight="600"
                _hover={{ bg: "warmGray.800" }}
                _active={{ bg: "warmGray.700" }}
                transition="background 0.2s"
              >
                Create an Organization
              </Button>
            </Link>
          </VStack>
        </Box>
      </Container>
    </Box>
  );
};

export default ClosingCTA;
