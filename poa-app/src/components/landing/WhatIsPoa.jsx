import React from "react";
import Link from "next/link";
import {
  Box,
  Text,
  Heading,
  Flex,
  Container,
  chakra,
} from "@chakra-ui/react";
import { motion } from "framer-motion";

const MotionBox = chakra(motion.div);

const WhatIsPoa = () => {
  return (
    <Box as="section" pt={["16", "20", "28"]} pb={["12", "16", "20"]} px={[4, 6, 8]}>
      <Container maxW="container.xl">
        <Flex
          direction={["column", "column", "row-reverse"]}
          align="center"
          gap={[8, 8, 12]}
        >
          {/* Text side */}
          <Box flex="1">
            <MotionBox
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.7 }}
              maxW="620px"
            >
              <Text
                fontSize={["sm", "sm"]}
                fontWeight="600"
                color="warmGray.400"
                letterSpacing="0.08em"
                textTransform="uppercase"
                mb={[3, 4]}
              >
                What is Poa?
              </Text>
              <Heading
                as="h2"
                fontSize={["3xl", "4xl", "5xl"]}
                fontWeight="700"
                letterSpacing="-0.01em"
                mb={[4, 5]}
              >
                From idea to organization in minutes
              </Heading>
              <Text
                fontSize={["xl", "2xl"]}
                color="warmGray.600"
                lineHeight="1.8"
                fontWeight="500"
              >
                Choose a governance model, deploy your organization, and start making decisions together. No code required. Poa handles voting, treasury, roles, and project management so your community can focus on what matters.
              </Text>
              <Link href="/create" style={{ textDecoration: "none" }}>
                <Text
                  fontSize={["sm", "md"]}
                  fontWeight="600"
                  color="warmGray.500"
                  _hover={{ color: "amethyst.500" }}
                  transition="color 0.2s"
                  mt={[2, 3]}
                >
                  Create your organization, we&apos;ll recommend the right setup for you &rarr;
                </Text>
              </Link>
            </MotionBox>
          </Box>

          {/* Video placeholder */}
          <Flex flex="1" justify="center" align="center">
            <MotionBox
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.2 }}
              w="100%"
              maxW="520px"
            >
              <Box
                w="100%"
                pt="56.25%"
                position="relative"
                borderRadius="xl"
                bg="warmGray.100"
                border="1px solid"
                borderColor="warmGray.200"
                overflow="hidden"
              >
                <Flex
                  position="absolute"
                  top={0}
                  left={0}
                  right={0}
                  bottom={0}
                  align="center"
                  justify="center"
                  direction="column"
                  gap={3}
                >
                  {/* Play button */}
                  <Box
                    w="60px"
                    h="60px"
                    borderRadius="full"
                    bg="warmGray.900"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Box
                      w={0}
                      h={0}
                      ml="3px"
                      borderLeft="18px solid white"
                      borderTop="11px solid transparent"
                      borderBottom="11px solid transparent"
                    />
                  </Box>
                  <Text fontSize="sm" color="warmGray.400" fontWeight="500">
                    Video coming soon
                  </Text>
                </Flex>
              </Box>
            </MotionBox>
          </Flex>
        </Flex>
      </Container>
    </Box>
  );
};

export default WhatIsPoa;
