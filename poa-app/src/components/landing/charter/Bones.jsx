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

// The ribbon: three spot-color rules stacked, the page's signature device.
// The logo is a name between rules; the ribbon is those rules in the
// union-banner colors.
export function TriRule(props) {
  return (
    <Box aria-hidden="true" {...props}>
      <Box borderTop="6px solid" borderColor="meadow.600" />
      <Box borderTop="3px solid" borderColor="oxblood.600" mt="4px" />
      <Box borderTop="2px solid" borderColor="ochre.600" mt="3px" />
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

// Section heading with the large serif numeral hanging beside it. The
// numeral color rotates per section (poster ink stations).
export function SectionHeading({ numeral, numeralColor = "meadow.600", children, ...rest }) {
  return (
    <Flex align="baseline" gap={{ base: 4, md: 6 }} {...rest}>
      {numeral && (
        <Text
          as="span"
          aria-hidden="true"
          fontFamily="charter"
          fontWeight="430"
          fontSize={{ base: "3.25rem", md: "5rem" }}
          lineHeight="1"
          color={numeralColor}
          transform="translateY(0.06em)"
        >
          {numeral}
        </Text>
      )}
      <Text
        as="h2"
        fontFamily="charter"
        fontWeight="490"
        fontSize={{ base: "2.25rem", md: "3.25rem" }}
        lineHeight="1.08"
        letterSpacing="-0.018em"
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

// Primary action. Mono, square, one color, with the letterpress offset
// shadow: a solid misregistered second impression, never a blur.
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
      boxShadow="4px 4px 0 #211D15"
      _hover={{ bg: "meadow.700", textDecoration: "none" }}
      _active={{ bg: "meadow.700", transform: "translate(2px, 2px)", boxShadow: "2px 2px 0 #211D15" }}
      _focusVisible={{ outline: "2px solid", outlineColor: "meadow.600", outlineOffset: "3px" }}
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
