/**
 * OrgOverviewCard - Displays organization metadata and overview
 */

import React from 'react';
import {
  Box,
  Flex,
  VStack,
  HStack,
  Text,
  Heading,
  Image,
  Badge,
  Link,
  Icon,
  Skeleton,
  SkeletonCircle,
} from '@chakra-ui/react';
import { FiExternalLink, FiCalendar, FiUsers } from 'react-icons/fi';

export function OrgOverviewCard({
  name,
  description,
  links = [],
  logo,
  deployedAt,
  totalMembers,
  loading = false,
}) {
  const formattedDate = deployedAt
    ? new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(deployedAt)
    : null;

  if (loading) {
    return (
      <Box
        bg="rgba(255, 255, 255, 0.8)"
        border="1px solid"
        borderColor="warmGray.200"
        borderRadius="2xl"
        p={{ base: 4, md: 6 }}
        boxShadow="0 4px 24px rgba(0, 0, 0, 0.06)"
      >
        <Flex direction={{ base: 'column', md: 'row' }} gap={6}>
          <SkeletonCircle size="100px" />
          <VStack align="flex-start" flex={1} spacing={3}>
            <Skeleton height="32px" width="200px" />
            <Skeleton height="20px" width="100%" />
            <Skeleton height="20px" width="80%" />
          </VStack>
        </Flex>
      </Box>
    );
  }

  return (
    <Box
      bg="rgba(255, 255, 255, 0.8)"
      border="1px solid"
      borderColor="warmGray.200"
      borderRadius="2xl"
      p={{ base: 4, md: 6 }}
      boxShadow="0 4px 24px rgba(0, 0, 0, 0.06)"
    >
      <Flex direction={{ base: 'column', md: 'row' }} gap={6} align="flex-start">
        {/* Logo */}
        <Box flexShrink={0}>
          {logo ? (
            <Image
              src={logo}
              alt={`${name} logo`}
              boxSize={{ base: '80px', md: '100px' }}
              borderRadius="xl"
              objectFit="cover"
              border="2px solid"
              borderColor="amethyst.200"
            />
          ) : (
            <Box
              boxSize={{ base: '80px', md: '100px' }}
              borderRadius="xl"
              bg="amethyst.50"
              display="flex"
              alignItems="center"
              justifyContent="center"
              border="2px solid"
              borderColor="amethyst.200"
            >
              <Text fontSize="3xl" fontWeight="bold" color="amethyst.500">
                {name?.charAt(0)?.toUpperCase() || 'O'}
              </Text>
            </Box>
          )}
        </Box>

        {/* Content */}
        <VStack align="flex-start" flex={1} spacing={4}>
          {/* Name */}
          <Heading size="lg" color="warmGray.900">
            {name || 'Organization'}
          </Heading>

          {/* Description */}
          {description && (
            <Text color="warmGray.600" lineHeight="tall">
              {description}
            </Text>
          )}

          {/* Stats badges */}
          <HStack spacing={4} flexWrap="wrap">
            {totalMembers !== undefined && (
              <Badge
                bg="amethyst.100"
                color="amethyst.700"
                px={3}
                py={1}
                borderRadius="full"
                display="flex"
                alignItems="center"
                gap={2}
              >
                <Icon as={FiUsers} />
                {totalMembers} {totalMembers === 1 ? 'Member' : 'Members'}
              </Badge>
            )}

            {formattedDate && (
              <Badge
                bg="warmGray.100"
                color="warmGray.700"
                px={3}
                py={1}
                borderRadius="full"
                display="flex"
                alignItems="center"
                gap={2}
              >
                <Icon as={FiCalendar} />
                Deployed {formattedDate}
              </Badge>
            )}
          </HStack>

          {/* Links */}
          {links.length > 0 && (
            <HStack spacing={4} flexWrap="wrap" pt={2}>
              {links.map((link, index) => (
                <Link
                  key={index}
                  href={link.url}
                  isExternal
                  color="amethyst.500"
                  fontSize="sm"
                  display="flex"
                  alignItems="center"
                  gap={1}
                  _hover={{ color: 'amethyst.600', textDecoration: 'underline' }}
                >
                  {link.name || link.url}
                  <Icon as={FiExternalLink} boxSize={3} />
                </Link>
              ))}
            </HStack>
          )}
        </VStack>
      </Flex>
    </Box>
  );
}

export default OrgOverviewCard;
