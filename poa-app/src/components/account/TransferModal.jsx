/**
 * TransferModal
 * Modal for transferring ERC20 tokens to any address.
 * Supports both EOA (wagmi signer) and passkey (self-funded UserOp) flows.
 * Pre-flight gas check prevents cryptic bundler errors.
 */

import React, { useState, useMemo } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  VStack,
  HStack,
  Text,
  Input,
  Button,
  Alert,
  AlertIcon,
  Badge,
  Spinner,
  InputGroup,
  InputRightElement,
  useToast,
} from '@chakra-ui/react';
import { ethers } from 'ethers';
import { encodeFunctionData } from 'viem';
import { useAccount, useSwitchChain, useConfig } from 'wagmi';
import { getConnectorClient } from 'wagmi/actions';
import { clientToSigner } from '@/components/ProviderConverter';
import { useAuth } from '@/context/AuthContext';
import { createChainClients } from '@/services/web3/utils/chainClients';
import { buildUserOp, getUserOpHash } from '@/services/web3/passkey/userOpBuilder';
import { signUserOpWithPasskey } from '@/services/web3/passkey/passkeySign';
import { ENTRY_POINT_ADDRESS } from '@/config/passkey';
import { formatTokenAmount } from '@/util/formatToken';
import ERC20ABI from '../../../abi/ERC20.json';
import PasskeyAccountABI from '../../../abi/PasskeyAccount.json';

const isValidAddress = (addr) => /^0x[0-9a-fA-F]{40}$/.test(addr);

