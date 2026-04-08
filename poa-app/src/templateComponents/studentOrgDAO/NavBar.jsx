import React, { useState, useEffect } from "react";
import { Box, Flex, HStack, Link, IconButton, useDisclosure, Drawer, DrawerOverlay, DrawerContent, DrawerCloseButton, DrawerHeader, DrawerBody, VStack, Text, Button, Tooltip } from "@chakra-ui/react";
import NextImage from "next/image";
import { HamburgerIcon, SettingsIcon } from '@chakra-ui/icons';
import { FaHome } from 'react-icons/fa';
import NextLink from "next/link";
import { useRouter } from "next/router";
import LoginButton from "@/components/LoginButton";
import { useAuth } from "@/context/AuthContext";
import { usePOContext } from "@/context/POContext";
import { useIsOrgAdmin } from "@/hooks/useIsOrgAdmin";
const Navbar = () => {
  const router = useRouter();
  const { userDAO } = router.query;
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isPasskeyUser, accountAddress, isAuthenticated } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const { educationHubEnabled, hideTreasury, orgId } = usePOContext();

  // Check if user is an org admin (for showing Settings link)
  // Use AuthContext's unified address so passkey users get admin check too
  const { isAdmin } = useIsOrgAdmin(orgId, accountAddress);

  // Navigation items - conditionally include Learn & Earn based on educationHubEnabled
  const navItems = [
    { name: 'Dashboard', path: `/dashboard/?userDAO=${userDAO}` },
    { name: 'Tasks', path: `/tasks/?userDAO=${userDAO}` },
    { name: 'Voting', path: `/voting/?userDAO=${userDAO}` },
    ...(!hideTreasury ? [{ name: 'Treasury', path: `/treasury/?userDAO=${userDAO}` }] : []),
    ...(educationHubEnabled ? [{ name: 'Learn & Earn', path: `/edu-Hub/?userDAO=${userDAO}` }] : []),
    ...(isAdmin ? [{ name: 'Settings', path: `/settings/?userDAO=${userDAO}` }] : []),
  ];

  // Function to check active route
  const isActive = (path) => {
    const basePath = '/' + (router.pathname.split('/')[1] || '');
    return basePath === '/' + (path.split('/')[1] || '');
  };

  return (
    <Box 
      bg="black" 
      p={2.5} 
      alignItems={"center"}
      position={{ base: "fixed", md: "relative" }}
      top="0"
      left="0"
      zIndex={100}
      width="100%"
      boxShadow={{ base: "0px 1px 5px rgba(0,0,0,0.3)", md: "none" }}
      borderBottom={{ base: "1px solid rgba(255,255,255,0.1)", md: "none" }}
    >
      <Flex
        alignItems="center"
        h={{ base: "40px", md: "60px" }}
        maxW="100%"
        justifyContent="space-between"
      >
        {/* Left side - Home icon */}
        <Flex h="100%" w={{ base: "40%", md: "auto" }} mr={{ base: "2", md: "4" }} align="center">
          <Link as={NextLink} href={`/home/?userDAO=${userDAO}`} passHref>
            {/* Desktop Home Icon */}
            <IconButton
              icon={<FaHome size="34px" />}
              aria-label="Home"
              variant="ghost"
              color="white"
              display={{ base: 'none', md: 'flex' }}
              _hover={{ bg: "whiteAlpha.200" }}
              size="lg"
            />
            {/* Mobile Home Icon */}
            <IconButton
              icon={<FaHome size="34px" />}
              aria-label="Home"
              variant="ghost"
              color="white"
              display={{ base: 'flex', md: 'none' }}
              _hover={{ bg: "whiteAlpha.200" }}
              size="sm"
              p={0}
              mt={1}
            />
          </Link>
        </Flex>
        
        {/* Center Logo for Mobile only */}
        <Flex 
          justify="center" 
          align="center" 
          position="absolute" 
          left="0" 
          right="0" 
          mx="auto"
          display={{ base: 'flex', md: 'none' }}
          pointerEvents="auto"
          h="100%"
          zIndex={1}
          width="40%"
        >
          <Link 
            href="https://poa.community" 
            isExternal 
            display="flex"
            justifyContent="center"
            alignItems="center"
            h="100%"
            w="100%"
          >
            <NextImage
              src="/images/high_res_poa.png"
              alt="PoA Logo"
              width={40}
              height={40}
              priority
              style={{ objectFit: 'contain', maxHeight: '87%', width: 'auto' }}
            />
          </Link>
        </Flex>
        
        {/* Desktop Navigation */}
        <Flex
          data-tour="nav-links"
          justifyContent="space-between"
          flexGrow={1}
          ml={4}
          mr={4}
          alignItems="center"
          display={{ base: 'none', md: 'flex' }}
        >
          <Link as={NextLink} href={`/dashboard/?userDAO=${userDAO}`} color="white" fontWeight="extrabold" fontSize="xl" mx={"2%"}>
            Dashboard
          </Link>
          <Link
            as={NextLink}
            href={`/tasks/?userDAO=${userDAO}`}
            color="white"
            fontWeight="extrabold"
            fontSize="xl"
            mx={"2%"}
          >
            Tasks
          </Link>
          <Link
            as={NextLink}
            href={`/voting/?userDAO=${userDAO}`}
            color="white"
            fontWeight="extrabold"
            fontSize="xl"
            mx={"2%"}
          >
            Voting
          </Link>
          {!hideTreasury && (
            <Link
              as={NextLink}
              href={`/treasury/?userDAO=${userDAO}`}
              color="white"
              fontWeight="extrabold"
              fontSize="xl"
              mx={"2%"}
            >
              Treasury
            </Link>
          )}
          {educationHubEnabled && (
            <Link
              as={NextLink}
              href={`/edu-Hub/?userDAO=${userDAO}`}
              color="white"
              fontWeight="extrabold"
              fontSize="xl"
              mx={"2%"}
            >
              Learn & Earn
            </Link>
          )}
          {isAdmin && (
            <Link
              as={NextLink}
              href={`/settings/?userDAO=${userDAO}`}
              color="white"
              fontWeight="extrabold"
              fontSize="xl"
              mx={"2%"}
            >
              <Flex align="center" gap={1}>
                <SettingsIcon boxSize={4} />
                Settings
              </Flex>
            </Link>
          )}
          {mounted && (isPasskeyUser || isAuthenticated) ? (
            <LoginButton />
          ) : (
            <Button
              as={NextLink}
              href={`/user/?userDAO=${userDAO}`}
              bgGradient="linear(to-r, green.400, teal.400)"
              color="white"
              borderRadius="full"
              size="md"
              px={6}
              fontWeight="600"
              fontSize="md"
              _hover={{ bgGradient: 'linear(to-r, green.500, teal.500)', transform: 'translateY(-1px)', boxShadow: 'lg' }}
              _active={{ bgGradient: 'linear(to-r, green.600, teal.600)', transform: 'translateY(0)' }}
            >
              Join or Sign In
            </Button>
          )}
        </Flex>

        {/* Mobile Hamburger Button */}
        <IconButton
          aria-label="Open menu"
          icon={<HamburgerIcon boxSize={6} />}
          size="lg"
          color="white"
          variant="ghost"
          display={{ base: 'flex', md: 'none' }}
          onClick={onOpen}
          zIndex={20}
          position="relative"
          p={3}
          mx={1}
          _hover={{ bg: "whiteAlpha.300" }}
          _active={{ bg: "whiteAlpha.400" }}
          border="none"
          cursor="pointer"
        />
      </Flex>

      {/* Mobile Navigation Drawer */}
      <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="xs">
        <DrawerOverlay bg="rgba(0,0,0,0.7)" />
        <DrawerContent bg="rgba(20, 20, 25, 0.95)">
          <DrawerCloseButton color="white" />
          <DrawerHeader borderBottomWidth="1px" borderColor="rgba(255, 255, 255, 0.1)" color="white">
            <Flex align="center">
              <NextImage
                src="/images/high_res_poa.png"
                alt="PoA Logo"
                width={30}
                height={30}
                style={{ objectFit: 'contain', marginRight: '10px' }}
              />
              {userDAO}
            </Flex>
          </DrawerHeader>
          <DrawerBody p={0}>
            <VStack spacing={0} align="stretch" w="100%">
              {navItems.map((item) => (
                <Link as={NextLink} key={item.name} href={item.path} passHref>
                  <Flex 
                    p={4}
                    align="center"
                    bg={isActive(item.path) ? "rgba(101, 184, 145, 0.1)" : "transparent"}
                    borderLeft={isActive(item.path) ? "4px solid #65B891" : "4px solid transparent"}
                    transition="transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, border-color 0.2s ease"
                    _hover={{ bg: "whiteAlpha.100" }}
                    onClick={onClose}
                  >
                    <Text color="white" fontWeight={isActive(item.path) ? "bold" : "normal"}>
                      {item.name}
                    </Text>
                  </Flex>
                </Link>
              ))}
            </VStack>
            
            <Box p={6} mt={4}>
              {mounted && (isPasskeyUser || isAuthenticated) ? (
                <VStack spacing={3}>
                  <LoginButton />
                </VStack>
              ) : (
                <VStack spacing={4}>
                  <Button
                    as={NextLink}
                    href={`/user/?userDAO=${userDAO}`}
                    onClick={onClose}
                    w="100%"
                    bgGradient="linear(to-r, green.400, teal.400)"
                    color="white"
                    borderRadius="full"
                    size="lg"
                    fontWeight="600"
                    _hover={{ bgGradient: 'linear(to-r, green.500, teal.500)' }}
                    _active={{ bgGradient: 'linear(to-r, green.600, teal.600)' }}
                  >
                    Join or Sign In
                  </Button>
                </VStack>
              )}
              <Text fontSize="xs" color="whiteAlpha.600" mt={6} textAlign="center">
                Powered by PoA • {new Date().getFullYear()}
              </Text>
            </Box>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

    </Box>
  );
};

export default Navbar;
