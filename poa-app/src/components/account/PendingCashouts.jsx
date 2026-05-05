/**
 * PendingCashouts
 * Lists the user's outstanding (unfilled) cashout deposits on peer.xyz EscrowV2
 * (Base) and offers a one-click withdraw back to USDC. Hides itself entirely
 * when there are no outstanding deposits.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Card,
  CardBody,
  VStack,
  HStack,
  Text,
  Heading,
  Button,
  Badge,
  Tooltip,
  useToast,
} from '@chakra-ui/react';
import { useConfig, useSwitchChain } from 'wagmi';
import { getConnectorClient } from 'wagmi/actions';
import { useAuth } from '@/context/AuthContext';
import { clientToSigner } from '@/components/ProviderConverter';
import { formatTokenAmount } from '@/util/formatToken';
import {
  BASE_CHAIN_ID,
  buildWithdrawDeposit,
  fetchOutstandingDeposits,
} from '@/services/web3/domain/CashOutService';

const POLL_INTERVAL_MS = 30_000;
const USDC_DECIMALS = 6;

function PendingCashouts({ accountAddress, cardStyle, textColor, subtextColor, onWithdrawSuccess }) {
  const { isPasskeyUser } = useAuth();
  const { switchChainAsync } = useSwitchChain();
  const wagmiConfig = useConfig();
  const toast = useToast();

  const [deposits, setDeposits] = useState([]);
  const [withdrawingId, setWithdrawingId] = useState(null);

  const refresh = useCallback(async () => {
    if (!accountAddress) {
      setDeposits([]);
      return;
    }
    try {
      const rows = await fetchOutstandingDeposits(accountAddress);
      setDeposits(rows);
    } catch (err) {
      console.error('[PendingCashouts] fetch error', err);
    }
  }, [accountAddress]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    const onVis = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') refresh();
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
    };
  }, [refresh]);

  const handleWithdraw = useCallback(async (depositId) => {
    if (isPasskeyUser) return;
    const idStr = depositId.toString();
    try {
      setWithdrawingId(idStr);
      await switchChainAsync({ chainId: BASE_CHAIN_ID });
      const connectorClient = await getConnectorClient(wagmiConfig, { chainId: BASE_CHAIN_ID });
      const signer = clientToSigner(connectorClient);
      if (!signer) throw new Error('Wallet not ready — reconnect and try again.');

      const tx = buildWithdrawDeposit(depositId);
      const sent = await signer.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: tx.value,
      });
      toast({
        title: 'Withdraw submitted',
        description: 'Waiting for confirmation on Base…',
        status: 'info',
        duration: 5000,
      });
      await sent.wait();
      toast({
        title: 'Withdraw confirmed',
        description: 'Your USDC has been returned to your wallet on Base.',
        status: 'success',
        duration: 6000,
      });
      onWithdrawSuccess?.();
      await refresh();
    } catch (err) {
      console.error('[PendingCashouts] withdraw error', err);
      toast({
        title: 'Withdraw failed',
        description: formatWithdrawError(err),
        status: 'error',
        duration: 6000,
      });
    } finally {
      setWithdrawingId(null);
    }
  }, [isPasskeyUser, switchChainAsync, wagmiConfig, toast, onWithdrawSuccess, refresh]);

  if (deposits.length === 0) return null;

  return (
    <Card borderRadius="2xl" boxShadow="2xl" style={cardStyle}>
      <CardBody p={[4, 6, 8]}>
        <VStack spacing={4} align="stretch">
          <VStack align="start" spacing={1}>
            <Heading size="md" color={textColor}>
              Pending Cashouts
            </Heading>
            <Text color={subtextColor} fontSize="sm">
              Cashouts that haven&apos;t been filled by a peer yet. You can withdraw the USDC back
              to your wallet on Base any time.
            </Text>
          </VStack>

          <VStack spacing={3} align="stretch">
            {deposits.map((d) => (
              <PendingCashoutRow
                key={d.depositId.toString()}
                deposit={d}
                isPasskeyUser={isPasskeyUser}
                isWithdrawing={withdrawingId === d.depositId.toString()}
                onWithdraw={() => handleWithdraw(d.depositId)}
                textColor={textColor}
                subtextColor={subtextColor}
              />
            ))}
          </VStack>
        </VStack>
      </CardBody>
    </Card>
  );
}

function PendingCashoutRow({
  deposit,
  isPasskeyUser,
  isWithdrawing,
  onWithdraw,
  textColor,
  subtextColor,
}) {
  const amountStr = formatTokenAmount(deposit.remainingAmount, USDC_DECIMALS, 2);
  const platformLabel = deposit.platform || 'P2P seller listing';
  const ageText = formatAge(deposit.createdAtSec);
  const hasOutstandingIntent = deposit.outstandingIntentAmount > 0n;

  return (
    <HStack
      p={3}
      borderRadius="lg"
      bg="whiteAlpha.50"
      border="1px solid"
      borderColor="whiteAlpha.100"
      justify="space-between"
      align="center"
      flexWrap="wrap"
      gap={3}
    >
      <VStack align="start" spacing={1} flex={1} minW={0}>
        <HStack spacing={2}>
          <Text color={textColor} fontWeight="bold" fontSize="sm">
            ${amountStr} USDC → {platformLabel}
          </Text>
          <Badge colorScheme="blue" fontSize="2xs" borderRadius="full">Base</Badge>
        </HStack>
        <Text color={subtextColor} fontSize="xs">
          {ageText} · deposit #{deposit.depositId.toString()}
          {hasOutstandingIntent ? ' · taker intent active' : ' · not yet filled'}
        </Text>
      </VStack>

      {isPasskeyUser ? (
        <Tooltip
          label="Passkey withdraw is coming soon — connect from the wallet that owns this deposit to withdraw."
          hasArrow
        >
          <Button size="sm" variant="outline" colorScheme="gray" isDisabled>
            Withdraw unavailable
          </Button>
        </Tooltip>
      ) : (
        <Button
          size="sm"
          colorScheme="green"
          variant="outline"
          isLoading={isWithdrawing}
          loadingText="Withdrawing"
          onClick={onWithdraw}
        >
          Withdraw to USDC
        </Button>
      )}
    </HStack>
  );
}

function formatAge(createdAtSec) {
  if (!createdAtSec) return 'Listed recently';
  const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - createdAtSec);
  if (elapsed < 60) return 'Listed seconds ago';
  if (elapsed < 3600) {
    const m = Math.max(1, Math.round(elapsed / 60));
    return `Listed ${m} min ago`;
  }
  if (elapsed < 86400) {
    const h = Math.max(1, Math.round(elapsed / 3600));
    return `Listed ${h} hour${h === 1 ? '' : 's'} ago`;
  }
  const d = Math.max(1, Math.round(elapsed / 86400));
  return `Listed ${d} day${d === 1 ? '' : 's'} ago`;
}

function formatWithdrawError(err) {
  if (!err) return 'Withdraw failed';
  const code = err.code;
  const reason = (err.reason || err.shortMessage || err.message || '').toLowerCase();
  if (code === 4001 || code === 'ACTION_REJECTED' || reason.includes('user rejected')) {
    return 'You rejected the transaction in your wallet.';
  }
  if (reason.includes('insufficient funds')) {
    return 'Not enough ETH on Base to pay gas.';
  }
  if (reason.includes('chain') && reason.includes('mismatch')) {
    return 'Wrong network. Switch to Base and try again.';
  }
  return err.shortMessage || err.message || 'Withdraw failed';
}

export default PendingCashouts;
