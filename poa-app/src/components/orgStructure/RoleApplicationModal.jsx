/**
 * RoleApplicationModal - Modal for submitting a role application
 * Follows the same pattern as TaskApplicationModal
 */

import React, { useState } from 'react';
import {
  Button,
  FormControl,
  FormLabel,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  ModalFooter,
  VStack,
  Textarea,
  Text,
  useToast,
} from '@chakra-ui/react';

export function RoleApplicationModal({ isOpen, onClose, onApply, roleName }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [experience, setExperience] = useState('');

  const resetForm = () => {
    setNotes('');
    setExperience('');
  };

  const handleSubmit = async () => {
    if (!notes.trim()) {
      toast({
        title: 'Application Notes Required',
        description: 'Please explain why you want this role',
        status: 'error',
        duration: 3000,
      });
      return;
    }

    setLoading(true);

    try {
      const applicationData = {
        notes: notes.trim(),
        experience: experience.trim(),
        appliedAt: new Date().toISOString(),
      };

      await onApply(applicationData);
      resetForm();
    } catch (error) {
      console.error('Error submitting application:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md">
      <ModalOverlay />
      <ModalContent bg="white">
        <ModalHeader color="warmGray.900">Apply for: {roleName}</ModalHeader>
        <ModalCloseButton color="warmGray.400" />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <Text fontSize="sm" color="warmGray.600">
              Submit an application for this role. Existing members will be able to
              see your application and vouch for you.
            </Text>

            <FormControl isRequired>
              <FormLabel color="warmGray.700">Why do you want this role?</FormLabel>
              <Textarea
                placeholder="Explain your interest and what you'd contribute..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                bg="warmGray.50"
                color="warmGray.900"
                borderColor="warmGray.200"
                _placeholder={{ color: 'warmGray.400' }}
                _focus={{ borderColor: 'amethyst.400', boxShadow: '0 0 0 1px var(--chakra-colors-amethyst-400)' }}
              />
            </FormControl>

            <FormControl>
              <FormLabel color="warmGray.700">Relevant Experience (Optional)</FormLabel>
              <Textarea
                placeholder="Describe any relevant experience or skills..."
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
                rows={3}
                bg="warmGray.50"
                color="warmGray.900"
                borderColor="warmGray.200"
                _placeholder={{ color: 'warmGray.400' }}
                _focus={{ borderColor: 'amethyst.400', boxShadow: '0 0 0 1px var(--chakra-colors-amethyst-400)' }}
              />
            </FormControl>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={handleClose} color="warmGray.500">
            Cancel
          </Button>
          <Button
            colorScheme="purple"
            onClick={handleSubmit}
            isLoading={loading}
            loadingText="Submitting..."
          >
            Submit Application
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default RoleApplicationModal;
