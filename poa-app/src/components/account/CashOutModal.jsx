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
  Alert, AlertIcon, Spinner, Box, Badge, Progress, Select,
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
import { clientToSigner } from '@/components/ProviderConverter';
import PasskeyAccountABI from '../../../abi/PasskeyAccount.json';
import {
  ARBITRUM_CHAIN_ID,
  BRIDGE_SLIPPAGE_BPS,
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
  quoting: 35,
  ready: 50,
  signing: 70,
  submitted: 95,
};

// Bridge slippage (5%) + ZKP2P spread (2%) → user receives ~93% of input in fiat.
const BRIDGE_SLIPPAGE_PCT = Number(BRIDGE_SLIPPAGE_BPS) / 100;     // 5
const VENMO_SPREAD_PCT = 2;                                        // 0.98 rate

function CashOutModal({ isOpen, onClose, token, accountAddress, onSuccess }) {
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
    const bridged = Number(amount) * (1 - BRIDGE_SLIPPAGE_PCT / 100);
    return (bridged * (1 - VENMO_SPREAD_PCT / 100)).toFixed(2);
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
      handleStep({
        step: 'signing',
        message: isPasskeyUser
          ? 'Sign with passkey…'
          : 'Approve USDC in your wallet…',
      });

      if (isPasskeyUser) {
        await submitViaPasskey({ calls, accountAddress, passkeyState });
      } else {
        await submitViaEOA({
          calls,
          currentChainId: currentChain?.id,
          switchChainAsync,
          wagmiConfig,
          onApproveSent: () =>
            handleStep({ step: 'signing', message: 'Confirm bridge tx in your wallet…' }),
        });
      }

      // Done — bridge request is on-chain. We deliberately don't poll Bungee status
      // here: their public-backend endpoint blocks browser CORS and aggressive polls
      // get rate-limited (1015). The transmitter typically delivers in 1–5 minutes;
      // the user can verify in their payment app. If the bridge fails or the
      // deadline lapses, BungeeInbox auto-refunds via withdrawFunds.
      handleStep({ step: 'submitted', message: 'Bridge submitted!' });
      setStep(STEPS.complete);
      setProgressPercent(100);
      onSuccess?.();
    } catch (err) {
      console.error('[CashOut] Error:', err);
      setError(formatCashOutError(err));
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
              <Text fontSize="xl" fontWeight="bold">Bridge Submitted!</Text>
              <Text color="gray.400" textAlign="center" fontSize="sm">
                Bridging your {amount} USDC to Base, then matching with a P2P buyer.
                You should see ~${estimatedReceive} in {platformLabel} within ~5 minutes.
                Check peer.xyz to track if it doesn't arrive.
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
                {['Register', 'Quote', 'Sign', 'Submit'].map((label, i) => (
                  <Badge key={label} colorScheme={progressPercent >= (i + 1) * 20 ? 'green' : 'gray'} fontSize="xs">
                    {label}
                  </Badge>
                ))}
              </HStack>
            </VStack>
          ) : (
            <VStack spacing={5}>
              <Text fontSize="sm" color="gray.400">
                Convert USDC to cash. You sign once — the bridge and P2P matching happen automatically.
                ~7% total spread (5% bridge slippage + 2% P2P spread), fills in minutes.
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
                      <Text fontSize="xs" color="gray.400">Bridge ({BRIDGE_SLIPPAGE_PCT}% slippage)</Text>
                      <Text fontSize="xs" color="gray.400">Arb → Base</Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text fontSize="xs" color="gray.400">P2P ({VENMO_SPREAD_PCT}% spread)</Text>
                      <Text fontSize="xs" color="gray.400">USDC → {platformLabel}</Text>
                    </HStack>
                    <HStack justify="space-between" pt={1} borderTop="1px solid" borderColor="whiteAlpha.100">
                      <Text fontSize="xs" color="gray.300" fontWeight="bold">You receive (est.)</Text>
                      <Text fontSize="xs" color="green.300" fontWeight="bold">~${estimatedReceive}</Text>
                    </HStack>
                    <Text fontSize="2xs" color="gray.600">Fills in minutes via peer.xyz</Text>
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
 *
 * @dev wagmi's getConnectorClient returns a viem `Client` (not `WalletClient`),
 *      which doesn't expose `sendTransaction`. We convert to an ethers v5 signer
 *      via the same `clientToSigner` helper TransferModal uses — keeping the
 *      EOA write path consistent across the app.
 */
async function submitViaEOA({ calls, currentChainId, switchChainAsync, wagmiConfig, onApproveSent }) {
  if (currentChainId !== ARBITRUM_CHAIN_ID) {
    await switchChainAsync({ chainId: ARBITRUM_CHAIN_ID });
  }

  const connectorClient = await getConnectorClient(wagmiConfig, { chainId: ARBITRUM_CHAIN_ID });
  const signer = clientToSigner(connectorClient);
  if (!signer) {
    throw new Error('Wallet not ready — reconnect and try again.');
  }

  // Tx 1: USDC.approve(BungeeInbox, amount)
  const approveTx = await signer.sendTransaction({
    to: calls[0].to,
    data: calls[0].data,
    value: ethers.BigNumber.from(calls[0].value.toString()),
  });
  await approveTx.wait();
  onApproveSent?.();

  // Tx 2: BungeeInbox.createRequest(req, refundAddress)
  const createTx = await signer.sendTransaction({
    to: calls[1].to,
    data: calls[1].data,
    value: ethers.BigNumber.from(calls[1].value.toString()),
  });
  return createTx.wait();
}

/**
 * Map common ethers/viem/wagmi rejection codes to user-friendly text. Falls
 * back to the raw `.message` when nothing matches so devs still get a signal.
 */
function formatCashOutError(err) {
  if (!err) return 'Cash out failed';

  const code = err.code;
  const reason = (err.reason || err.shortMessage || err.message || '').toLowerCase();

  if (code === 4001 || code === 'ACTION_REJECTED' || reason.includes('user rejected')) {
    return 'You rejected the transaction in your wallet.';
  }
  if (reason.includes('insufficient funds') || code === 'INSUFFICIENT_FUNDS') {
    return 'Not enough ETH on Arbitrum to cover gas.';
  }
  if (reason.includes('chain') && reason.includes('mismatch')) {
    return 'Wrong network. Switch to Arbitrum and try again.';
  }
  return err.shortMessage || err.message || 'Cash out failed';
}

export default CashOutModal;
