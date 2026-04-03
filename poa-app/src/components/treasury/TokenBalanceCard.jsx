import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Skeleton,
  Tooltip,
  Image,
  Link,
} from '@chakra-ui/react';
import { ExternalLinkIcon } from '@chakra-ui/icons';
import { formatTokenAmount } from '@/util/formatToken';

const TokenBalanceCard = ({
  symbol,
  name,
  balance,
  decimals = 18,
  isLoading = false,
  tokenType = 'Token',
  isClickable = false,
  onClick,
  logo = null,
  projectUrl = null,
}) => {
  // PT (Governance) displays as whole numbers; ERC-20 tokens need decimal precision
  const displayDecimals = tokenType === 'Governance' ? 0 : (decimals <= 6 ? 2 : 4);
  const formattedBalance = formatTokenAmount(balance || '0', decimals, displayDecimals);

  // Token icon colors - check for Participation Token or PT
  const iconColors = {
    'Participation Token': 'purple.400',
    PT: 'purple.400',
    ETH: 'blue.400',
    USDC: 'green.400',
    DAI: 'yellow.400',
    xDAI: 'yellow.400',
    WXDAI: 'yellow.400',
    BREAD: 'orange.400',
  };

  const iconColor = iconColors[symbol] || 'gray.400';

  // Display shorter version for icon and card
  const iconLetter = symbol === 'Participation Token' ? 'P' : symbol.charAt(0);
  const displaySymbol = symbol === 'Participation Token' ? 'PT' : symbol;

  return (
    <Box
      p={4}
      bg="rgba(0, 0, 0, 0.4)"
      borderRadius="xl"
      border="1px solid"
      borderColor="rgba(148, 115, 220, 0.2)"
      transition="transform 0.3s ease, box-shadow 0.3s ease, background 0.3s ease, border-color 0.3s ease"
      cursor={isClickable ? 'pointer' : 'default'}
      onClick={isClickable ? onClick : undefined}
      _hover={{
        borderColor: 'rgba(148, 115, 220, 0.5)',
        transform: isClickable ? 'translateY(-4px) scale(1.02)' : 'translateY(-2px)',
        boxShadow: isClickable ? '0 8px 20px rgba(148, 115, 220, 0.25)' : undefined,
      }}
    >
      <VStack align="flex-start" spacing={2}>
        <HStack justify="space-between" w="100%">
          <HStack spacing={2}>
            {logo ? (
              <Image
                src={logo}
                alt={displaySymbol}
                boxSize="32px"
                borderRadius="full"
                objectFit="cover"
                fallback={
                  <Box
                    w="32px"
                    h="32px"
                    borderRadius="full"
                    bg={iconColor}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Text fontWeight="bold" fontSize="sm" color="white">
                      {iconLetter}
                    </Text>
                  </Box>
                }
              />
            ) : (
              <Box
                w="32px"
                h="32px"
                borderRadius="full"
                bg={iconColor}
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                <Text fontWeight="bold" fontSize="sm" color="white">
                  {iconLetter}
                </Text>
              </Box>
            )}
            <Text fontWeight="bold" fontSize="md">
              {displaySymbol}
            </Text>
          </HStack>
          <Badge
            colorScheme={tokenType === 'Governance' ? 'purple' : 'blue'}
            fontSize="xs"
          >
            {tokenType}
          </Badge>
        </HStack>

        {isLoading ? (
          <Skeleton height="32px" width="100px" />
        ) : (
          <Tooltip
            label={isClickable ? 'Click for detailed stats' : `${name}: ${formattedBalance} ${displaySymbol}`}
            placement="top"
          >
            <Text fontSize="2xl" fontWeight="bold" color="white">
              {formattedBalance}
            </Text>
          </Tooltip>
        )}

        <Text fontSize="xs" color="gray.500">
          {name}
        </Text>
        {projectUrl && (
          <Link
            href={projectUrl}
            isExternal
            fontSize="xs"
            color="orange.400"
            _hover={{ color: 'orange.300', textDecoration: 'underline' }}
            onClick={(e) => e.stopPropagation()}
          >
            {new URL(projectUrl).hostname} <ExternalLinkIcon mx="2px" boxSize={3} />
          </Link>
        )}
      </VStack>
    </Box>
  );
};

export default TokenBalanceCard;
