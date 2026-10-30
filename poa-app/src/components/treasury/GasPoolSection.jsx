import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Link,
  Icon,
  Spinner,
} from '@chakra-ui/react';
import { FiPlus, FiExternalLink, FiAlertTriangle } from 'react-icons/fi';
import { formatTokenAmount } from '@/util/formatToken';
import { getNetworkByChainId } from '@/config/networks';
import { createPublicClientForChain } from '@/services/web3/utils/publicChainClient';
import { RefreshEvent, useRefreshSubscription } from '@/context/RefreshContext';
import { requireRawUint } from '@poa-box/core/amounts';
import { usePOContext } from '@/context/POContext';
import { ACCENT, INK, TABULAR, SectionHeader, UnitSpan, useMountedValue, FILL_TRANSITION } from './treasuryStyles';


/**
 * GasPoolSection — the compact "Network fees" card.
 *
 * One balance, one meter (how much of the lifetime pool remains), one plain
 * sentence. The balance wears ink — status is carried by the explicit
 * "Needs a top-up" badge (icon + label), never by coloring the number.
 * Per-event history lives in the activity feed under the Fees filter.
 */
const GasPoolSection = ({ gasPoolData, isLoading, onDeposit, paymasterHubAddress }) => {
  const { orgId, orgChainId } = usePOContext();
  const network = getNetworkByChainId(orgChainId);
  const nativeSymbol = network?.nativeCurrency?.symbol || 'ETH';
  // On chains whose native coin is a USD stablecoin (xDAI), lead with dollars —
  // the one honest translation available; volatile natives stay in native units.
  const nativeIsUsd = !!network?.nativeCurrency?.usdPegged;
  const explorer = network?.blockExplorer;

  const config = gasPoolData?.paymasterOrgConfigs?.[0];
  const stats = config?.stats;

  const [financials, setFinancials] = useState({ scope: null, data: null, loading: false });
  const scope = [orgId, orgChainId, paymasterHubAddress].join(':');
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (!orgId || !orgChainId || !paymasterHubAddress || !network?.rpcUrl) return;
    const current = () => scopeRef.current === scope && generation.current === request;
    setFinancials({ scope, data: null, loading: true });
    try {
      const { readOrgFeeFund } = await import('@/services/web3/domain/TreasuryService');
      const data = await readOrgFeeFund(createPublicClientForChain(orgChainId), { orgId, chainId: orgChainId,
        hubAddress: paymasterHubAddress, endpoint: network.rpcUrl });
      if (current()) setFinancials({ scope, data, loading: false });
    } catch { if (current()) setFinancials({ scope, data: null, loading: false }); }
  }, [orgId, orgChainId, paymasterHubAddress, network?.rpcUrl, scope]);
  useEffect(() => { const sequence = generation; refresh(); return () => { sequence.current++; }; }, [refresh]);
  useRefreshSubscription(RefreshEvent.TREASURY_DEPOSITED, refresh, [refresh]);
  const current = financials.scope === scope ? financials.data : null;
  const accurateBalance = current?.available ?? null;
  let totalUserOps = null;
  try { totalUserOps = requireRawUint(stats?.totalUserOps); } catch { /* indexed count unknown */ }
  const isLow = accurateBalance !== null && BigInt(accurateBalance) < 10n ** 16n;
  const lifetimePool = current ? BigInt(current.deposited) : 0n;
  const remainingPct = current && lifetimePool > 0n ? Math.min(Number(BigInt(current.available) * 1000n / lifetimePool) / 10, 100) : 0;
  const shownMeterPct = useMountedValue(remainingPct);

  if (isLoading || financials.loading) {
    return (
      <HStack py={4} spacing={3}>
        <Spinner size="sm" color="purple.400" />
        <Text color={INK.muted} fontSize="sm">Loading fee fund…</Text>
      </HStack>
    );
  }

  if (current && !current.registered) {
    return (
      <VStack py={2} spacing={3} align="stretch">
        <SectionHeader accent={ACCENT.gas} mb={0}>Network fees</SectionHeader>
        <Text fontSize="sm" color={INK.muted}>
          Fee sponsorship isn&apos;t set up yet.
        </Text>
      </VStack>
    );
  }

  const onChainHref = explorer && paymasterHubAddress
    ? `${explorer}/address/${paymasterHubAddress}`
    : null;

  return (
    <VStack align="stretch" spacing={4}>
      <SectionHeader accent={ACCENT.gas} mb={0}>Network fees</SectionHeader>

      <HStack justify="space-between" align="flex-start">
        <Box>
          <Text
            fontSize={{ base: '2xl', md: '3xl' }}
            fontWeight="bold"
            lineHeight="1"
            letterSpacing="-0.02em"
            color={INK.primary}
          >
            {accurateBalance === null ? 'Unavailable' : <>{nativeIsUsd ? '≈ $' : ''}{formatTokenAmount(accurateBalance, 18, 2)}
            {!nativeIsUsd && <UnitSpan>{nativeSymbol}</UnitSpan>}</>}
          </Text>
          {nativeIsUsd && accurateBalance !== null && (
            <Text fontSize="xs" color={INK.muted} mt={1} sx={TABULAR}>
              {formatTokenAmount(accurateBalance, 18, 2)} {nativeSymbol} (≈ $1 each)
            </Text>
          )}
        </Box>
        {isLow && (
          <HStack
            spacing={1.5}
            px={2.5}
            py={1}
            borderRadius="full"
            border={`1px solid ${ACCENT.attention}`}
            color={ACCENT.attention}
            flexShrink={0}
          >
            <Icon as={FiAlertTriangle} boxSize={3} />
            <Text fontSize="xs" fontWeight="semibold">Running low</Text>
          </HStack>
        )}
      </HStack>

      {/* Meter: what remains of everything that has funded the pool */}
      {lifetimePool > 0n && (
        <Box>
          <Box h="4px" borderRadius="full" bg="rgba(12,170,155,0.18)" overflow="hidden">
            <Box
              h="100%"
              w={`${shownMeterPct}%`}
              bg={ACCENT.gas}
              borderRadius="full"
              transition={FILL_TRANSITION}
            />
          </Box>
          <HStack justify="space-between" mt={1.5}>
            <Text fontSize="xs" color={INK.muted} sx={TABULAR}>
              {remainingPct.toFixed(0)}% remaining
            </Text>
            <Text fontSize="xs" color={INK.muted} sx={TABULAR}>
              Topped up: {nativeIsUsd
                ? `≈ $${formatTokenAmount(lifetimePool.toString(), 18, 2)}`
                : `${formatTokenAmount(lifetimePool.toString(), 18, 2)} ${nativeSymbol}`}
            </Text>
          </HStack>
        </Box>
      )}

      <Text fontSize="sm" color={INK.secondary}>
        Covers small network fees so members never pay to vote, claim, or post.{' '}
        <Text as="span" color={INK.muted} sx={TABULAR}>
          {totalUserOps === null ? 'Activity count unavailable.' : `${totalUserOps} action${totalUserOps === '1' ? '' : 's'} covered so far.`}
        </Text>
      </Text>

      <HStack spacing={3} flexWrap="wrap">
        <Button
          leftIcon={<FiPlus />}
          colorScheme="purple"
          variant="outline"
          size="sm"
          onClick={onDeposit}
        >
          Add funds for fees
        </Button>
        {onChainHref && (
          <Link href={onChainHref} isExternal fontSize="xs" color="purple.300">
            Proof <Icon as={FiExternalLink} boxSize={3} mb="1px" />
          </Link>
        )}
      </HStack>
    </VStack>
  );
};

export default GasPoolSection;
