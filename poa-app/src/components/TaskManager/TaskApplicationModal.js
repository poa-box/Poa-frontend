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
  HStack,
  Textarea,
  Text,
  Box,
  Badge,
  Spacer,
  useToast,
} from '@chakra-ui/react';
import { hasBounty as checkHasBounty, getTokenByAddress } from '../../util/tokens';

const glassLayerStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backgroundColor: 'rgba(15, 10, 25, 0.97)',
  boxShadow: 'inset 0 0 15px rgba(148, 115, 220, 0.15)',
  border: '1px solid rgba(148, 115, 220, 0.3)',
};

const inputStyles = {
  bg: 'whiteAlpha.100',
  border: '1px solid',
  borderColor: 'whiteAlpha.300',
  color: 'white',
  _placeholder: { color: 'gray.400' },
  _hover: { borderColor: 'whiteAlpha.400' },
  _focus: {
    borderColor: 'purple.400',
    boxShadow: '0 0 0 1px var(--chakra-colors-purple-400)',
  },
};

const difficultyColorScheme = {
  easy: 'green',
  medium: 'yellow',
  hard: 'orange',
  veryhard: 'red',
};

const TaskApplicationModal = ({ isOpen, onClose, onApply, task }) => {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const [notes, setNotes] = useState('');
  const [experience, setExperience] = useState('');

  const resetForm = () => {
    setNotes('');
    setExperience('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!notes.trim()) {
      toast({
        title: 'Application Notes Required',
        description: 'Please explain why you want to work on this task',
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

  const diffKey = task?.difficulty?.toLowerCase()?.replace(' ', '') || 'easy';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="xl" isCentered>
      <ModalOverlay bg="blackAlpha.800" />
      <ModalContent
        bg="transparent"
        borderRadius="xl"
        position="relative"
        boxShadow="dark-lg"
        mx={4}
      >
        <Box style={glassLayerStyle} />

        <ModalHeader color="white" fontSize="xl" fontWeight="bold" pb={2}>
          Apply for Task
        </ModalHeader>
        <ModalCloseButton color="white" />

        <ModalBody pb={6}>
          <VStack spacing={5} align="stretch">
            {/* Task Context Card */}
            {task && (
              <Box
                p={4}
                bg="whiteAlpha.50"
                borderRadius="lg"
                border="1px solid"
                borderColor="whiteAlpha.100"
              >
                <Text
                  fontSize="xs"
                  fontWeight="bold"
                  color="purple.300"
                  mb={2}
                  textTransform="uppercase"
                  letterSpacing="wide"
                >
                  Task Details
                </Text>
                <Text fontSize="sm" color="white" fontWeight="medium" mb={1}>
                  {task.name}
                </Text>
                {task.description && (
                  <Text fontSize="xs" color="gray.400" noOfLines={3} mb={2}>
                    {task.description}
                  </Text>
                )}
                <HStack spacing={3}>
                  <Badge
                    colorScheme={difficultyColorScheme[diffKey] || 'gray'}
                    fontSize="xs"
                  >
                    {task.difficulty || 'Unknown'}
                  </Badge>
                  <Text fontSize="xs" color="gray.400">
                    {task.estHours || '0'} hrs
                  </Text>
                  <Spacer />
                  <Text fontSize="xs" color="green.300" fontWeight="bold">
                    {task.Payout} PT
                  </Text>
                  {checkHasBounty(task.bountyToken, task.bountyPayout) && (
                    <Text fontSize="xs" color="green.400" fontWeight="bold">
                      + {task.bountyPayout} {getTokenByAddress(task.bountyToken).symbol}
                    </Text>
                  )}
                </HStack>
              </Box>
            )}

            {/* Application Form */}
            <Box>
              <Text
                fontSize="xs"
                fontWeight="bold"
                color="purple.300"
                mb={3}
                textTransform="uppercase"
                letterSpacing="wide"
              >
                Your Application
              </Text>

              <Text fontSize="sm" color="gray.400" mb={4}>
                A manager will review your application and approve if selected.
              </Text>

              <VStack spacing={4} align="stretch">
                <FormControl isRequired>
                  <FormLabel color="gray.200" fontSize="sm">
                    Why do you want to work on this task?
                  </FormLabel>
                  <Textarea
                    placeholder="Explain your interest and approach..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    {...inputStyles}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel color="gray.200" fontSize="sm">
                    Relevant Experience (Optional)
                  </FormLabel>
                  <Textarea
                    placeholder="Describe any relevant experience or skills..."
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                    rows={3}
                    {...inputStyles}
                  />
                </FormControl>
              </VStack>
            </Box>
          </VStack>
        </ModalBody>

        <ModalFooter borderTop="1px solid" borderColor="whiteAlpha.200" pt={4}>
          <HStack spacing={3} w="100%" justify="flex-end">
            <Button
              variant="ghost"
              onClick={handleClose}
              color="gray.400"
              _hover={{ bg: 'whiteAlpha.100', color: 'white' }}
            >
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
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default TaskApplicationModal;
