import React from 'react';
import { Box, Container, Heading, Text, SimpleGrid, VStack, HStack, Icon } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { HiGlobeAlt, HiUserGroup, HiCube, HiLink } from 'react-icons/hi';

const MotionBox = motion(Box);

const StatPill = ({ icon, value, label }) => (
  <VStack spacing={1} px={6} py={4} bg="rgba(255,255,255,0.08)" borderRadius="xl" minW="120px">
    <Icon as={icon} boxSize={5} color="amethyst.200" />
    <Text fontSize="2xl" fontWeight="bold" color="white">{value}</Text>
    <Text fontSize="xs" color="whiteAlpha.700" textTransform="uppercase" letterSpacing="0.05em">{label}</Text>
  </VStack>
);

const HeroSection = ({ aggregated, isLoading }) => (
  <Box
    bg="linear-gradient(135deg, #1a1030 0%, #0d0d1a 50%, #1a0d2e 100%)"
    pt={{ base: 24, md: 32 }}
    pb={{ base: 16, md: 20 }}
    position="relative"
    overflow="hidden"
  >
    {/* Gradient orbs */}
    <Box position="absolute" top="-100px" right="-100px" w="400px" h="400px" borderRadius="full" bg="radial-gradient(circle, rgba(144,85,232,0.15), transparent 70%)" />
    <Box position="absolute" bottom="-50px" left="-50px" w="300px" h="300px" borderRadius="full" bg="radial-gradient(circle, rgba(232,93,133,0.1), transparent 70%)" />

    <Container maxW="6xl" position="relative">
      <MotionBox
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        textAlign="center"
      >
        <Text fontSize="sm" fontWeight="600" color="amethyst.300" letterSpacing="0.1em" textTransform="uppercase" mb={3}>
          Protocol Dashboard
        </Text>
        <Heading fontSize={{ base: '3xl', md: '5xl' }} fontWeight="800" color="white" mb={4} letterSpacing="-0.02em">
          POA Protocol
        </Heading>
        <Text fontSize={{ base: 'md', md: 'lg' }} color="whiteAlpha.700" maxW="600px" mx="auto" mb={10}>
          Real-time transparency into the worker and community-owned infrastructure powering decentralized organizations.
        </Text>

        <HStack spacing={4} justify="center" flexWrap="wrap">
          <StatPill icon={HiUserGroup} value={isLoading ? '...' : aggregated.totalOrgs} label="Organizations" />
          <StatPill icon={HiGlobeAlt} value={isLoading ? '...' : aggregated.totalAccounts} label="Accounts" />
          <StatPill icon={HiLink} value={isLoading ? '...' : aggregated.chainsActive} label="Chains" />
          <StatPill icon={HiCube} value={isLoading ? '...' : aggregated.totalBeacons} label="Beacon Types" />
        </HStack>
      </MotionBox>
    </Container>
  </Box>
);

export default HeroSection;
