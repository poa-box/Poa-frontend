/**
 * GlobalAccountSettingsModal
 * Modal for updating username on the global /account page.
 * Uses useGlobalAccount instead of useUserContext (no org dependency).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  FormControl,
  FormLabel,
  Input,
  useToast,
} from '@chakra-ui/react';
import { useWeb3 } from '@/hooks/useWeb3Services';
import { useAuth } from '@/context/authState';
import { notificationIdentity } from '@/hooks/transactionNotificationLifecycle';
import { useGlobalAccount } from '@/hooks/useGlobalAccount';

const GlobalAccountSettingsModal = ({ isOpen, onClose }) => {
  const { globalUsername, isLoading, hasAccount } = useGlobalAccount();
  const { user: userService, executeWithNotification, isReady, getNotReadyMessage } = useWeb3();
  const toast = useToast();
  const auth = useAuth();
  const identity = notificationIdentity({ auth, po: {} });
  const current = useRef(identity);
  const mounted = useRef(true);
  current.current = identity;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const isCurrent = useCallback(() => mounted.current && current.current === identity && auth.isSessionCurrent?.() !== false,
    [identity, auth]);

  const [username, setUsername] = useState('');

  useEffect(() => {
    setUsername(globalUsername || '');
  }, [globalUsername, identity]);

  const handleUsernameChange = (event) => setUsername(event.target.value);

  const handleSave = useCallback(async () => {
    if (!isCurrent() || !auth.accountAddress || auth.isAuthHydrated === false || isLoading || hasAccount !== true) return;
    if (!userService || !isReady) {
      toast({ description: getNotReadyMessage(), status: 'info', duration: 4000, isClosable: true });
      return;
    }

    if (globalUsername !== username) {
      let writeSource;
      const result = await executeWithNotification(
        () => { if (!isCurrent()) throw new Error('Your account changed. Please try again.'); return userService.changeUsername(username, { onWriteSource: source => { writeSource = source; } }); },
        {
          pendingMessage: 'Updating username...',
          successMessage: 'Username updated successfully!',
          refreshEvent: 'user:username_changed',
          writeSource: () => writeSource,
        }
      );

      if (!result?.success || !isCurrent()) return;
    } else {
      toast({
        title: 'Username Unchanged',
        description: 'New username is the same as the old one. No changes made.',
        status: 'info',
        duration: 5000,
        isClosable: true,
      });
    }
    if (isCurrent()) onClose();
  }, [userService, isReady, getNotReadyMessage, executeWithNotification, username, globalUsername, isCurrent, auth, isLoading, hasAccount, toast, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Update Account Settings</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <FormControl>
            <FormLabel>Username</FormLabel>
            <Input value={username} onChange={handleUsernameChange} />
          </FormControl>
        </ModalBody>

        <ModalFooter>
          <Button colorScheme="blue" mr={3} onClick={handleSave} isDisabled={isLoading || hasAccount !== true || !auth.accountAddress}>
            Save
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default GlobalAccountSettingsModal;
