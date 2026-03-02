/**
 * PasskeyLoginButton
 * Entry point for passkey authentication.
 * - If stored credentials exist: "Sign in with Passkey" (reconnects from localStorage)
 * - If no credentials: "Create Account" (opens onboarding modal)
 */

import { useState } from 'react';
import { Button, Icon, useDisclosure } from '@chakra-ui/react';
import { FaFingerprint } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import PasskeyOnboardingModal from './PasskeyOnboardingModal';

/**
 * @param {Object} props
 * @param {string} [props.variant] - 'full' for full button, 'compact' for icon-only
 * @param {Object} [props.buttonProps] - Additional props passed to Button
 */
export default function PasskeyLoginButton({ variant = 'full', onSuccess, ...buttonProps }) {
  const { hasStoredPasskey, connectPasskey, isPasskeyUser, passkeyConnecting } = useAuth();
  const { isOpen, onOpen, onClose } = useDisclosure();

  // If already authenticated with passkey, don't show the button
  if (isPasskeyUser) return null;

  const handleClick = async () => {
    if (hasStoredPasskey) {
      // Returning user: reconnect from stored credentials
      try {
        await connectPasskey();
      } catch (err) {
        console.error('Failed to reconnect passkey:', err);
      }
    } else {
      // New user: open onboarding modal
      onOpen();
    }
  };

  const label = hasStoredPasskey ? 'Sign in with Passkey' : 'Create Account';

  return (
    <>
      <Button
        onClick={handleClick}
        isLoading={passkeyConnecting}
        loadingText="Connecting..."
        bg="amethyst.500"
        color="white"
        borderRadius="xl"
        _hover={{
          bg: 'amethyst.600',
          transform: 'translateY(-1px)',
          boxShadow: 'md',
        }}
        _active={{
          bg: 'amethyst.700',
          transform: 'translateY(0)',
        }}
        leftIcon={<Icon as={FaFingerprint} />}
        size={variant === 'compact' ? 'sm' : 'md'}
        {...buttonProps}
      >
        {label}
      </Button>

      <PasskeyOnboardingModal isOpen={isOpen} onClose={onClose} onSuccess={onSuccess} />
    </>
  );
}
