import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Flex,
  HStack,
  Text,
  Button,
  Image,
  Box,
  VStack,
  IconButton,
  Collapse,
  useDisclosure,
} from "@chakra-ui/react";
import { HiMenu, HiX } from "react-icons/hi";

const NAV_LINKS = [
  { label: "About", href: "/about" },
  { label: "Docs", href: "/docs" },
  { label: "Browse", href: "/browser" },
  { label: "Protocol", href: "/protocol" },
  { label: "Create", href: "/create" },
];

const SCROLL_THRESHOLD = 48;

const Navbar = ({
  mounted,
  isPasskeyUser,
  isConnected,
  isAuthenticated,
  accountMenuItem,
  onSignInOpen,
}) => {
  const { isOpen, onToggle } = useDisclosure();
  const [scrolled, setScrolled] = useState(false);

  const handleScroll = useCallback(() => {
    setScrolled(window.scrollY > SCROLL_THRESHOLD);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const showSignIn = mounted && !isPasskeyUser && !isConnected && !isAuthenticated;

  return (
    <Box
      as="nav"
      position="fixed"
      top={0}
      left={0}
      zIndex={20}
      w="100%"
      py={scrolled ? [1, 1.5] : [2, 3]}
      bg="transparent"
      pointerEvents="none"
      transition="padding 0.35s cubic-bezier(0.4, 0, 0.2, 1)"
    >
      {/* Floating Pill */}
      <Flex
        maxW={scrolled ? "container.md" : "container.lg"}
        mx="auto"
        px={scrolled ? [2, 3, 4] : [3, 4, 6]}
        py={scrolled ? 1.5 : 2}
        justify="space-between"
        align="center"
        borderRadius="full"
        bg={scrolled ? "rgba(255, 255, 255, 0.75)" : "rgba(255, 255, 255, 0.9)"}
        backdropFilter="saturate(180%) blur(16px)"
        border="1px solid"
        borderColor={scrolled ? "rgba(0, 0, 0, 0.04)" : "rgba(0, 0, 0, 0.06)"}
        boxShadow={scrolled ? "0 1px 8px rgba(0, 0, 0, 0.04)" : "0 4px 16px rgba(0, 0, 0, 0.06)"}
        pointerEvents="auto"
        transition="all 0.35s cubic-bezier(0.4, 0, 0.2, 1)"
      >
        {/* Logo */}
        <Link href="/" style={{ textDecoration: "none" }}>
          <HStack spacing={1.5} cursor="pointer">
            <Image
              src="/images/poa_logo.png"
              alt="Poa"
              h={scrolled ? ["20px", "22px", "24px"] : ["24px", "28px", "32px"]}
              transition="height 0.35s cubic-bezier(0.4, 0, 0.2, 1)"
            />
            <Text
              fontWeight="700"
              fontSize={scrolled ? "xs" : ["sm", "md"]}
              color="warmGray.900"
              transition="font-size 0.35s cubic-bezier(0.4, 0, 0.2, 1)"
            >
              Poa
            </Text>
          </HStack>
        </Link>

        {/* Desktop Nav Links */}
        <HStack spacing={scrolled ? 4 : 6} display={["none", "none", "flex"]}>
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} style={{ textDecoration: "none" }}>
              <Text
                fontWeight="500"
                fontSize={scrolled ? "xs" : "sm"}
                color="warmGray.500"
                _hover={{ color: "warmGray.900" }}
                transition="all 0.25s ease"
              >
                {link.label}
              </Text>
            </Link>
          ))}
        </HStack>

        {/* Desktop Auth Button */}
        <Box display={["none", "none", "block"]}>
          {showSignIn ? (
            <Button
              size={scrolled ? "xs" : "sm"}
              bg="warmGray.900"
              color="white"
              borderRadius="full"
              fontWeight="600"
              fontSize={scrolled ? "xs" : "sm"}
              _hover={{ bg: "warmGray.800" }}
              _active={{ bg: "warmGray.700" }}
              transition="all 0.25s ease"
              onClick={onSignInOpen}
            >
              Sign In
            </Button>
          ) : mounted && isAuthenticated ? (
            <Button
              size={scrolled ? "xs" : "sm"}
              variant="outline"
              borderColor="warmGray.200"
              color="warmGray.700"
              borderRadius="full"
              fontWeight="600"
              fontSize={scrolled ? "xs" : "sm"}
              _hover={{ bg: "warmGray.50", borderColor: "warmGray.300" }}
              onClick={accountMenuItem.onClick}
              transition="all 0.25s ease"
            >
              {accountMenuItem.text}
            </Button>
          ) : null}
        </Box>

        {/* Mobile Hamburger */}
        <IconButton
          display={["flex", "flex", "none"]}
          icon={isOpen ? <HiX size={scrolled ? 16 : 18} /> : <HiMenu size={scrolled ? 16 : 18} />}
          variant="ghost"
          size="sm"
          color="warmGray.700"
          aria-label="Toggle navigation"
          onClick={onToggle}
          _hover={{ bg: "warmGray.50" }}
          borderRadius="full"
        />
      </Flex>

      {/* Mobile Dropdown */}
      <Collapse in={isOpen} animateOpacity>
        <Box
          display={["block", "block", "none"]}
          mx={[3, 4]}
          mt={2}
          p={3}
          borderRadius="xl"
          bg="rgba(255, 255, 255, 0.95)"
          backdropFilter="saturate(180%) blur(12px)"
          border="1px solid"
          borderColor="warmGray.100"
          boxShadow="0 4px 20px rgba(0, 0, 0, 0.06)"
          pointerEvents="auto"
        >
          <VStack spacing={0} align="stretch">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} style={{ textDecoration: "none" }}>
                <Box
                  py={2.5}
                  px={3}
                  borderRadius="lg"
                  _hover={{ bg: "warmGray.50" }}
                  cursor="pointer"
                  onClick={onToggle}
                >
                  <Text fontWeight="500" fontSize="sm" color="warmGray.700">
                    {link.label}
                  </Text>
                </Box>
              </Link>
            ))}
            {showSignIn ? (
              <Button
                mt={2}
                size="sm"
                bg="warmGray.900"
                color="white"
                borderRadius="full"
                fontWeight="600"
                _hover={{ bg: "warmGray.800" }}
                onClick={() => {
                  onSignInOpen();
                  onToggle();
                }}
              >
                Sign In
              </Button>
            ) : mounted && isAuthenticated ? (
              <Button
                mt={2}
                size="sm"
                variant="outline"
                borderColor="warmGray.200"
                color="warmGray.700"
                borderRadius="full"
                fontWeight="600"
                _hover={{ bg: "warmGray.50" }}
                onClick={() => {
                  accountMenuItem.onClick();
                  onToggle();
                }}
              >
                {accountMenuItem.text}
              </Button>
            ) : null}
          </VStack>
        </Box>
      </Collapse>
    </Box>
  );
};

export default Navbar;
