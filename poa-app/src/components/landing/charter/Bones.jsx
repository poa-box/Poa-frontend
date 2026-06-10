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

// Hairline rule with an exhibit number and a running label. Every numbered
// section opens with one.
export function SectionRule({ number, label }) {
  return (
    <Box
      borderTop="1px solid"
      borderColor="ink.300"
      pt={3}
      mb={{ base: 10, md: 14 }}
    >
      <Flex justify="space-between" align="baseline" gap={4}>
        <MonoLabel>{number}</MonoLabel>
        <MonoLabel color="ink.500" textAlign="right">
          {label}
        </MonoLabel>
      </Flex>
    </Box>
  );
}

// Section heading, set in the serif.
export function SectionHeading({ children, ...rest }) {
  return (
    <Text
      as="h2"
      fontFamily="charter"
      fontWeight="470"
      fontSize={{ base: "1.9rem", md: "2.5rem" }}
      lineHeight="1.15"
      letterSpacing="-0.015em"
      color="ink.900"
      {...rest}
    >
      {children}
    </Text>
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
