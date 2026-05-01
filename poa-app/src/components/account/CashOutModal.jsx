/**
 * CashOutModal
 * One-click USDC → fiat cashout. User enters amount + payment details, signs once
 * (passkey biometric OR EOA wallet), and receives fiat in ~minutes.
 *
 * Place at: src/components/account/CashOutModal.jsx
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
  VStack, HStack, Text, Input, InputGroup, InputRightElement, Button,
  Alert, AlertIcon, Spinner, Box, Badge, Progress, Select, useToast,
} from '@chakra-ui/react';
import { FiCheck, FiDollarSign } from 'react-icons/fi';
import { ethers } from 'ethers';
import { encodeFunctionData } from 'viem';
import { useAccount, useSwitchChain, useConfig } from 'wagmi';
import { getConnectorClient } from 'wagmi/actions';
import { useAuth } from '@/context/AuthContext';
import { formatTokenAmount } from '@/util/formatToken';
import { createChainClients } from '@/services/web3/utils/chainClients';
import { buildUserOp, getUserOpHash } from '@/services/web3/passkey/userOpBuilder';
import { signUserOpWithPasskey } from '@/services/web3/passkey/passkeySign';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';
import PasskeyAccountABI from '../../../abi/PasskeyAccount.json';
import {
  ARBITRUM_CHAIN_ID,
  BASE_CHAIN_ID,
  CASHOUT_RELAY_ADDRESS,
  DEFAULT_CONVERSION_RATE,
  PAYMENT_PLATFORMS,
  buildBatchCalls,
  encodeCashOutPayload,
  pollBridgeStatus,
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
  registering: 10,
  quoting: 25,
  ready: 40,
  signing: 55,
  submitted: 70,
  bridging: 85,
  deposited: 95,
};

function CashOutModal({ isOpen, onClose, token, accountAddress, onSuccess }) {
  const toast = useToast();
  const { isPasskeyUser, passkeyState } = useAuth();
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
    try { return ethers.utils.parseUnits(amount, token.decimals).toBigInt(); }
    catch { return 0n; }
  }, [amount, token]);

  const balanceBigInt = useMemo(() => {
    try { return BigInt(token?.balance || '0'); } catch { return 0n; }
  }, [token?.balance]);

  const estimatedReceive = useMemo(() => {
    if (!amount || parsedAmount === 0n) return '';
    return (Number(amount) * 0.98 * 0.995).toFixed(2);
  }, [amount, parsedAmount]);

  const isValid =
    parsedAmount > 0n &&
    parsedAmount <= balanceBigInt &&
    payeeId.length >= 2 &&
    token?.chainId === ARBITRUM_CHAIN_ID;

  const handleStep = useCallback(({ step: name, message }) => {
    setStatusMessage(message || name);
    setProgressPercent(PROGRESS_BY_STEP[name] || 0);
  }, []);

  const handleCashOut = useCallback(async () => {
    if (!isValid) return;

    try {
      setStep(STEPS.processing);
      setError(null);

      // Step 1: Prepare quote + build batch calls (auth-agnostic)
      const { calls, request } = await prepareCashOut({
        amountWei: parsedAmount,
        userAddress: accountAddress,
        platform,
        payeeHandle: payeeId,
        conversionRate: DEFAULT_CONVERSION_RATE,
        onStep: handleStep,
      });

      // Step 2: Submit the batch — passkey or EOA
      handleStep({ step: 'signing', message: isPasskeyUser ? 'Sign with passkey…' : 'Confirm in your wallet…' });

      let txReceipt;
      if (isPasskeyUser) {
        txReceipt = await submitViaPasskey({ calls, accountAddress, passkeyState });
      } else {
        txReceipt = await submitViaEOA({ calls, currentChainId: currentChain?.id, switchChainAsync, wagmiConfig });
      }

      handleStep({ step: 'submitted', message: 'Bridge request submitted.' });

      // Step 3: Poll Bungee status
      handleStep({ step: 'bridging', message: 'Bridging to Base… (~30–90s)' });
      const requestHash = extractRequestHashFromReceipt(txReceipt);
      if (requestHash) {
        await pollBridgeStatus(requestHash, {
          onTick: ({ elapsedSec }) => handleStep({
            step: 'bridging',
            message: `Bridging to Base… (${elapsedSec}s)`,
          }),
        }).catch((e) => {
          // Don't fail the modal — funds may still arrive at the relay
          console.warn('[CashOut] Bridge poll warning:', e.message);
        });
      }

      handleStep({ step: 'deposited', message: 'Deposit listed on peer.xyz!' });

      setStep(STEPS.complete);
      setProgressPercent(100);
      onSuccess?.();
    } catch (err) {
      console.error('[CashOut] Error:', err);
      setError(err.message || 'Cash out failed');
      setStep(STEPS.error);
    }
  }, [
    isValid, parsedAmount, accountAddress, platform, payeeId,
    isPasskeyUser, passkeyState, currentChain, switchChainAsync, wagmiConfig,
    handleStep, onSuccess,
  ]);

  const handleMax = () => {
    if (!token) return;
    setAmount(formatTokenAmount(token.balance, token.decimals, 2));
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
              <Text fontSize="xl" fontWeight="bold">Deposit Created!</Text>
              <Text color="gray.400" textAlign="center" fontSize="sm">
                Your {amount} USDC is listed on peer.xyz. A buyer will send ~${estimatedReceive} to
                your {platformLabel} shortly. Check peer.xyz to track.
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
                {['Register', 'Quote', 'Sign', 'Submit', 'Bridge', 'Deposit'].map((label, i) => (
                  <Badge key={label} colorScheme={progressPercent >= (i + 1) * 14 ? 'green' : 'gray'} fontSize="xs">
                    {label}
                  </Badge>
                ))}
              </HStack>
            </VStack>
          ) : (
            <VStack spacing={5}>
              <Text fontSize="sm" color="gray.400">
                Convert USDC to cash. You sign once — the bridge and P2P matching happen automatically.
                ~2% spread, fills in minutes to hours.
              </Text>

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
                    Balance: {formatTokenAmount(token.balance, token.decimals, 2)}
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
                    <Button size="xs" variant="ghost" colorScheme="purple" onClick={handleMax}>MAX</Button>
                  </InputRightElement>
                </InputGroup>
              </Box>

              {amount && parsedAmount > balanceBigInt && (
                <Text fontSize="xs" color="red.300">Amount exceeds your balance</Text>
              )}

              {estimatedReceive && parsedAmount > 0n && parsedAmount <= balanceBigInt && (
                <Box w="100%" p={3} bg="rgba(0,0,0,0.3)" borderRadius="lg">
                  <VStack spacing={1} align="stretch">
                    <HStack justify="space-between">
                      <Text fontSize="xs" color="gray.400">You send</Text>
                      <Text fontSize="xs" color="white">{amount} USDC</Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text fontSize="xs" color="gray.400">Rate (2% spread)</Text>
                      <Text fontSize="xs" color="gray.400">0.98 USD/USDC</Text>
                    </HStack>
                    <HStack justify="space-between" pt={1} borderTop="1px solid" borderColor="whiteAlpha.100">
                      <Text fontSize="xs" color="gray.300" fontWeight="bold">You receive (est.)</Text>
                      <Text fontSize="xs" color="green.300" fontWeight="bold">~${estimatedReceive}</Text>
                    </HStack>
                    <Text fontSize="2xs" color="gray.600">Fills in minutes to hours via peer.xyz</Text>
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

/*══════════════════════════════════ SUBMIT HELPERS ══════════════════════════════════*/