function TransferModal({ isOpen, onClose, token, accountAddress, nativeBalance, onSuccess }) {
  const toast = useToast();
  const { isPasskeyUser, passkeyState } = useAuth();
  const { switchChainAsync } = useSwitchChain();
  const wagmiConfig = useConfig();
  const { chain: currentChain } = useAccount();

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState('form'); // form | sending | success
  const [error, setError] = useState(null);

  const hasGas = useMemo(() => {
    if (!nativeBalance) return false;
    return BigInt(nativeBalance) > 0n;
  }, [nativeBalance]);

  const parsedAmount = useMemo(() => {
    if (!amount || !token) return 0n;
    try {
      return ethers.utils.parseUnits(amount, token.decimals).toBigInt();
    } catch {
      return 0n;
    }
  }, [amount, token]);

  const balanceBigInt = useMemo(() => {
    if (!token?.balance) return 0n;
    return BigInt(token.balance);
  }, [token]);

  const canSend = isValidAddress(recipient) && parsedAmount > 0n && parsedAmount <= balanceBigInt && hasGas && step === 'form';

  const handleMax = () => {
    if (!token) return;
    const formatted = ethers.utils.formatUnits(token.balance, token.decimals);
    setAmount(formatted);
  };

  const handleClose = () => {
    setRecipient('');
    setAmount('');
    setStep('form');
    setError(null);
    onClose();
  };

  const handleSend = async () => {
    if (!canSend) return;

    setStep('sending');
    setError(null);

    try {
      if (isPasskeyUser) {
        await sendViaPasskey();
      } else {
        await sendViaEOA();
      }
      setStep('success');
      toast({ title: 'Transfer sent!', status: 'success', duration: 5000 });
      onSuccess?.();
    } catch (err) {
      console.error('[Transfer] Error:', err);
      setError(err.message || 'Transfer failed');
      setStep('form');
    }
  };

  async function sendViaEOA() {
    // Switch chain if needed
    if (currentChain?.id !== token.chainId) {
      await switchChainAsync({ chainId: token.chainId });
    }

    const freshClient = await getConnectorClient(wagmiConfig, { chainId: token.chainId });
    const signer = clientToSigner(freshClient);
    const contract = new ethers.Contract(token.address, ERC20ABI, signer);
    const tx = await contract.transfer(recipient, parsedAmount.toString());
    await tx.wait();
  }

  async function sendViaPasskey() {
    const clients = createChainClients(token.chainId);
    if (!clients) throw new Error(`Chain ${token.chainId} not supported`);

    // Check if account is deployed on this chain
    const code = await clients.publicClient.getCode({ address: accountAddress });
    if (!code || code === '0x') {
      throw new Error(`Your account is not deployed on ${token.chainName} yet. Join an organization on this chain first.`);
    }

    // Encode ERC20 transfer
    const innerCallData = encodeFunctionData({
      abi: ERC20ABI,
      functionName: 'transfer',
      args: [recipient, parsedAmount],
    });

    // Wrap in execute(tokenAddress, 0, transferCallData)
    const callData = encodeFunctionData({
      abi: PasskeyAccountABI,
      functionName: 'execute',
      args: [token.address, 0n, innerCallData],
    });

    // Build self-funded UserOp (no paymaster — account pays gas)
    const userOp = await buildUserOp({
      sender: accountAddress,
      callData,
      bundlerClient: clients.bundlerClient,
      publicClient: clients.publicClient,
    });

    // Sign
    const userOpHash = getUserOpHash(userOp, ENTRY_POINT_ADDRESS, token.chainId);
    const signature = await signUserOpWithPasskey(userOpHash, passkeyState.rawCredentialId);
    userOp.signature = signature;

    // Submit
    const submittedHash = await clients.bundlerClient.sendUserOperation({
      ...userOp,
      entryPointAddress: ENTRY_POINT_ADDRESS,
    });

    const receipt = await clients.bundlerClient.waitForUserOperationReceipt({
      hash: submittedHash,
      timeout: 120_000,
    });

    if (!receipt.success) {
      throw new Error(receipt.reason || 'Transfer UserOp failed on-chain');
    }
  }

  if (!token) return null;

  const displayBalance = formatTokenAmount(token.balance, token.decimals, token.decimals <= 6 ? 2 : 4);
  const nativeName = token.nativeCurrency?.symbol || 'native tokens';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md" isCentered closeOnOverlayClick={step === 'form'}>
      <ModalOverlay bg="blackAlpha.700" />
      <ModalContent bg="gray.900" borderRadius="2xl">
        <ModalHeader color="white">
          Send {token.symbol}
          <Badge ml={2} colorScheme={token.chainId === 42161 ? 'blue' : 'green'} fontSize="xs">
            {token.chainName}
          </Badge>
        </ModalHeader>
        {step === 'form' && <ModalCloseButton color="white" />}

        <ModalBody>
          <VStack spacing={4}>
            {!hasGas && (
              <Alert status="warning" borderRadius="md" fontSize="sm">
                <AlertIcon />
                You need {nativeName} on {token.chainName} to pay for gas. Send some to your address first.
              </Alert>
            )}

            {error && (
              <Alert status="error" borderRadius="md" fontSize="sm">
                <AlertIcon />
                {error}
              </Alert>
            )}

            <VStack align="stretch" spacing={1} w="100%">
              <Text fontSize="xs" color="gray.400">Recipient Address</Text>
              <Input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="0x..."
                fontFamily="mono"
                fontSize="sm"
                isDisabled={step !== 'form'}
                isInvalid={recipient.length > 0 && !isValidAddress(recipient)}
              />
            </VStack>

            <VStack align="stretch" spacing={1} w="100%">
              <HStack justify="space-between">
                <Text fontSize="xs" color="gray.400">Amount</Text>
                <Text fontSize="xs" color="gray.500">
                  Balance: {displayBalance} {token.symbol}
                </Text>
              </HStack>
              <InputGroup>
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  type="number"
                  step="any"
                  isDisabled={step !== 'form'}
                  isInvalid={parsedAmount > balanceBigInt}
                />
                <InputRightElement width="4rem">
                  <Button size="xs" colorScheme="purple" variant="ghost" onClick={handleMax} isDisabled={step !== 'form'}>
                    MAX
                  </Button>
                </InputRightElement>
              </InputGroup>
              {parsedAmount > balanceBigInt && (
                <Text fontSize="xs" color="red.400">Exceeds balance</Text>
              )}
            </VStack>

            {step === 'sending' && (
              <HStack spacing={2}>
                <Spinner size="sm" color="purple.400" />
                <Text fontSize="sm" color="gray.400">
                  {isPasskeyUser ? 'Sign with passkey to confirm...' : 'Confirm in wallet...'}
                </Text>
              </HStack>
            )}

            {step === 'success' && (
              <Alert status="success" borderRadius="md" fontSize="sm">
                <AlertIcon />
                Transfer sent successfully!
              </Alert>
            )}
          </VStack>
        </ModalBody>

        <ModalFooter>
          {step === 'success' ? (
            <Button colorScheme="purple" onClick={handleClose}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" color="gray.400" mr={3} onClick={handleClose} isDisabled={step === 'sending'}>
                Cancel
              </Button>
              <Button
                colorScheme="purple"
                onClick={handleSend}
                isDisabled={!canSend}
                isLoading={step === 'sending'}
                loadingText="Sending..."
              >
                Send {token.symbol}
              </Button>
            </>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default TransferModal;
