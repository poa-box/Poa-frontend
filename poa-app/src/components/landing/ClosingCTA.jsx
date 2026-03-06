import React from "react";
import Link from "next/link";
import {
  Box,
  Button,
  Heading,
  Text,
  VStack,
  Container,
  chakra,
} from "@chakra-ui/react";
import { motion } from "framer-motion";

const MotionBox = chakra(motion.div);

const ClosingCTA = () => {
  return (
    <Box as="section" py={["16", "20", "24"]} px={[4, 6, 8]}>
      <Container maxW="container.md" textAlign="center">
        <MotionBox
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.7 }}
        >
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
        </MotionBox>
      </Container>
    </Box>
  );
};

export default ClosingCTA;
