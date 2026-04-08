import React from "react";
import Link from "next/link";
import {
  Box,
  Flex,
  VStack,
  HStack,
  Text,
  Image,
  SimpleGrid,
  Icon,
  Container,
} from "@chakra-ui/react";
import { FaDiscord } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";

const FooterLinkGroup = ({ title, links }) => (
  <VStack align={["center", "flex-start"]} spacing={2}>
    <Text
      fontWeight="600"
      fontSize="xs"
      color="warmGray.300"
      textTransform="uppercase"
      letterSpacing="wider"
      mb={1}
    >
      {title}
    </Text>
    {links.map((link) => (
      <Link key={link.href} href={link.href} style={{ textDecoration: "none" }} {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        <Text
          fontSize="sm"
          color="warmGray.400"
          _hover={{ color: "white" }}
          transition="color 0.2s"
        >
          {link.label}
        </Text>
      </Link>
    ))}
  </VStack>
);

const Footer = () => (
  <Box as="footer" bg="warmGray.900" color="warmGray.300" py={[10, 12]} px={[4, 6, 8]}>
    <Container maxW="container.xl">
      <SimpleGrid columns={[1, 2, 3]} spacing={[8, 10]}>
        {/* Brand */}
        <VStack align={["center", "flex-start"]} spacing={3}>
          <HStack spacing={2}>
            <Image src="/images/poa_logo.png" alt="Poa" h="28px" />
            <Text fontWeight="700" fontSize="lg" color="white">
              Poa
            </Text>
          </HStack>
          <Text fontSize="sm" color="warmGray.400" maxW="220px" textAlign={["center", "left"]}>
            Community-owned organization builder. Create democratic, worker-owned organizations with no code.
          </Text>
        </VStack>

        {/* Product */}
        <FooterLinkGroup
          title="Product"
          links={[
            { label: "Create Organization", href: "/create" },
            { label: "Browse Organizations", href: "/explore" },
            { label: "Documentation", href: "/docs" },
            { label: "Protocol Dashboard", href: "/protocol" },
            { label: "About", href: "/about" },
          ]}
        />

        {/* Community */}
        <FooterLinkGroup
          title="Community"
          links={[
            { label: "Discord", href: "https://discord.gg/kKDKgetdNx", external: true },
            { label: "Twitter", href: "https://twitter.com/PoaPerpetual", external: true },
          ]}
        />
      </SimpleGrid>

      <Box
        h="1px"
        maxW="200px"
        mx="auto"
        my={8}
        bgGradient="linear(to-r, transparent, #9055E8, #E85D85, transparent)"
      />

      <Flex
        justify="space-between"
        align="center"
        flexWrap="wrap"
        gap={4}
        direction={["column", "row"]}
      >
        <Text fontSize="xs" color="warmGray.500">
          &copy; {new Date().getFullYear()} Poa. All rights reserved.
        </Text>
        <HStack spacing={4}>
          <Link href="https://discord.gg/kKDKgetdNx" target="_blank" rel="noopener noreferrer">
            <Icon
              as={FaDiscord}
              boxSize={4}
              color="warmGray.500"
              _hover={{ color: "warmGray.300" }}
              transition="color 0.2s"
            />
          </Link>
          <Link href="https://twitter.com/PoaPerpetual" target="_blank" rel="noopener noreferrer">
            <Icon
              as={FaXTwitter}
              boxSize={4}
              color="warmGray.500"
              _hover={{ color: "warmGray.300" }}
              transition="color 0.2s"
            />
          </Link>
        </HStack>
      </Flex>
    </Container>
  </Box>
);

export default Footer;
