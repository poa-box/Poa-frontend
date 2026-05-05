/**
 * PendingCashouts
 * Lists the user's recoverable cashouts on Base — two row kinds:
 *   - 'unfilled': ZKP2P deposit on EscrowV2 with no taker yet → withdrawDeposit
 *   - 'failed':   USDC stuck in CashOutRelay (executeData reverted) → recoverFailed
 * Data comes from the peer-cashoutrelay-base subgraph (see CashOutService.fetchOutstandingDeposits).
 * Hides itself entirely when the user has nothing to recover.
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
  buildRecoverFailed,
  buildWithdrawDeposit,
  fetchOutstandingDeposits,
} from '@/services/web3/domain/CashOutService';

const POLL_INTERVAL_MS = 30_000;
const USDC_DECIMALS = 6;

// Stable per-row id used for both React keys and "in-flight" tracking. Spans
// both row kinds so two rows can be processed independently.
function rowKey(row) {
  return row.kind === 'unfilled'
    ? `unfilled:${row.depositId.toString()}`
    : `failed:${row.requestHash}`;
}

function PendingCashouts({ accountAddress, cardStyle, textColor, subtextColor, onWithdrawSuccess }) {
  const { isPasskeyUser } = useAuth();
  const { switchChainAsync } = useSwitchChain();
  const wagmiConfig = useConfig();
  const toast = useToast();

  const [rows, setRows] = useState([]);
  const [actingKey, setActingKey] = useState(null);

  const refresh = useCallback(async () => {
    if (!accountAddress) {
      setRows([]);
      return;
    }
    try {
      const next = await fetchOutstandingDeposits(accountAddress);
      setRows(next);
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

  const handleAction = useCallback(async (row) => {
    if (isPasskeyUser) return;
    const key = rowKey(row);
    const tx = row.kind === 'unfilled'
      ? buildWithdrawDeposit(row.depositId)
      : buildRecoverFailed(row.requestHash);
    const labels = ACTION_LABELS[row.kind];

    try {
      setActingKey(key);
      await switchChainAsync({ chainId: BASE_CHAIN_ID });
      const connectorClient = await getConnectorClient(wagmiConfig, { chainId: BASE_CHAIN_ID });
      const signer = clientToSigner(connectorClient);
      if (!signer) throw new Error('Wallet not ready — reconnect and try again.');

      const sent = await signer.sendTransaction({ to: tx.to, data: tx.data, value: tx.value });
      toast({
        title: labels.submitted,
        description: 'Waiting for confirmation on Base…',
        status: 'info',
        duration: 5000,
      });
      await sent.wait();
      toast({
        title: labels.confirmed,
        description: 'Your USDC has been returned to your wallet on Base.',
        status: 'success',
        duration: 6000,
      });
      onWithdrawSuccess?.();
      await refresh();
    } catch (err) {
      console.error('[PendingCashouts] action error', err);
      toast({
        title: labels.failed,
        description: formatActionError(err),
        status: 'error',
        duration: 6000,
      });
    } finally {
      setActingKey(null);
    }
  }, [isPasskeyUser, switchChainAsync, wagmiConfig, toast, onWithdrawSuccess, refresh]);

  if (rows.length === 0) return null;

  return (
    <Card borderRadius="2xl" boxShadow="2xl" style={cardStyle}>
      <CardBody p={[4, 6, 8]}>
        <VStack spacing={4} align="stretch">
          <VStack align="start" spacing={1}>
            <Heading size="md" color={textColor}>
              Pending Cashouts
            </Heading>
            <Text color={subtextColor} fontSize="sm">
              Cashouts that haven&apos;t completed yet. You can pull the USDC back to your
              wallet on Base any time.
            </Text>
          </VStack>

          <VStack spacing={3} align="stretch">
            {rows.map((row) => {
              const key = rowKey(row);
              return (
                <PendingCashoutRow
                  key={key}
                  row={row}
                  isPasskeyUser={isPasskeyUser}
                  isActing={actingKey === key}
                  onAct={() => handleAction(row)}
                  textColor={textColor}
                  subtextColor={subtextColor}
                />
              );
            })}
          </VStack>
        </VStack>
      </CardBody>
    </Card>
  );
}

const ACTION_LABELS = {
  unfilled: {
    button: 'Withdraw to USDC',
    loading: 'Withdrawing',
    submitted: 'Withdraw submitted',
    confirmed: 'Withdraw confirmed',
    failed: 'Withdraw failed',
  },
  failed: {
    button: 'Recover USDC',
    loading: 'Recovering',
    submitted: 'Recovery submitted',
    confirmed: 'Recovery confirmed',
    failed: 'Recovery failed',
  },
};

function PendingCashoutRow({ row, isPasskeyUser, isActing, onAct, textColor, subtextColor }) {
  const labels = ACTION_LABELS[row.kind];
  const platformLabel = row.platform || 'P2P seller listing';
  const ageText = formatAge(row.createdAtSec);

  // Title differs by kind (the user is in a different mental model in each case).
  // Subtitle keeps depositId/requestHash visible so support can match on-chain state.
  let title;
  let subtitle;
  if (row.kind === 'unfilled') {
    const amountStr = formatTokenAmount(row.remainingAmount, USDC_DECIMALS, 2);
    const fillState = row.outstandingIntentAmount > 0n ? 'taker intent active' : 'not yet filled';
    title = `$${amountStr} USDC → ${platformLabel}`;
    subtitle = `${ageText} · deposit #${row.depositId.toString()} · ${fillState}`;
  } else {
    const amountStr = formatTokenAmount(row.amount, USDC_DECIMALS, 2);
    title = `$${amountStr} USDC stuck in relay`;
    subtitle = `${ageText} · request ${shortHash(row.requestHash)} · on-chain deposit step reverted, USDC held in the relay`;
  }

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
            {title}
          </Text>
          <Badge colorScheme="blue" fontSize="2xs" borderRadius="full">Base</Badge>
          {row.kind === 'failed' && (
            <Badge colorScheme="orange" fontSize="2xs" borderRadius="full">Failed</Badge>
          )}
        </HStack>
        <Text color={subtextColor} fontSize="xs">
          {subtitle}
        </Text>
      </VStack>

      {isPasskeyUser ? (
        <Tooltip
          label="Passkey recovery is coming soon — connect from the wallet that owns this cashout to recover."
          hasArrow
        >
          <Button size="sm" variant="outline" colorScheme="gray" isDisabled>
            Recover unavailable
          </Button>
        </Tooltip>
      ) : (
        <Button
          size="sm"
          colorScheme={row.kind === 'failed' ? 'orange' : 'green'}
          variant="outline"
          isLoading={isActing}
          loadingText={labels.loading}
          onClick={onAct}
        >
          {labels.button}
        </Button>
      )}
    </HStack>
  );
}

function shortHash(hash) {
  if (!hash || typeof hash !== 'string') return '—';
  return hash.length > 12 ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : hash;
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

function formatActionError(err) {
  if (!err) return 'Action failed';
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
  return err.shortMessage || err.message || 'Action failed';
}

export default PendingCashouts;
