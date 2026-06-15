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
  Image,
  Link,
} from '@chakra-ui/react';
import { ExternalLinkIcon } from '@chakra-ui/icons';
import { getBountyTokenOptions, BOUNTY_TOKENS, hasBounty as checkHasBounty } from '../../util/tokens';
import { usePOContext } from '../../context/POContext';
import EstTimePicker from './EstTimePicker';
import DeadlineFields from './DeadlineFields';
import { localDateStrToEndOfDaySec, secToLocalDateStr, toSec } from '@/util/deadlineUtils';

const glassLayerStyle = {
  position: 'absolute',
  height: '100%',
  width: '100%',
  zIndex: -1,
  borderRadius: 'inherit',
  backgroundColor: 'rgba(25, 25, 30, 0.97)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
};

const inputStyles = {
  bg: 'whiteAlpha.100',
  border: '1px solid',
  borderColor: 'whiteAlpha.200',
  color: 'white',
  _placeholder: { color: 'gray.500' },
  _hover: { borderColor: 'whiteAlpha.300' },
  _focus: {
    borderColor: 'gray.400',
    boxShadow: '0 0 0 1px var(--chakra-colors-gray-400)',
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

// `allowDelete` defaults to true to preserve the pre-claim path. For post-claim editing
// (TaskManager v5 EDIT_FULL) the parent should pass `false` because `cancelTask` reverts
// `BadStatus` once a task leaves UNCLAIMED.
//
// `metadataOnly` defaults to false. When true the modal hides + disables the bounty
// section because the underlying call (TaskManager v5 `updateTaskMetadata`) only writes
// title + metadataHash. EDIT_META-only callers are routed here from TaskCardModal so
// they can't even attempt a payout/bounty edit that the contract would revert.
const EditTaskModal = ({
  isOpen,
  onClose,
  onEditTask,
  onDeleteTask,
  task,
  allowDelete = true,
  metadataOnly = false,
}) => {
  const { orgChainId, tokenLabel, taskPayoutHoursOnly } = usePOContext();
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

  // Deadlines (v6) — initialize from the task's current values.
  const taskWindowSec = toSec(task.completionWindow) || 0;
  const taskAbsSec = toSec(task.absoluteDeadline);
  const taskDueSec = toSec(task.dueDate);
  const [hasDeadlines, setHasDeadlines] = useState(!!(taskDueSec || taskAbsSec || taskWindowSec));
  const [dueDateStr, setDueDateStr] = useState(
    taskDueSec ? secToLocalDateStr(taskDueSec) : taskAbsSec ? secToLocalDateStr(taskAbsSec) : ''
  );
  const [enforceOnChain, setEnforceOnChain] = useState(taskAbsSec !== null);
  const [completionWindowSec, setCompletionWindowSec] = useState(taskWindowSec);

  const handleEditTask = () => {
    const dueSec = hasDeadlines && dueDateStr ? localDateStrToEndOfDaySec(dueDateStr) : null;
    onEditTask({
      ...task,
      name,
      description,
      difficulty,
      estHours,
      bountyToken: hasBounty ? bountyToken : BOUNTY_TOKENS.NONE.address,
      bountyAmount: hasBounty ? bountyAmount : '0',
      dueDate: dueSec,
      // metadataOnly callers route to updateTaskMetadata — on-chain knobs stay
      // whatever they were (the service never sees these fields on that path).
      absoluteDeadline: hasDeadlines && enforceOnChain && dueSec ? dueSec : 0,
      completionWindow: hasDeadlines ? completionWindowSec : 0,
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
                color="gray.400"
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
                color="gray.400"
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
                  <FormLabel color="gray.200" fontSize="sm">
                    {taskPayoutHoursOnly ? 'Estimated Time' : 'Estimated Hours'}
                  </FormLabel>
                  {taskPayoutHoursOnly ? (
                    <EstTimePicker
                      value={estHours}
                      onChange={setEstimatedHours}
                      inputStyles={inputStyles}
                      selectStyles={selectStyles}
                    />
                  ) : (
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
                  )}
                </FormControl>
              </SimpleGrid>
            </Box>

            {/* Token Bounty Section — hidden entirely in metadata-only mode so the editor
                isn't confused into thinking they can change a payout they can't write. */}
            {!metadataOnly && (
            <Box>
              <FormControl>
                <HStack justify="space-between" mb={hasBounty ? 3 : 0}>
                  <HStack>
                    <Text
                      fontSize="xs"
                      fontWeight="bold"
                      color="gray.400"
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
                    colorScheme="teal"
                    isDisabled={tokenOptions.length === 0}
                  />
                </HStack>
              </FormControl>

              {hasBounty && (
                <Box
                  p={4}
                  bg="whiteAlpha.50"
                  borderRadius="lg"
                  border="1px solid"
                  borderColor="whiteAlpha.100"
                >
                  <SimpleGrid columns={2} spacing={3}>
                    <FormControl>
                      <FormLabel color="gray.400" fontSize="xs">Token</FormLabel>
                      <HStack spacing={2}>
                        {(() => {
                          const selected = tokenOptions.find(t => t.address === bountyToken);
                          return selected?.logo ? (
                            <Image src={selected.logo} alt={selected.symbol} boxSize="24px" borderRadius="full" fallback={<></>} />
                          ) : null;
                        })()}
                        <Select
                          value={bountyToken}
                          onChange={(e) => setBountyToken(e.target.value)}
                          size="sm"
                          {...selectStyles}
                          flex={1}
                        >
                          {tokenOptions.map((token) => (
                            <option key={token.symbol} value={token.address}>
                              {token.symbol} - {token.name}
                            </option>
                          ))}
                        </Select>
                      </HStack>
                      {(() => {
                        const selected = tokenOptions.find(t => t.address === bountyToken);
                        if (!selected?.projectUrl) return null;
                        return (
                          <Link
                            href={selected.projectUrl}
                            isExternal
                            fontSize="xs"
                            color="orange.400"
                            mt={1}
                            display="inline-flex"
                            alignItems="center"
                            gap={1}
                            _hover={{ color: 'orange.300', textDecoration: 'underline' }}
                          >
                            {new URL(selected.projectUrl).hostname}
                            <ExternalLinkIcon boxSize={3} />
                          </Link>
                        );
                      })()}
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
                    This bounty will be paid in addition to {tokenLabel.toLowerCase()}
                  </Text>
                </Box>
              )}
            </Box>
            )}
            {/* Deadlines Section (v6). EDIT_META callers can change only the soft due
                date (metadata); the on-chain knobs need EDIT_FULL via updateTask. */}
            <DeadlineFields
              hasDeadlines={hasDeadlines}
              setHasDeadlines={setHasDeadlines}
              dueDateStr={dueDateStr}
              setDueDateStr={setDueDateStr}
              enforceOnChain={enforceOnChain}
              setEnforceOnChain={setEnforceOnChain}
              completionWindowSec={completionWindowSec}
              setCompletionWindowSec={setCompletionWindowSec}
              metadataOnly={metadataOnly}
            />

            {metadataOnly && (
              <Box
                px={4}
                py={3}
                bg="whiteAlpha.50"
                borderRadius="lg"
                border="1px dashed"
                borderColor="whiteAlpha.200"
              >
                <Text fontSize="xs" color="gray.400">
                  Editing metadata only. The display due date can be changed; payout, bounty
                  and on-chain deadlines are locked — this hat has EDIT_META permission but
                  not EDIT_FULL.
                </Text>
              </Box>
            )}
          </VStack>
        </ModalBody>

        <ModalFooter borderTop="1px solid" borderColor="whiteAlpha.200" pt={4}>
          <HStack spacing={3} w="100%" justify={allowDelete ? 'space-between' : 'flex-end'}>
            {allowDelete && (
              <Button
                colorScheme="red"
                variant="outline"
                size="sm"
                onClick={() => onDeleteTask(task.id)}
              >
                Delete Task
              </Button>
            )}
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
                colorScheme="teal"
                onClick={handleEditTask}
                isDisabled={taskPayoutHoursOnly && !(Number(estHours) > 0)}
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
