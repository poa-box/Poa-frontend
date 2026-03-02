/**
 * SignInModal
 * Unified auth entry point presenting passkey and wallet options.
 */

import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Button,
  Text,
  VStack,
  HStack,
  Icon,
  Divider,
  useDisclosure,
} from '@chakra-ui/react';
import { FaFingerprint, FaWallet } from 'react-icons/fa';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAuth } from '../../context/AuthContext';
import PasskeyOnboardingModal from './PasskeyOnboardingModal';

export default function SignInModal({ isOpen, onClose, onSuccess }) {
  const { hasStoredPasskey, connectPasskey, passkeyConnecting } = useAuth();
  const { openConnectModal } = useConnectModal();
  const {
    isOpen: isOnboardingOpen,
    onOpen: onOnboardingOpen,
    onClose: onOnboardingClose,
  } = useDisclosure();

  const handlePasskeyClick = async () => {
    if (hasStoredPasskey) {
      onClose();
      try {
        await connectPasskey();
        onSuccess?.();
      } catch (err) {
        console.error('Failed to reconnect passkey:', err);
      }
    } else {
      onClose();
      onOnboardingOpen();
    }
  };

  const handleWalletClick = () => {
    onClose();
    openConnectModal?.();
  };

  const passkeyLabel = hasStoredPasskey ? 'Sign in with Passkey' : 'Create Account';
  const passkeySubtext = hasStoredPasskey
    ? 'Reconnect using your fingerprint or device PIN'
    : 'No wallet or ETH needed — gas fees are sponsored';

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} isCentered size="md">
        <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(4px)" />
        <ModalContent
          borderRadius="2xl"
          bg="white"
          boxShadow="0 25px 50px -12px rgba(0, 0, 0, 0.25)"
          mx={4}
        >
          <ModalHeader textAlign="center" pt={6} pb={2} fontSize="xl" fontWeight="700">
            Sign In
          </ModalHeader>
          <ModalCloseButton />

          <ModalBody px={6} pb={6}>
            <VStack spacing={4}>
              <Text fontSize="sm" color="warmGray.500" textAlign="center" mt={-1}>
                Choose how you'd like to continue
              </Text>

              {/* Passkey option */}
              <Button
                onClick={handlePasskeyClick}
                isLoading={passkeyConnecting}
                loadingText="Connecting..."
                w="100%"
                h="auto"
                py={4}
                px={5}
                bg="amethyst.50"
                border="1px solid"
                borderColor="amethyst.200"
                borderRadius="xl"
                _hover={{ bg: 'amethyst.100', transform: 'translateY(-1px)', boxShadow: 'md' }}
                _active={{ bg: 'amethyst.200', transform: 'translateY(0)' }}
                display="flex"
                justifyContent="flex-start"
                textAlign="left"
                whiteSpace="normal"
              >
                <HStack spacing={4} w="100%">
                  <Icon as={FaFingerprint} w={8} h={8} color="amethyst.500" flexShrink={0} />
                  <VStack align="start" spacing={0.5}>
                    <Text fontSize="md" fontWeight="600" color="warmGray.800">
                      {passkeyLabel}
                    </Text>
                    <Text fontSize="xs" fontWeight="normal" color="warmGray.500">
                      {passkeySubtext}
                    </Text>
                  </VStack>
                </HStack>
              </Button>

              <HStack width="100%" align="center">
                <Divider borderColor="warmGray.200" />
                <Text fontSize="xs" color="warmGray.400" whiteSpace="nowrap" px={2}>
                  or
                </Text>
                <Divider borderColor="warmGray.200" />
              </HStack>

              {/* Wallet option */}
              <Button
                onClick={handleWalletClick}
                w="100%"
                h="auto"
                py={4}
                px={5}
                bg="blue.50"
                border="1px solid"
                borderColor="blue.200"
                borderRadius="xl"
                _hover={{ bg: 'blue.100', transform: 'translateY(-1px)', boxShadow: 'md' }}
                _active={{ bg: 'blue.200', transform: 'translateY(0)' }}
                display="flex"
                justifyContent="flex-start"
                textAlign="left"
                whiteSpace="normal"
              >
                <HStack spacing={4} w="100%">
                  <Icon as={FaWallet} w={8} h={8} color="blue.500" flexShrink={0} />
                  <VStack align="start" spacing={0.5}>
                    <Text fontSize="md" fontWeight="600" color="warmGray.800">
                      Connect Wallet
                    </Text>
                    <Text fontSize="xs" fontWeight="normal" color="warmGray.500">
                      Use your crypto wallet to sign in or create an account
                    </Text>
                  </VStack>
                </HStack>
              </Button>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>

      <PasskeyOnboardingModal
        isOpen={isOnboardingOpen}
        onClose={onOnboardingClose}
        onSuccess={onSuccess}
      />
    </>
  );
}
