import React, { useCallback, startTransition } from "react";
import NextLink from "next/link";
import { Box, Button, Flex, HStack, Image, Link } from "@chakra-ui/react";
import { Wrap, CharterButton } from "./Bones";

const NAV_LINKS = [
  { label: "How it works", href: "/#how-it-works", anchor: true, fromMd: true },
  { label: "Docs", href: "/docs" },
  { label: "Browse", href: "/explore", fromSm: true },
];

const linkStyles = {
  fontFamily: "ledger",
  fontSize: "0.875rem",
  color: "ink.500",
  textDecoration: "none",
  _hover: { color: "ink.900", textDecoration: "underline", textUnderlineOffset: "4px" },
  _focusVisible: { outline: "2px solid", outlineColor: "meadow.600", outlineOffset: "3px", boxShadow: "none" },
};

// Static header. No pill, no blur, no scroll behavior: a document's
// masthead, not an app's chrome. Auth wiring is identical to the old
// Navbar; only the dress changed.
const CharterNav = ({ mounted, isPasskeyUser, isConnected, isAuthenticated, accountMenuItem, onSignInOpen }) => {
  const handleSignInOpen = useCallback(() => {
    startTransition(onSignInOpen);
  }, [onSignInOpen]);

  const handleAccountClick = useCallback(() => {
    if (accountMenuItem?.onClick) {
      startTransition(accountMenuItem.onClick);
    }
  }, [accountMenuItem]);

  const showSignIn = mounted && !isPasskeyUser && !isConnected && !isAuthenticated;

  return (
    <Box as="header" borderBottom="1px solid" borderColor="ink.300">
      <Wrap>
        <Flex as="nav" aria-label="Main" py={{ base: 4, md: 5 }} align="center" justify="space-between" gap={4}>
          <Link
            as={NextLink}
            href="/"
            display="inline-flex"
            alignItems="center"
            _focusVisible={{ outline: "2px solid", outlineColor: "meadow.600", outlineOffset: "3px", boxShadow: "none" }}
          >
            <Image src="/images/poa_logo.webp" alt="Poa" h={{ base: "30px", md: "34px" }} />
          </Link>

          <HStack spacing={{ base: 4, md: 7 }}>
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                as={link.anchor ? undefined : NextLink}
                href={link.href}
                display={
                  link.fromMd
                    ? { base: "none", md: "inline" }
                    : link.fromSm
                      ? { base: "none", sm: "inline" }
                      : "inline"
                }
                {...linkStyles}
              >
                {link.label}
              </Link>
            ))}
            {showSignIn ? (
              <Button
                variant="link"
                onClick={handleSignInOpen}
                {...linkStyles}
                fontWeight="500"
                color="meadow.600"
                _hover={{ color: "meadow.700", textDecoration: "underline", textUnderlineOffset: "4px" }}
              >
                Sign in
              </Button>
            ) : mounted && isAuthenticated ? (
              <Button
                variant="link"
                onClick={handleAccountClick}
                {...linkStyles}
                fontWeight="500"
                color="meadow.600"
                _hover={{ color: "meadow.700", textDecoration: "underline", textUnderlineOffset: "4px" }}
              >
                {accountMenuItem.text}
              </Button>
            ) : null}
            <CharterButton href="/create" px={4} py={2} h="auto" minH="2.25rem" fontSize="0.8125rem">
              Start
            </CharterButton>
          </HStack>
        </Flex>
      </Wrap>
    </Box>
  );
};

export default CharterNav;