/**
 * Submit USDC.approve + BungeeInbox.createRequest as a single passkey UserOp batch.
 * One biometric prompt covers both calls.
 */
async function submitViaPasskey({ calls, accountAddress, passkeyState }) {
  const clients = createChainClients(ARBITRUM_CHAIN_ID);
  if (!clients) throw new Error('Arbitrum client unavailable');

  const bytecode = await clients.publicClient.getBytecode({ address: accountAddress });
  if (!bytecode) {
    throw new Error('Your smart account is not deployed on Arbitrum yet. Join an org on Arbitrum first.');
  }

  // Wrap calls in PasskeyAccount.executeBatch(targets, values, datas)
  const targets = calls.map((c) => c.to);
  const values = calls.map((c) => c.value);
  const datas = calls.map((c) => c.data);
  const callData = encodeFunctionData({
    abi: PasskeyAccountABI,
    functionName: 'executeBatch',
    args: [targets, values, datas],
  });

  // Self-funded UserOp (no paymaster — cashout is not org-related so we skip the
  // org paymaster lookup; account pays gas with its own ETH on Arb)
  const userOp = await buildUserOp({
    sender: accountAddress,
    callData,
    bundlerClient: clients.bundlerClient,
    publicClient: clients.publicClient,
  });

  const userOpHash = getUserOpHash(userOp, ENTRY_POINT_ADDRESS, ARBITRUM_CHAIN_ID);
  userOp.signature = await signUserOpWithPasskey(userOpHash, passkeyState.rawCredentialId);

  const submittedHash = await clients.bundlerClient.sendUserOperation({
    ...userOp,
    entryPointAddress: ENTRY_POINT_ADDRESS,
  });

  const receipt = await clients.bundlerClient.waitForUserOperationReceipt({
    hash: submittedHash,
    timeout: 180_000,
  });
  if (!receipt.success) throw new Error(receipt.reason || 'UserOp failed on-chain');

  return receipt.receipt;
}

/**
 * Submit USDC.approve + BungeeInbox.createRequest as two sequential EOA txs.
 * Wagmi/viem handles wallet popup for each.
 */
async function submitViaEOA({ calls, currentChainId, switchChainAsync, wagmiConfig }) {
  if (currentChainId !== ARBITRUM_CHAIN_ID) {
    await switchChainAsync({ chainId: ARBITRUM_CHAIN_ID });
  }

  const client = await getConnectorClient(wagmiConfig, { chainId: ARBITRUM_CHAIN_ID });

  // Send approve tx
  const approveHash = await client.sendTransaction({
    to: calls[0].to,
    data: calls[0].data,
    value: calls[0].value,
    chain: { id: ARBITRUM_CHAIN_ID },
  });

  const clients = createChainClients(ARBITRUM_CHAIN_ID);
  await clients.publicClient.waitForTransactionReceipt({ hash: approveHash });

  // Send createRequest tx
  const createHash = await client.sendTransaction({
    to: calls[1].to,
    data: calls[1].data,
    value: calls[1].value,
    chain: { id: ARBITRUM_CHAIN_ID },
  });

  return clients.publicClient.waitForTransactionReceipt({ hash: createHash });
}

// keccak256("SingleOutputRequestCreated(bytes32,address,bytes)")
const SINGLE_OUTPUT_REQUEST_CREATED_TOPIC =
  '0xaafaed86f175a2b5a9812043ba82df1a5d0ab905b78d0f4bea5ca66a05b12183';

function extractRequestHashFromReceipt(receipt) {
  if (!receipt?.logs) return undefined;
  for (const log of receipt.logs) {
    if (log.topics?.[0]?.toLowerCase() === SINGLE_OUTPUT_REQUEST_CREATED_TOPIC) {
      return log.topics[1];
    }
  }
  return undefined;
}

export default CashOutModal;
