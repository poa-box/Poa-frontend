import React from "react";
import NextLink from "next/link";
import { Box, Flex, Image, Link, SimpleGrid, Text } from "@chakra-ui/react";
import { Wrap, MonoLabel } from "./Bones";

const COLUMNS = [
  {
    heading: "Product",
    links: [
      { label: "Start an organization", href: "/create" },
      { label: "Browse organizations", href: "/explore" },
      { label: "Templates", href: "/docs/deployment-wizard" },
      { label: "Docs", href: "/docs" },
    ],
  },
  {
    heading: "Project",
    links: [
      { label: "About", href: "/about" },
      { label: "Source", href: "https://github.com/poa-box", external: true },
      { label: "Discord", href: "https://discord.gg/9SD6u4QjTt", external: true },
      { label: "X", href: "https://twitter.com/PoaPerpetual", external: true },
    ],
  },
];

const footerLink = {
  fontFamily: "charter",
  fontSize: "1rem",
  color: "ink.900",
  textDecoration: "none",
  _hover: { color: "meadow.700", textDecoration: "underline", textUnderlineOffset: "4px" },
  _focusVisible: { outline: "2px solid", outlineColor: "meadow.600", outlineOffset: "3px", boxShadow: "none" },
};

// The footer carries the one permitted sentence about the substrate.
const CharterFooter = () => {
  return (
    <Box as="footer" borderTop="1px solid" borderColor="ink.300" pt={{ base: 12, md: 16 }} pb={{ base: 10, md: 12 }}>
      <Wrap>
        <Flex
          direction={{ base: "column", md: "row" }}
          justify="space-between"
          gap={{ base: 12, md: 8 }}
          mb={{ base: 12, md: 16 }}
        >
          <Box maxW="320px">
            <Image src="/images/poa_logo.webp" alt="Poa" h="34px" mb={4} />
            <Text fontFamily="charter" fontStyle="italic" fontSize="1.0625rem" lineHeight="1.5" color="ink.500">
              Organizations owned by the people in them.
            </Text>
          </Box>

          <SimpleGrid columns={2} spacing={{ base: 8, md: 16 }}>
            {COLUMNS.map((col) => (
              <Box key={col.heading}>
                <MonoLabel as="h2" color="ink.500" display="block" mb={4}>
                  {col.heading}
                </MonoLabel>
                <Flex as="ul" direction="column" gap={2.5} listStyleType="none" m={0} p={0}>
                  {col.links.map((link) => (
                    <Box as="li" key={link.label}>
                      <Link
                        as={link.external ? undefined : NextLink}
                        href={link.href}
                        isExternal={link.external}
                        {...footerLink}
                      >
                        {link.label}
                      </Link>
                    </Box>
                  ))}
                </Flex>
              </Box>
            ))}
          </SimpleGrid>
        </Flex>

        <Box borderTop="1px solid" borderColor="ink.300" pt={6}>
          <Flex
            direction={{ base: "column", md: "row" }}
            justify="space-between"
            align={{ base: "flex-start", md: "baseline" }}
            gap={3}
          >
            <Text fontFamily="ledger" fontSize="0.8125rem" color="ink.500">
              Poa runs on open public infrastructure, and all of it is open-source.
            </Text>
            <Text fontFamily="ledger" fontSize="0.8125rem" color="ink.500">
              © {new Date().getFullYear()} Poa
            </Text>
          </Flex>
        </Box>
      </Wrap>
    </Box>
  );
};

export default CharterFooter;
