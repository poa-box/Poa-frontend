import { useAccount, useSwitchChain, useConfig, getConnectorClient, clientToSigner } from '@/context/WalletContext';
/**
 * CashOutModal
 * One-click USDC → fiat cashout. User signs ONE Permit2 message; the Bungee
 * solver delivers USDC on Base AND atomically calls CashOutRelay.executeData
 * to create the ZKP2P deposit. No relay tx, no backend trigger.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
  VStack, HStack, Text, Input, InputGroup, InputRightElement, Button,
  Alert, AlertIcon, Spinner, Box, Badge, Progress, Select,
} from '@chakra-ui/react';
import { FiCheck, FiDollarSign } from 'react-icons/fi';
import { ethers } from 'ethers';
import { useAuth } from '@/context/authState';
import { formatTokenAmount } from '@/util/formatToken';
import { parseDecimalAmountToRaw } from '@poa-box/core/amounts';
import { useOrganizationWriteScope } from '@/lib/organization/useOrganizationWriteScope';
import { assetActionsAvailable, knownRawAmount } from '@/services/web3/domain/accountFinancialEvidence';
import {
  ARBITRUM_CHAIN_ID,
  USDC_ARBITRUM,
  DEFAULT_CONVERSION_RATE,
  PAYMENT_PLATFORMS,
  prepareCashOut,
} from '@/services/web3/domain/CashOutService';

const PLATFORM_HINTS = {
  venmo:    { placeholder: 'yourvenmo',    hint: 'Without the @' },
  cashapp:  { placeholder: 'yourcashtag',  hint: 'Without the $' },
  paypal:   { placeholder: 'you@email.com', hint: 'PayPal email' },
  zelle:    { placeholder: 'you@email.com', hint: 'Zelle email or phone' },
  revolut:  { placeholder: 'yourrevtag',   hint: 'Revolut @tag' },
  wise:     { placeholder: 'yourwise',     hint: 'Wise @tag' },
};

const STEPS = { form: 'form', processing: 'processing', complete: 'complete', error: 'error' };

const glassStyle = {
  position: 'absolute', height: '100%', width: '100%', zIndex: -1,
  borderRadius: 'inherit', backgroundColor: 'rgba(0, 0, 0, .85)',
};

const PROGRESS_BY_STEP = {
  registering: 15,
  quoting: 30,
  ready: 45,
  approving: 60,
  signing: 80,
  submitted: 95,
};

const VENMO_SPREAD_PCT = 2;
const BRIDGE_FEE_PCT = 0.5;

function CashOutModal({ isOpen, onClose, token, accountAddress, onSuccess, nativeBalance = null, errors = [], coverage }) {
  const { isPasskeyUser, accountAddress: resolvedAccount, isSessionCurrent, isAuthHydrated, sessionGeneration } = useAuth();
  const actionRef = useRef(false);
  const canUseBalance = assetActionsAvailable({ token, nativeBalance, errors, coverage });
  const captureScope = useOrganizationWriteScope({ orgId: [isOpen, token?.address, token?.balance, nativeBalance, canUseBalance, isPasskeyUser, isAuthHydrated, sessionGeneration].join(':'), chainId: token?.chainId, account: resolvedAccount });
  const { switchChainAsync } = useSwitchChain();
  const wagmiConfig = useConfig();
  const { chain: currentChain } = useAccount();

  const [amount, setAmount] = useState('');
  const [platform, setPlatform] = useState('venmo');
  const [payeeId, setPayeeId] = useState('');
  const [step, setStep] = useState(STEPS.form);
  const [statusMessage, setStatusMessage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setAmount(''); setPayeeId(''); setStep(STEPS.form);
      setStatusMessage(''); setProgressPercent(0); setError(null);
    }
  }, [isOpen]);

  const platformLabel = PAYMENT_PLATFORMS[platform]?.label || platform;
  const platformHint = PLATFORM_HINTS[platform];

  const parsedAmount = useMemo(() => {
    if (!amount || !token) return 0n;
    try { return BigInt(parseDecimalAmountToRaw(amount, token.decimals)); }
    catch { return 0n; }
  }, [amount, token]);

  const balanceBigInt = useMemo(() => {
    const raw = knownRawAmount(token?.balance);
    return raw === null ? null : BigInt(raw);
  }, [token?.balance]);

  const estimatedReceive = useMemo(() => {
    if (!amount || parsedAmount === 0n) return '';
    const bridged = Number(amount) * (1 - BRIDGE_FEE_PCT / 100);
    return (bridged * (1 - VENMO_SPREAD_PCT / 100)).toFixed(2);
  }, [amount, parsedAmount]);

  const isValid =
    canUseBalance && isAuthHydrated !== false &&
    !!accountAddress && resolvedAccount?.toLowerCase() === accountAddress.toLowerCase() &&
    parsedAmount > 0n &&
    parsedAmount <= balanceBigInt &&
    payeeId.length >= 2 &&
    token?.chainId === ARBITRUM_CHAIN_ID &&
    token?.address?.toLowerCase() === USDC_ARBITRUM.toLowerCase() &&
    !isPasskeyUser; // see passkey notice below

  const handleStep = useCallback(({ step: name, message }) => {
    setStatusMessage(message || name);
    setProgressPercent(PROGRESS_BY_STEP[name] || 0);
  }, []);

  const handleCashOut = useCallback(async () => {
    if (!isValid || actionRef.current) return;
    actionRef.current = true;
    const scope = captureScope();
    const guard = () => {
      scope.assertCurrent();
      if (isAuthHydrated === false || resolvedAccount?.toLowerCase() !== accountAddress?.toLowerCase()
        || (isSessionCurrent && !isSessionCurrent())) throw new Error('Your account changed. Please try again.');
    };
    try {
      guard();
      setStep(STEPS.processing);
      setError(null);

      // 1. Build the typed data + approval requirement (auth-agnostic)
      const { typedData, approval, submit } = await prepareCashOut({
        amountWei: parsedAmount,
        userAddress: accountAddress,
        platform,
        payeeHandle: payeeId,
        conversionRate: DEFAULT_CONVERSION_RATE,
        onStep: event => { guard(); handleStep(event); },
      });

      guard();
      // 2. Make sure we're on Arbitrum
      if (currentChain?.id !== ARBITRUM_CHAIN_ID) {
        await switchChainAsync({ chainId: ARBITRUM_CHAIN_ID });
      }
      guard();
      const connectorClient = await getConnectorClient(wagmiConfig, { chainId: ARBITRUM_CHAIN_ID });
      guard();
      const signer = clientToSigner(connectorClient);
      if (!signer) throw new Error('Wallet not ready — reconnect and try again.');

      const { createAccountTransferService } = await import('@/services/web3/domain/AccountTransferService');
      guard();
      const service = await createAccountTransferService({ chainId: ARBITRUM_CHAIN_ID,
        accountAddress, isPasskeyUser: false, guard, getSigner: async () => clientToSigner(await getConnectorClient(wagmiConfig, { chainId: ARBITRUM_CHAIN_ID })) });
      guard();
      const approved = await service.approveIfNeeded(approval, { onStateChange: () => {
        guard(); handleStep({ step: 'approving', message: 'Approving USDC (one-time)…' });
      } });
      guard();
      if (!approved.success) throw approved.error;

      // 4. Sign the Permit2 typed data (single signature)
      handleStep({ step: 'signing', message: 'Sign to confirm cashout…' });
      guard();
      const signature = await service.signCashout(typedData);

      guard();
      // 5. Submit to Bungee — solver picks up, delivers atomically
      handleStep({ step: 'submitted', message: 'Submitting to bridge…' });
      guard();
      await submit(signature);
      guard();

      setStep(STEPS.complete);
      setProgressPercent(100);
      onSuccess?.();
    } catch (err) {
      if (!scope.isCurrent()) return;
      setError(formatCashOutError(err));
      setStep(STEPS.error);
    } finally { actionRef.current = false; }
  }, [
    isValid, parsedAmount, accountAddress, platform, payeeId,
    currentChain, switchChainAsync, wagmiConfig, handleStep, onSuccess, captureScope, isAuthHydrated, resolvedAccount, isSessionCurrent,
  ]);

  const handleMax = () => {
    if (!token || !canUseBalance) return;
    setAmount(ethers.utils.formatUnits(token.balance, token.decimals));
  };

  const isProcessing = step === STEPS.processing;

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="md" closeOnOverlayClick={!isProcessing}>
      <ModalOverlay bg="blackAlpha.700" />
      <ModalContent bg="transparent" boxShadow="xl" borderRadius="2xl" position="relative" color="whitesmoke">
        <div style={glassStyle} />
        <ModalHeader borderBottom="1px solid" borderColor="whiteAlpha.100">
          <HStack spacing={2}><FiDollarSign /><Text>Cash Out</Text></HStack>
        </ModalHeader>
        <ModalCloseButton isDisabled={isProcessing} />

        <ModalBody py={6}>
          {step === STEPS.complete ? (
            <VStack spacing={4} py={8}>
              <Box w="64px" h="64px" borderRadius="full" bg="green.500" display="flex" alignItems="center" justifyContent="center">
                <FiCheck size={32} color="white" />
              </Box>
              <Text fontSize="xl" fontWeight="bold">Cashout Submitted!</Text>
              <Text color="gray.400" textAlign="center" fontSize="sm">
                Your {amount} USDC is bridging to Base, where the relay will atomically
                create a P2P sell order. A buyer will send ~${estimatedReceive} to your
                {' '}{platformLabel} within minutes — check peer.xyz to track. If no buyer
                takes it, you can withdraw it back to USDC from your account page.
              </Text>
            </VStack>
          ) : step === STEPS.error ? (
            <VStack spacing={4} py={4}>
              <Alert status="error" borderRadius="lg" bg="red.900" color="white">
                <AlertIcon /><Text fontSize="sm">{error}</Text>
              </Alert>
              <Button size="sm" variant="outline" onClick={() => { setStep(STEPS.form); setError(null); }}>
                Try Again
              </Button>
            </VStack>
          ) : isProcessing ? (
            <VStack spacing={6} py={6}>
              <Spinner size="xl" color="purple.400" />
              <Text fontSize="lg" fontWeight="bold">{statusMessage}</Text>
              <Progress value={progressPercent} size="sm" colorScheme="purple" borderRadius="full" w="100%" hasStripe isAnimated />
              <HStack spacing={2} flexWrap="wrap" justify="center">
                {['Register', 'Quote', 'Approve', 'Sign', 'Submit'].map((label, i) => (
                  <Badge key={label} colorScheme={progressPercent >= (i + 1) * 16 ? 'green' : 'gray'} fontSize="xs">
                    {label}
                  </Badge>
                ))}
              </HStack>
            </VStack>
          ) : (
            <VStack spacing={5}>
              <Text fontSize="sm" color="gray.400">
                Convert USDC to cash. You sign once — the bridge delivers and creates the
                P2P sell order atomically. Funds arrive in your payment app in minutes.
              </Text>

              {isPasskeyUser && (
                <Alert status="warning" borderRadius="lg" bg="yellow.900" color="yellow.200" fontSize="sm">
                  <AlertIcon />
                  <VStack align="start" spacing={1}>
                    <Text fontWeight="bold">Passkey cashout coming soon</Text>
                    <Text fontSize="xs">
                      Connect the wallet that holds your USDC to use cashout.
                    </Text>
                  </VStack>
                </Alert>
              )}

              {!canUseBalance && <Alert status="warning" borderRadius="lg"><AlertIcon />
                {balanceBigInt === null || knownRawAmount(nativeBalance) === null || !['complete', 'incomplete'].includes(coverage)
                  ? 'Balance or network fee balance unavailable. Refresh balances before continuing.'
                  : 'A positive USDC balance and funds for network fees are needed. Refresh balances before continuing.'}
              </Alert>}

              {token && token.chainId !== ARBITRUM_CHAIN_ID && (
                <Alert status="warning" borderRadius="lg" bg="yellow.900" color="yellow.200" fontSize="sm">
                  <AlertIcon />Cash out only supports USDC on Arbitrum right now.
                </Alert>
              )}

              {token && (
                <HStack w="100%" justify="space-between">
                  <HStack>
                    <Badge colorScheme="blue" fontSize="xs">{token.chainName}</Badge>
                    <Text fontSize="sm" color="gray.300">{token.symbol}</Text>
                  </HStack>
                  <Text fontSize="xs" color="gray.500">
                    Balance: {balanceBigInt === null ? 'Unavailable' : formatTokenAmount(token.balance, token.decimals, 2)}
                  </Text>
                </HStack>
              )}

              <Box w="100%">
                <Text mb={1} fontSize="sm" fontWeight="medium" color="gray.300">Payment Method</Text>
                <Select
                  value={platform}
                  onChange={(e) => { setPlatform(e.target.value); setPayeeId(''); }}
                  bg="rgba(0,0,0,0.4)" border="1px solid" borderColor="whiteAlpha.200"
                  _hover={{ borderColor: 'purple.400' }}
                >
                  {Object.entries(PAYMENT_PLATFORMS).map(([id, p]) => (
                    <option key={id} value={id} style={{ background: '#1a1a2e' }}>{p.label}</option>
                  ))}
                </Select>
              </Box>

              <Box w="100%">
                <Text mb={1} fontSize="sm" fontWeight="medium" color="gray.300">{platformLabel} Username</Text>
                <Input
                  placeholder={platformHint?.placeholder}
                  value={payeeId}
                  onChange={(e) => setPayeeId(e.target.value.replace(/[@$\s]/g, ''))}
                  bg="rgba(0,0,0,0.4)" border="1px solid" borderColor="whiteAlpha.200"
                  _hover={{ borderColor: 'purple.400' }}
                  _focus={{ borderColor: 'purple.400', boxShadow: '0 0 0 1px var(--chakra-colors-purple-400)' }}
                />
                <Text fontSize="xs" color="gray.500" mt={1}>{platformHint?.hint}</Text>
              </Box>

              <Box w="100%">
                <Text mb={1} fontSize="sm" fontWeight="medium" color="gray.300">Amount (USDC)</Text>
                <InputGroup>
                  <Input
                    type="number" placeholder="0.00" value={amount}
                    onChange={(e) => setAmount(e.target.value)} step="any"
                    bg="rgba(0,0,0,0.4)" border="1px solid" borderColor="whiteAlpha.200"
                    _hover={{ borderColor: 'purple.400' }}
                    _focus={{ borderColor: 'purple.400', boxShadow: '0 0 0 1px var(--chakra-colors-purple-400)' }}
                  />
                  <InputRightElement pr={1}>
                    <Button size="xs" variant="ghost" colorScheme="purple" isDisabled={!canUseBalance} onClick={handleMax}>MAX</Button>
                  </InputRightElement>
                </InputGroup>
              </Box>

              {amount && balanceBigInt !== null && parsedAmount > balanceBigInt && (
                <Text fontSize="xs" color="red.300">Amount exceeds your balance</Text>
              )}

              {estimatedReceive && canUseBalance && parsedAmount > 0n && parsedAmount <= balanceBigInt && (
                <Box w="100%" p={3} bg="rgba(0,0,0,0.3)" borderRadius="lg">
                  <VStack spacing={1} align="stretch">
                    <HStack justify="space-between">
                      <Text fontSize="xs" color="gray.400">You send</Text>
                      <Text fontSize="xs" color="white">{amount} USDC</Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text fontSize="xs" color="gray.400">Bridge fee</Text>
                      <Text fontSize="xs" color="gray.400">~{BRIDGE_FEE_PCT}%</Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text fontSize="xs" color="gray.400">P2P spread</Text>
                      <Text fontSize="xs" color="gray.400">~{VENMO_SPREAD_PCT}%</Text>
                    </HStack>
                    <HStack justify="space-between" pt={1} borderTop="1px solid" borderColor="whiteAlpha.100">
                      <Text fontSize="xs" color="gray.300" fontWeight="bold">You receive (est.)</Text>
                      <Text fontSize="xs" color="green.300" fontWeight="bold">~${estimatedReceive}</Text>
                    </HStack>
                    <Text fontSize="2xs" color="gray.600">
                      One signature, atomic delivery + ZKP2P listing on Base.
                    </Text>
                  </VStack>
                </Box>
              )}
            </VStack>
          )}
        </ModalBody>

        {step === STEPS.form && (
          <ModalFooter borderTop="1px solid" borderColor="whiteAlpha.100" gap={3}>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button colorScheme="green" onClick={handleCashOut} isDisabled={!isValid}>
              Cash Out
            </Button>
          </ModalFooter>
        )}
        {step === STEPS.complete && (
          <ModalFooter borderTop="1px solid" borderColor="whiteAlpha.100">
            <Button colorScheme="purple" onClick={onClose}>Done</Button>
          </ModalFooter>
        )}
      </ModalContent>
    </Modal>
  );
}

/*══════════════════════════════════ HELPERS ══════════════════════════════════*/

/**
 * Map common ethers/viem/wagmi rejection codes to user-friendly text.
 */
function formatCashOutError(err) {
  if (!err) return 'Cash out failed';
  const code = err.code;
  const reason = (err.reason || err.shortMessage || err.message || '').toLowerCase();

  if (code === 4001 || code === 'ACTION_REJECTED' || reason.includes('user rejected')) {
    return 'You rejected the signature in your wallet.';
  }
  if (reason.includes('insufficient funds') || code === 'INSUFFICIENT_FUNDS') {
    return 'Not enough ETH on Arbitrum to cover the one-time approval gas.';
  }
  if (reason.includes('chain') && reason.includes('mismatch')) {
    return 'Wrong network. Switch to Arbitrum and try again.';
  }
  return err.shortMessage || err.message || 'Cash out failed';
}

export default CashOutModal;
