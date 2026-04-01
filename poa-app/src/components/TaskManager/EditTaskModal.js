import React, { useState, useMemo } from 'react';
import {
  Button,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalOverlay,
  Select,
  HStack,
  VStack,
  Switch,
  Box,
  Text,
  Textarea,
  SimpleGrid,
  InputGroup,
  InputRightAddon,
} from '@chakra-ui/react';
import { getBountyTokenOptions, BOUNTY_TOKENS, hasBounty as checkHasBounty } from '../../util/tokens';
import { usePOContext } from '../../context/POContext';

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

const selectStyles = {
  ...inputStyles,
  sx: {
    '& option': {
      bg: 'gray.800',
      color: 'white',
    },
  },
};

const EditTaskModal = ({ isOpen, onClose, onEditTask, onDeleteTask, task }) => {
  const { orgChainId } = usePOContext();
  const tokenOptions = useMemo(() => getBountyTokenOptions(orgChainId), [orgChainId]);

  const [name, setName] = useState(task.name);
  const [description, setDescription] = useState(task.description);
  const [difficulty, setDifficulty] = useState(task.difficulty);
  const [estHours, setEstimatedHours] = useState(task.estHours);

  // Bounty state - initialize from task if bounty exists
  const taskHasBounty = checkHasBounty(task.bountyToken, task.bountyPayout);
  const [hasBounty, setHasBounty] = useState(taskHasBounty);
  const [bountyToken, setBountyToken] = useState(
    taskHasBounty ? task.bountyToken : (tokenOptions[0]?.address || '')
  );
  const [bountyAmount, setBountyAmount] = useState(
    taskHasBounty ? task.bountyPayout : ''
  );

  const handleEditTask = () => {
    onEditTask({
      ...task,
      name,
      description,
      difficulty,
      estHours,
      bountyToken: hasBounty ? bountyToken : BOUNTY_TOKENS.NONE.address,
      bountyAmount: hasBounty ? bountyAmount : '0',
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" isCentered>
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
          Edit Task
        </ModalHeader>
        <ModalCloseButton color="white" />

        <ModalBody pb={6}>
          <VStack spacing={6} align="stretch">
            {/* Task Details Section */}
            <Box>
              <Text
                fontSize="xs"
                fontWeight="bold"
                color="purple.300"
                mb={3}
                textTransform="uppercase"
                letterSpacing="wide"
              >
                Task Details
              </Text>
              <VStack spacing={4} align="stretch">
                <FormControl>
                  <FormLabel color="gray.200" fontSize="sm">Task Name</FormLabel>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter task name..."
                    {...inputStyles}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel color="gray.200" fontSize="sm">Description</FormLabel>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the task..."
                    minH="100px"
                    {...inputStyles}
                  />
                </FormControl>
              </VStack>
            </Box>

            {/* Effort Section */}
            <Box>
              <Text
                fontSize="xs"
                fontWeight="bold"
                color="purple.300"
                mb={3}
                textTransform="uppercase"
                letterSpacing="wide"
              >
                Effort
              </Text>
              <SimpleGrid columns={2} spacing={4}>
                <FormControl>
                  <FormLabel color="gray.200" fontSize="sm">Difficulty</FormLabel>
                  <Select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    {...selectStyles}
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                    <option value="veryHard">Very Hard</option>
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel color="gray.200" fontSize="sm">Estimated Hours</FormLabel>
                  <Input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={estHours}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (isNaN(val)) {
                        setEstimatedHours(0.5);
                      } else {
                        setEstimatedHours(val);
                      }
                    }}
                    onBlur={(e) => {
                      const val = parseFloat(e.target.value);
                      if (val <= 0.5) {
                        setEstimatedHours(0.5);
                      } else {
                        setEstimatedHours(Math.round(val * 2) / 2);
                      }
                    }}
                    {...inputStyles}
                  />
                </FormControl>
              </SimpleGrid>
            </Box>

            {/* Token Bounty Section */}
            <Box>
              <FormControl>
                <HStack justify="space-between" mb={hasBounty ? 3 : 0}>
                  <HStack>
                    <Text
                      fontSize="xs"
                      fontWeight="bold"
                      color="purple.300"
                      textTransform="uppercase"
                      letterSpacing="wide"
                    >
                      Token Bounty
                    </Text>
                    <Text fontSize="xs" color="gray.500">
                      {tokenOptions.length === 0 ? '(No tokens configured)' : '(Optional)'}
                    </Text>
                  </HStack>
                  <Switch
                    isChecked={hasBounty}
                    onChange={(e) => setHasBounty(e.target.checked)}
                    colorScheme="purple"
                    isDisabled={tokenOptions.length === 0}
                  />
                </HStack>
              </FormControl>

              {hasBounty && (
                <Box
                  p={4}
                  bg="whiteAlpha.50"
                  borderRadius="lg"
                  border="1px solid rgba(148, 115, 220, 0.2)"
                >
                  <SimpleGrid columns={2} spacing={3}>
                    <FormControl>
                      <FormLabel color="gray.400" fontSize="xs">Token</FormLabel>
                      <Select
                        value={bountyToken}
                        onChange={(e) => setBountyToken(e.target.value)}
                        size="sm"
                        {...selectStyles}
                      >
                        {tokenOptions.map((token) => (
                          <option key={token.symbol} value={token.address}>
                            {token.symbol} - {token.name}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl>
                      <FormLabel color="gray.400" fontSize="xs">Amount</FormLabel>
                      <InputGroup size="sm">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={bountyAmount}
                          onChange={(e) => setBountyAmount(e.target.value)}
                          {...inputStyles}
                        />
                        <InputRightAddon
                          bg="whiteAlpha.100"
                          borderColor="whiteAlpha.200"
                          color="gray.400"
                        >
                          {tokenOptions.find(t => t.address === bountyToken)?.symbol || 'TOKEN'}
                        </InputRightAddon>
                      </InputGroup>
                    </FormControl>
                  </SimpleGrid>
                  <Text fontSize="xs" color="gray.500" mt={3}>
                    This bounty will be paid in addition to participation tokens
                  </Text>
                </Box>
              )}
            </Box>
          </VStack>
        </ModalBody>

        <ModalFooter borderTop="1px solid" borderColor="whiteAlpha.200" pt={4}>
          <HStack spacing={3} w="100%" justify="space-between">
            <Button
              colorScheme="red"
              variant="outline"
              size="sm"
              onClick={() => onDeleteTask(task.id)}
            >
              Delete Task
            </Button>
            <HStack spacing={3}>
              <Button
                variant="ghost"
                onClick={onClose}
                color="gray.400"
                _hover={{ bg: 'whiteAlpha.100', color: 'white' }}
              >
                Cancel
              </Button>
              <Button
                colorScheme="purple"
                onClick={handleEditTask}
              >
                Save Changes
              </Button>
            </HStack>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default EditTaskModal;
