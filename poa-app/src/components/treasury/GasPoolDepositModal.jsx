import React, { useState, useEffect, useCallback } from 'react';
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
  Button,
  Input,
  InputGroup,
  InputRightElement,
  Spinner,
  Box,
} from '@chakra-ui/react';
import { FiCheck } from 'react-icons/fi';
import { useWeb3 } from '@/hooks/useWeb3Services';
import { useAuth } from '@/context/AuthContext';
import { usePOContext } from '@/context/POContext';
import { RefreshEvent } from '@/context/RefreshContext';
import { getNetworkByChainId } from '@/config/networks';
import { formatTokenAmount, parseTokenAmount } from '@/util/formatToken';
import { createChainClients } from '@/services/web3/utils/chainClients';

const glassLayerStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backgroundColor: 'rgba(0, 0, 0, .85)',
};

const GasPoolDepositModal = ({ isOpen, onClose, paymasterHubAddress }) => {
  const { treasury, executeWithNotification, isReady } = useWeb3();
  const { accountAddress } = useAuth();
  const { orgId, orgChainId } = usePOContext();

  const network = getNetworkByChainId(orgChainId);
  const nativeSymbol = network?.nativeCurrency?.symbol || 'ETH';

  const [amount, setAmount] = useState('');
  const [userBalance, setUserBalance] = useState('0');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingBalance, setIsFetchingBalance] = useState(false);
  const [step, setStep] = useState('form'); // 'form' | 'depositing' | 'success'

  const resetForm = useCallback(() => {
    setAmount('');
    setUserBalance('0');
    setIsLoading(false);
    setIsFetchingBalance(false);
    setStep('form');
  }, []);

  useEffect(() => {
    if (!isOpen) resetForm();
  }, [isOpen, resetForm]);

  // Fetch native balance
  useEffect(() => {
    if (!isOpen || !accountAddress || !orgChainId) return;

    let cancelled = false;

    const fetchBalance = async () => {
      setIsFetchingBalance(true);
      try {
        const clients = createChainClients(orgChainId);
        const client = clients?.publicClient;
        if (!client || cancelled) return;

        const balance = await client.getBalance({ address: accountAddress });
        if (!cancelled) {
          setUserBalance(balance.toString());
        }
      } catch (e) {
        console.warn('Failed to fetch native balance:', e.message);
        if (!cancelled) setUserBalance('0');
      } finally {
        if (!cancelled) setIsFetchingBalance(false);
      }
    };

    fetchBalance();
    return () => { cancelled = true; };
  }, [isOpen, accountAddress, orgChainId]);

  const formattedBalance = formatTokenAmount(userBalance, 18, 6);

  const handleMaxClick = () => {
    if (userBalance === '0') return;
    // Leave a small buffer for gas fees
    const balance = BigInt(userBalance);
    const buffer = BigInt(parseTokenAmount('0.001', 18));
    const maxAmount = balance > buffer ? balance - buffer : 0n;
    if (maxAmount <= 0n) return;
    setAmount(formatTokenAmount(maxAmount.toString(), 18, 6));
  };

  const isAmountValid = () => {
    if (!amount || Number(amount) <= 0) return false;
    // Reject scientific notation (e.g. "1e-7") which parseTokenAmount can't handle
    if (/[eE]/.test(amount)) return false;
    try {
      const weiAmount = BigInt(parseTokenAmount(amount, 18));
      const balanceBN = BigInt(userBalance);
      return weiAmount > 0n && weiAmount <= balanceBN;
    } catch {
      return false;
    }
  };

  const handleDeposit = async () => {
    if (!isAmountValid() || !treasury || !isReady || !paymasterHubAddress) return;

    setIsLoading(true);
    const weiAmount = parseTokenAmount(amount, 18);

    try {
      setStep('depositing');
      const result = await executeWithNotification(
        () => treasury.depositToGasPool(paymasterHubAddress, orgId, weiAmount),
        {
          pendingMessage: `Depositing ${amount} ${nativeSymbol} to gas pool...`,
          successMessage: `Deposited ${amount} ${nativeSymbol} to gas pool!`,
          refreshEvent: RefreshEvent.GAS_POOL_DEPOSITED,
          refreshData: { amount },
        }
      );

      if (result.success) {
        setStep('success');
        setTimeout(() => { onClose(); }, 1500);
      } else {
        setStep('form');
      }
    } catch (error) {
      console.error('Gas pool deposit failed:', error);
      setStep('form');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="md" closeOnOverlayClick={!isLoading}>
      <ModalOverlay bg="blackAlpha.700" />
      <ModalContent
        bg="transparent"
        boxShadow="xl"
        borderRadius="2xl"
        position="relative"
        color="whitesmoke"
      >
        <div style={glassLayerStyle} />
        <ModalHeader borderBottom="1px solid" borderColor="whiteAlpha.100">
          Fund Gas Pool
        </ModalHeader>
        <ModalCloseButton isDisabled={isLoading} />

        <ModalBody py={6}>
          {step === 'success' ? (
            <VStack spacing={4} py={8}>
              <Box
                w="64px"
                h="64px"
                borderRadius="full"
                bg="green.500"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                <FiCheck size={32} color="white" />
              </Box>
              <Text fontSize="xl" fontWeight="bold">
                Deposit Successful!
              </Text>
              <Text color="gray.400" textAlign="center">
                {amount} {nativeSymbol} has been added to the gas pool.
              </Text>
            </VStack>
          ) : step === 'depositing' ? (
            <VStack spacing={4} py={8}>
              <Spinner size="xl" color="purple.400" />
              <Text fontSize="lg" fontWeight="bold">
                Depositing {amount} {nativeSymbol}...
              </Text>
              <Text color="gray.400" textAlign="center" fontSize="sm">
                Please confirm the transaction in your wallet.
              </Text>
            </VStack>
          ) : (
            <VStack spacing={5}>
              <Text fontSize="sm" color="gray.400">
                Deposit {nativeSymbol} to fund gas sponsorship for your organization's members.
                This covers transaction fees so members can use the app for free.
              </Text>

              {/* Amount input */}
              <Box w="100%">
                <HStack justify="space-between" mb={2}>
                  <Text fontSize="sm" fontWeight="medium" color="gray.300">
                    Amount
                  </Text>
                  <HStack spacing={1}>
                    <Text fontSize="xs" color="gray.500">
                      Balance: {isFetchingBalance ? '...' : formattedBalance} {nativeSymbol}
                    </Text>
                    <Button
                      size="xs"
                      variant="ghost"
                      colorScheme="purple"
                      onClick={handleMaxClick}
                      isDisabled={userBalance === '0' || isFetchingBalance}
                    >
                      MAX
                    </Button>
                  </HStack>
                </HStack>
                <InputGroup>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    bg="rgba(0, 0, 0, 0.4)"
                    border="1px solid"
                    borderColor="whiteAlpha.200"
                    _hover={{ borderColor: 'purple.400' }}
                    _focus={{ borderColor: 'purple.400', boxShadow: '0 0 0 1px var(--chakra-colors-purple-400)' }}
                    step="any"
                  />
                  <InputRightElement pr={3} pointerEvents="none">
                    <Text fontSize="sm" color="gray.400" fontWeight="medium">
                      {nativeSymbol}
                    </Text>
                  </InputRightElement>
                </InputGroup>
              </Box>

              {/* Validation message */}
              {amount && !isAmountValid() && (
                <Text fontSize="xs" color="red.300">
                  {Number(amount) <= 0
                    ? 'Amount must be greater than 0'
                    : 'Amount exceeds your balance'}
                </Text>
              )}
            </VStack>
          )}
        </ModalBody>

        {step === 'form' && (
          <ModalFooter borderTop="1px solid" borderColor="whiteAlpha.100" gap={3}>
            <Button variant="ghost" onClick={onClose} isDisabled={isLoading}>
              Cancel
            </Button>
            <Button
              colorScheme="purple"
              onClick={handleDeposit}
              isDisabled={!isAmountValid() || isLoading || !isReady || isFetchingBalance}
              isLoading={isLoading}
            >
              Deposit
            </Button>
          </ModalFooter>
        )}
      </ModalContent>
    </Modal>
  );
};

export default GasPoolDepositModal;
