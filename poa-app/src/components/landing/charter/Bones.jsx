import React from "react";
import NextLink from "next/link";
import { Box, Button, Flex, Link, Text } from "@chakra-ui/react";

// Shared layout constants for the charter landing page. Sections never
// restate these values.
export const WRAP_MAX = "1100px";
export const PROSE_MAX = "680px";
export const WRAP_PX = { base: 5, md: 10 };
export const SECTION_PY = { base: 16, md: 24 };

// Container.
export function Wrap({ children, ...rest }) {
  return (
    <Box maxW={WRAP_MAX} mx="auto" px={WRAP_PX} {...rest}>
      {children}
    </Box>
  );
}

// Mono label, the page's voice for the mechanical: numbers, dates, labels.
export function MonoLabel({ children, ...rest }) {
  return (
    <Text
      as="span"
      fontFamily="ledger"
      fontSize="0.8125rem"
      fontWeight="500"
      letterSpacing="0.14em"
      textTransform="uppercase"
      color="meadow.600"
      {...rest}
    >
      {children}
    </Text>
  );
}

// The classic fine-print double rule: a heavy line over a hairline.
export function DoubleRule({ inverted, ...rest }) {
  return (
    <Box {...rest}>
      <Box borderTop="3px solid" borderColor={inverted ? "paper.100" : "ink.900"} />
      <Box borderTop="1px solid" borderColor={inverted ? "paper.300" : "ink.300"} mt="4px" />
    </Box>
  );
}

// Section opener: double rule with the exhibit number and a running label,
// then a large serif numeral beside the heading. The big numeral carries
// the scale contrast letterpress pages live on.
export function SectionRule({ number, label, inverted }) {
  return (
    <Box mb={{ base: 8, md: 10 }}>
      <DoubleRule />
      <Flex justify="space-between" align="baseline" gap={4} pt={3}>
        <MonoLabel color={inverted ? "paper.200" : undefined}>{number}</MonoLabel>
        <MonoLabel color={inverted ? "paper.200" : "ink.500"} textAlign="right">
          {label}
        </MonoLabel>
      </Flex>
    </Box>
  );
}

// Section heading with the large serif numeral hanging beside it.
export function SectionHeading({ numeral, children, ...rest }) {
  return (
    <Flex align="baseline" gap={{ base: 4, md: 6 }} {...rest}>
      {numeral && (
        <Text
          as="span"
          aria-hidden="true"
          fontFamily="charter"
          fontWeight="430"
          fontSize={{ base: "3rem", md: "4.25rem" }}
          lineHeight="1"
          color="meadow.600"
          transform="translateY(0.06em)"
        >
          {numeral}
        </Text>
      )}
      <Text
        as="h2"
        fontFamily="charter"
        fontWeight="470"
        fontSize={{ base: "2.1rem", md: "2.75rem" }}
        lineHeight="1.12"
        letterSpacing="-0.015em"
        color="ink.900"
      >
        {children}
      </Text>
    </Flex>
  );
}

// Body text with a readable measure.
export function Prose({ children, ...rest }) {
  return (
    <Text
      fontFamily="charter"
      fontSize="1.0625rem"
      lineHeight="1.65"
      color="ink.900"
      maxW={PROSE_MAX}
      {...rest}
    >
      {children}
    </Text>
  );
}

// Primary action. Mono, square, one color.
export function CharterButton({ href, children, ...rest }) {
  return (
    <Button
      as={href ? NextLink : undefined}
      href={href}
      bg="meadow.600"
      color="paper.50"
      fontFamily="ledger"
      fontWeight="500"
      fontSize="0.9375rem"
      letterSpacing="0.04em"
      px={7}
      py={6}
      borderRadius="2px"
      _hover={{ bg: "meadow.700", textDecoration: "none" }}
      _active={{ bg: "meadow.700" }}
      _focusVisible={{ outline: "2px solid", outlineColor: "meadow.600", outlineOffset: "3px", boxShadow: "none" }}
      {...rest}
    >
      {children}
    </Button>
  );
}

// Quiet text link: serif-adjacent underline in the accent.
export function CharterLink({ href, external, children, ...rest }) {
  return (
    <Link
      as={external ? undefined : NextLink}
      href={href}
      isExternal={external}
      fontFamily="ledger"
      fontSize="0.9375rem"
      color="meadow.600"
      textDecoration="underline"
      textDecorationThickness="1px"
      textUnderlineOffset="4px"
      _hover={{ color: "meadow.700", textDecorationThickness: "2px" }}
      _focusVisible={{ outline: "2px solid", outlineColor: "meadow.600", outlineOffset: "3px", boxShadow: "none" }}
      {...rest}
    >
      {children}
    </Link>
  );
}
