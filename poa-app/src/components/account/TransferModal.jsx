import { useAccount, useSwitchChain, useConfig, getConnectorClient, clientToSigner } from '@/context/WalletContext';
/**
 * TransferModal
 * Modal for transferring ERC20 tokens to any address.
 * Supports both EOA (wagmi signer) and passkey (self-funded UserOp) flows.
 * Pre-flight gas check prevents cryptic bundler errors.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
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
import { useAuth } from '@/context/authState';
import { parseDecimalAmountToRaw } from '@poa-box/core/amounts';
import { formatTokenAmount } from '@/util/formatToken';
import { useOrganizationWriteScope } from '@/lib/organization/useOrganizationWriteScope';
import { useTransactionWithNotification } from '@/hooks/useTransactionWithNotification';

const isValidAddress = (addr) => /^0x[0-9a-fA-F]{40}$/.test(addr);

function TransferModal({ isOpen, onClose, token, accountAddress, nativeBalance, onSuccess }) {
  const toast = useToast();
  const { isPasskeyUser, passkeyState, accountAddress: resolvedAccount, isSessionCurrent, isAuthHydrated } = useAuth();
  const { executeWithNotification } = useTransactionWithNotification();
  const sendingRef = useRef(false);
  const captureScope = useOrganizationWriteScope({ orgId: `${isOpen}:${token?.address}:${passkeyState?.rawCredentialId}`, chainId: token?.chainId, account: resolvedAccount });
  const { switchChainAsync } = useSwitchChain();
  const wagmiConfig = useConfig();
  const { chain: currentChain } = useAccount();

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState('form'); // form | sending | success
  const [error, setError] = useState(null);

  // Reset form when a different token is selected
  useEffect(() => {
    setRecipient('');
    setAmount('');
    setStep('form');
    setError(null);
  }, [token?.address, token?.chainId, accountAddress, isOpen]);

  const hasGas = useMemo(() => {
    if (!nativeBalance) return false;
    return BigInt(nativeBalance) > 0n;
  }, [nativeBalance]);

  const parsedAmount = useMemo(() => {
    if (!amount || !token) return 0n;
    try {
      return BigInt(parseDecimalAmountToRaw(amount, token.decimals));
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
    if (!canSend || sendingRef.current) return;
    sendingRef.current = true;
    const scope = captureScope();
    const guard = () => {
      scope.assertCurrent();
      if (isAuthHydrated === false || !resolvedAccount || resolvedAccount.toLowerCase() !== accountAddress?.toLowerCase()
        || (isSessionCurrent && !isSessionCurrent())) throw new Error('Your account changed. Please sign in and try again.');
    };
    setStep('sending');
    setError(null);
    try {
      const { createAccountTransferService } = await import('@/services/web3/domain/AccountTransferService');
      guard();
      const service = await createAccountTransferService({ chainId: token.chainId, accountAddress,
        isPasskeyUser, rawCredentialId: passkeyState?.rawCredentialId, guard,
        getSigner: async () => {
          guard();
          if (currentChain?.id !== token.chainId) await switchChainAsync({ chainId: token.chainId });
          guard();
          return clientToSigner(await getConnectorClient(wagmiConfig, { chainId: token.chainId }));
        } });
      const result = await executeWithNotification(async () => {
        guard();
        const result = await service.transferERC20(token.address, recipient, parsedAmount.toString());
        guard();
        return result;
      }, { pendingMessage: 'Sending transfer…', successMessage: 'Transfer sent!', errorMessage: 'Transfer could not be completed. Please try again.' });
      if (!scope.isCurrent()) return;
      if (!result.success) throw result.error;
      setStep('success');
      toast({ title: 'Transfer sent!', status: 'success', duration: 5000 });
      onSuccess?.();
    } catch (err) {
      if (!scope.isCurrent()) return;
      setError(err?.userMessage || 'Transfer could not be completed. Please try again.');
      setStep('form');
    } finally { sendingRef.current = false; }
  };

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
