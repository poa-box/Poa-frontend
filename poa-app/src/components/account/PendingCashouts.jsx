import { useConfig, useSwitchChain, getConnectorClient, clientToSigner } from '@/context/WalletContext';
/**
 * PendingCashouts
 * Lists the user's recoverable cashouts on Base — two row kinds:
 *   - 'unfilled': ZKP2P deposit on EscrowV2 with no taker yet → withdrawDeposit
 *   - 'failed':   USDC stuck in CashOutRelay (executeData reverted) → recoverFailed
 * Data comes from the peer-cashoutrelay-base subgraph (see CashOutService.fetchOutstandingDeposits).
 * Hides itself entirely when the user has nothing to recover.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useAuth } from '@/context/authState';
import { formatTokenAmount } from '@/util/formatToken';
import { useOrganizationWriteScope } from '@/lib/organization/useOrganizationWriteScope';
import { cashoutHistoryCoverage, cashoutRecoveryDecision, cashoutRowKey, knownRawAmount, mergeCashoutHistoryRows } from '@/services/web3/domain/accountFinancialEvidence';
import {
  BASE_CHAIN_ID,
  CASHOUT_DESCRIPTOR,
  fetchOutstandingDeposits,
} from '@/services/web3/domain/CashOutService';

const POLL_INTERVAL_MS = 30_000;
const USDC_DECIMALS = 6;
const LOADING_COVERAGE = Object.freeze({ status: 'loading' });

// Stable per-row id used for both React keys and "in-flight" tracking. Spans
// both row kinds so two rows can be processed independently.
const rowKey = cashoutRowKey;

function PendingCashouts({ accountAddress, cardStyle, textColor, subtextColor, onWithdrawSuccess }) {
  const { isPasskeyUser, accountAddress: resolvedAccount, isSessionCurrent, isAuthHydrated, sessionGeneration } = useAuth();
  const busyRef = useRef(false);
  const refreshGeneration = useRef(0);
  const captureScope = useOrganizationWriteScope({ chainId: BASE_CHAIN_ID, account: accountAddress,
    orgId: [resolvedAccount, isPasskeyUser, isAuthHydrated, sessionGeneration].join(':') });
  const readScopeKey = [accountAddress, resolvedAccount, isPasskeyUser, isAuthHydrated, sessionGeneration].join(':');
  const readScopeRef = useRef(readScopeKey);
  readScopeRef.current = readScopeKey;
  const { switchChainAsync } = useSwitchChain();
  const wagmiConfig = useConfig();
  const toast = useToast();

  const [listed, setListed] = useState({ account: null, rows: [], coverage: { status: 'loading' } });
  const rows = listed.scope === readScopeKey ? listed.rows : [];
  const coverage = listed.scope === readScopeKey ? listed.coverage : LOADING_COVERAGE;
  const setRows = useCallback((rows, coverage = cashoutHistoryCoverage(rows)) => setListed({ account: accountAddress, scope: readScopeKey, rows, coverage }), [accountAddress, readScopeKey]);
  const [actingKey, setActingKey] = useState(null);
  const canTransact = isAuthHydrated !== false && !!accountAddress && resolvedAccount?.toLowerCase() === accountAddress.toLowerCase()
    && !isPasskeyUser && (!isSessionCurrent || isSessionCurrent());
  const recoveryDecision = row => cashoutRecoveryDecision({ row, descriptor: CASHOUT_DESCRIPTOR, accountAddress,
    chainId: BASE_CHAIN_ID, canTransact, isPasskeyUser, coverage });

  const refresh = useCallback(async () => {
    if (readScopeRef.current !== readScopeKey) return;
    const scope = captureScope();
    if (!scope.isCurrent()) return;
    if (!accountAddress) {
      setRows([]);
      return;
    }
    const generation = ++refreshGeneration.current;
    try {
      const next = await fetchOutstandingDeposits(accountAddress);
      if (scope.isCurrent() && generation === refreshGeneration.current) {
        const coverage = cashoutHistoryCoverage(next);
        setListed(previous => ({ account: accountAddress, scope: readScopeKey, coverage,
          rows: mergeCashoutHistoryRows(previous.scope === readScopeKey ? previous.rows : [], next, coverage) }));
      }
    } catch {
      if (scope.isCurrent() && generation === refreshGeneration.current) setListed(previous => ({ account: accountAddress, scope: readScopeKey,
        rows: mergeCashoutHistoryRows(previous.scope === readScopeKey ? previous.rows : [], [], { status: 'unavailable' }),
        coverage: { status: 'unavailable' } }));
    }
  }, [accountAddress, captureScope, setRows, readScopeKey]);

  useEffect(() => {
    const sequence = refreshGeneration;
    setRows([], { status: 'loading' });
    setActingKey(null);
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    const onVis = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') refresh();
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
    return () => {
      sequence.current++;
      clearInterval(id);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
    };
  }, [refresh, setRows]);

  const handleAction = useCallback(async (row) => {
    if (readScopeRef.current !== readScopeKey) return;
    if (!cashoutRecoveryDecision({ row, descriptor: CASHOUT_DESCRIPTOR, accountAddress,
      chainId: BASE_CHAIN_ID, canTransact, isPasskeyUser, coverage }).allowed || busyRef.current) return;
    busyRef.current = true;
    const key = rowKey(row);
    const scope = captureScope();
    const guard = () => {
      scope.assertCurrent();
      if (readScopeRef.current !== readScopeKey || isAuthHydrated === false || resolvedAccount?.toLowerCase() !== accountAddress?.toLowerCase()
        || (isSessionCurrent && !isSessionCurrent())) throw new Error('Your account changed. Please try again.');
    };
    const labels = ACTION_LABELS[row.kind];

    try {
      guard();
      setActingKey(key);
      await switchChainAsync({ chainId: BASE_CHAIN_ID });
      guard();
      const connectorClient = await getConnectorClient(wagmiConfig, { chainId: BASE_CHAIN_ID });
      guard();
      const signer = clientToSigner(connectorClient);
      if (!signer) throw new Error('Wallet not ready — reconnect and try again.');

      const { createAccountTransferService } = await import('@/services/web3/domain/AccountTransferService');
      guard();
      const service = await createAccountTransferService({ chainId: BASE_CHAIN_ID, accountAddress,
        isPasskeyUser: false, getSigner: async () => clientToSigner(await getConnectorClient(wagmiConfig, { chainId: BASE_CHAIN_ID })), guard });
      guard();
      const result = await service.recoverCashout(row, { onStateChange: state => {
        guard();
        if (state === 'pending') toast({ title: labels.submitted, description: 'Waiting for confirmation on Base…', status: 'info', duration: 5000 });
      } });
      guard();
      if (!result.success) throw result.error;
      toast({
        title: labels.confirmed,
        description: 'Your USDC has been returned to your wallet on Base.',
        status: 'success',
        duration: 6000,
      });
      onWithdrawSuccess?.();
      await refresh();
    } catch (err) {
      if (!scope.isCurrent()) return;
      toast({
        title: labels.failed,
        description: formatActionError(err),
        status: 'error',
        duration: 6000,
      });
    } finally {
      busyRef.current = false;
      if (scope.isCurrent()) setActingKey(null);
    }
  }, [isPasskeyUser, switchChainAsync, wagmiConfig, toast, onWithdrawSuccess, refresh, captureScope, isAuthHydrated, resolvedAccount, accountAddress, isSessionCurrent, canTransact, coverage, readScopeKey]);

  if (!accountAddress || (rows.length === 0 && coverage.status === 'complete')) return null;

  return (
    <Card borderRadius="2xl" boxShadow="2xl" style={cardStyle}>
      <CardBody p={[4, 6, 8]}>
        <VStack spacing={4} align="stretch">
          <VStack align="start" spacing={1}>
            <Heading size="md" color={textColor}>
              Pending Cashouts
            </Heading>
            <Text color={subtextColor} fontSize="sm">
              Cashouts that haven&apos;t completed yet. Recovery is available after checking the current details.
            </Text>
            {coverage.status !== 'complete' && <Text role="status" color={subtextColor} fontSize="sm">
              {coverage.status === 'loading' ? 'Checking cashouts…' : 'Some cashout details are unavailable. Known records are shown below.'}
            </Text>}
            {coverage.status !== 'loading' && <Button size="xs" onClick={refresh}>Refresh cashouts</Button>}
          </VStack>

          <VStack spacing={3} align="stretch">
            {rows.map((row) => {
              const key = rowKey(row);
              return (
                <PendingCashoutRow
                  key={key}
                  row={row}
                  isPasskeyUser={isPasskeyUser}
                  decision={recoveryDecision(row)}
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

function PendingCashoutRow({ row, isPasskeyUser, decision, isActing, onAct, textColor, subtextColor }) {
  const labels = ACTION_LABELS[row.kind];
  const platformLabel = row.platform || 'P2P seller listing';
  const ageText = formatAge(row.createdAtSec);

  // Title differs by kind (the user is in a different mental model in each case).
  // Subtitle keeps depositId/requestHash visible so support can match on-chain state.
  let title;
  let subtitle;
  const amountKnown = row.recoveryFacts?.state === 'known' && knownRawAmount(row.recoveryFacts.value.recoverableAmountRaw) !== null;
  if (row.kind === 'unfilled') {
    const amountStr = amountKnown ? formatTokenAmount(row.recoveryFacts.value.recoverableAmountRaw, USDC_DECIMALS, 2) : null;
    const fillState = !amountKnown ? 'current details unavailable' : row.outstandingIntentAmount > 0n ? 'taker intent active' : 'not yet filled';
    title = `${amountStr === null ? 'Amount unavailable' : `${amountStr} USDC`} → ${platformLabel}`;
    subtitle = `${ageText} · deposit #${row.depositId.toString()} · ${fillState}`;
  } else {
    const amountStr = amountKnown ? formatTokenAmount(row.recoveryFacts.value.recoverableAmountRaw, USDC_DECIMALS, 2) : null;
    title = amountStr === null ? 'Amount unavailable' : `${amountStr} USDC awaiting recovery`;
    subtitle = `${ageText} · request ${shortHash(row.requestHash)} · cashout did not complete`;
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
        {!decision.allowed && <Text color={subtextColor} fontSize="xs">{decision.reason}</Text>}
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
          isDisabled={!decision.allowed}
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
