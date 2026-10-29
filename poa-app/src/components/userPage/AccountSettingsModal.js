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
import { useUserContext } from '@/context/UserContext';
import { useAuth } from '@/context/authState';
import { usePOContext } from '@/context/POContext';
import { notificationIdentity } from '@/hooks/transactionNotificationLifecycle';


const AccountSettingsModal = ({ isOpen, onClose }) => {
    const { graphUsername, setGraphUsername } = useUserContext();
    const { user: userService, executeWithNotification, isReady, getNotReadyMessage } = useWeb3();
    const toast = useToast();
    const auth = useAuth();
    const po = usePOContext();
    const identity = notificationIdentity({ auth, po });
    const current = useRef(identity);
    const mounted = useRef(true);
    current.current = identity;
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);


    const [username, setUsername] = useState('');
    // const [email, setEmail] = useState('');
  
    useEffect(() => {
      if (graphUsername) {
       
        setUsername(graphUsername);
      }
    }, [graphUsername]);

  // Handle input changes
  
  const handleUsernameChange = (event) => setUsername(event.target.value);
  

  const handleSave = useCallback(async () => {
    if (!userService || !isReady) {
      toast({ description: getNotReadyMessage(), status: 'info', duration: 4000, isClosable: true });
      return;
    }

    if (graphUsername !== username) {
      let writeSource;
      const result = await executeWithNotification(
        () => userService.changeUsername(username, { onWriteSource: source => { writeSource = source; } }),
        {
          pendingMessage: 'Updating username...',
          successMessage: 'Username updated successfully!',
          refreshEvent: 'user:username_changed',
          writeSource: () => writeSource,
        }
      );

      if (!result.success || !mounted.current || current.current !== identity || auth.isSessionCurrent?.() === false) return;
      if (result.success) {
        setGraphUsername(username);
      }
    } else {
      toast({
        title: 'Username Unchanged',
        description: 'New username is the same as the old one. No changes made.',
        status: 'info',
        duration: 5000,
        isClosable: true,
      });
    }
    onClose();
  }, [userService, isReady, getNotReadyMessage, executeWithNotification, username, graphUsername, setGraphUsername, toast, onClose, identity, auth]);


  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader> Update Account Settings</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <FormControl>
           
            <FormLabel>Username</FormLabel>
            <Input value={username} onChange={handleUsernameChange} />
        
         
          </FormControl>
        </ModalBody>

        <ModalFooter>
          <Button colorScheme="blue" mr={3} onClick={handleSave}>
            Save
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};


export default AccountSettingsModal;
