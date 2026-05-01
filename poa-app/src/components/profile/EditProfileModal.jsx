/**
 * EditProfileModal
 *
 * Wraps ProfileEditor in a modal so users can update their profile from
 * inside the org profile hub without leaving org context.
 */

import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  Text,
} from '@chakra-ui/react';
import ProfileEditor from '@/components/account/ProfileEditor';
import { useGlobalAccount } from '@/hooks/useGlobalAccount';

const EditProfileModal = ({ isOpen, onClose }) => {
  const { profileMetadata, refetchAccount } = useGlobalAccount();

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered scrollBehavior="inside">
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent bg="gray.900" color="white" borderRadius="xl">
        <ModalHeader>
          Edit Profile
          <Text fontSize="sm" color="gray.400" fontWeight="normal" mt={1}>
            Your profile is shared across every Poa organization you join.
          </Text>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <ProfileEditor
            currentMetadata={profileMetadata}
            onSuccess={() => {
              refetchAccount?.();
              onClose();
            }}
          />
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default EditProfileModal;
