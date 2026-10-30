/**
 * TokenBalances
 * Displays non-zero ERC20 balances across all chains with Send buttons.
 */

import React from 'react';
import {
  Card,
  CardBody,
  VStack,
  HStack,
  Text,
  Heading,
  Button,
  Badge,
  Image,
  Icon,
  Skeleton,
} from '@chakra-ui/react';
import { PiCoinVerticalBold } from 'react-icons/pi';
import { formatTokenAmount } from '@/util/formatToken';
import { assetActionsAvailable, knownRawAmount } from '@/services/web3/domain/accountFinancialEvidence';

function TokenBalances({ balances = [], nativeBalances = {}, errors = [], coverage, isLoading, onRetry, onSend, onCashOut, cardStyle, textColor, subtextColor }) {
  const incomplete = coverage !== 'complete' || errors.length > 0;
  return (
    <Card borderRadius="2xl" boxShadow="2xl" style={cardStyle}>
      <CardBody p={[4, 6, 8]}>
        <VStack spacing={4} align="stretch">
          <Heading size="md" color={textColor}>
            Balances
          </Heading>

          {isLoading ? (
            <VStack spacing={3}>
              <Skeleton height="50px" width="100%" borderRadius="lg" />
              <Skeleton height="50px" width="100%" borderRadius="lg" />
            </VStack>
          ) : balances.length === 0 && !incomplete ? (
            <Text color={subtextColor} textAlign="center" py={4} fontSize="sm">
              No balances found across networks.
            </Text>
          ) : (
            <VStack spacing={3} align="stretch">
              {incomplete && <HStack>
                <Text role="status" color={subtextColor} fontSize="sm">Some balances are unavailable. Refresh before continuing.</Text>
                {onRetry && <Button size="sm" onClick={onRetry}>Refresh balances</Button>}
              </HStack>}
              {balances.map((token) => {
                const canAct = assetActionsAvailable({ token, nativeBalance: nativeBalances[token.chainId], errors, coverage });
                const hasBalance = knownRawAmount(token.balance) !== null;
                return (
                <HStack
                  key={`${token.chainId}-${token.address}`}
                  p={3}
                  borderRadius="lg"
                  bg="whiteAlpha.50"
                  border="1px solid"
                  borderColor="whiteAlpha.100"
                  justify="space-between"
                  align="center"
                >
                  <HStack spacing={3} flex={1} minW={0}>
                    {token.logo ? (
                      <Image
                        src={token.logo}
                        alt={token.symbol}
                        boxSize="32px"
                        borderRadius="full"
                        fallback={<Icon as={PiCoinVerticalBold} boxSize={6} color="yellow.400" />}
                      />
                    ) : (
                      <Icon as={PiCoinVerticalBold} boxSize={6} color="yellow.400" />
                    )}

                    <VStack align="start" spacing={0} minW={0}>
                      <HStack spacing={2}>
                        <Text color={textColor} fontWeight="bold" fontSize="sm">
                          {token.symbol}
                        </Text>
                        <Badge
                          colorScheme={token.chainId === 42161 ? 'blue' : 'green'}
                          fontSize="2xs"
                          borderRadius="full"
                        >
                          {token.chainName}
                        </Badge>
                      </HStack>
                      <Text color={subtextColor} fontSize="xs">
                        {token.name}
                      </Text>
                    </VStack>
                  </HStack>

                  <HStack spacing={3}>
                    <Text color={textColor} fontWeight="medium" fontSize="sm" whiteSpace="nowrap">
                      {hasBalance ? formatTokenAmount(token.balance, token.decimals, token.decimals <= 6 ? 2 : 4) : 'Unavailable'}
                    </Text>
                    <Button
                      size="xs"
                      colorScheme="purple"
                      variant="outline"
                      isDisabled={!canAct}
                      onClick={() => { if (canAct) onSend(token); }}
                    >
                      Send
                    </Button>
                    {onCashOut && token.symbol === 'USDC' && token.chainId === 42161 && (
                      <Button
                        size="xs"
                        colorScheme="green"
                        variant="outline"
                        isDisabled={!canAct}
                        onClick={() => { if (canAct) onCashOut(token); }}
                      >
                        Cash Out
                      </Button>
                    )}
                  </HStack>
                  {knownRawAmount(nativeBalances[token.chainId]) === null && <Text fontSize="xs" color={subtextColor}>Network fee balance unavailable</Text>}
                </HStack>
                );
              })}
            </VStack>
          )}
        </VStack>
      </CardBody>
    </Card>
  );
}

export default TokenBalances;
