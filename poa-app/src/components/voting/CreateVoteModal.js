import React from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  Button,
  VStack,
  HStack,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Select,
  Text,
  Box,
  Alert,
  AlertIcon,
  Tooltip,
  Switch,
  Checkbox,
  Wrap,
  WrapItem,
  IconButton,
} from "@chakra-ui/react";
import { InfoOutlineIcon, AddIcon, CloseIcon } from "@chakra-ui/icons";
import { useRoleNames } from "@/hooks";
import { usePOContext } from "@/context/POContext";
import { getNetworkByChainId } from "../../config/networks";
import SetterActionSelector from "./SetterActionSelector";
import ElectionConfigurator from "./ElectionConfigurator";
import { inputStyles } from '@/components/shared/glassStyles';

const glassLayerStyle = {
  position: "absolute",
  height: "100%",
  width: "100%",
  zIndex: -1,
  borderRadius: "inherit",
  backgroundColor: "rgba(15, 10, 25, 0.97)",
  boxShadow: "inset 0 0 15px rgba(148, 115, 220, 0.15)",
  border: "1px solid rgba(148, 115, 220, 0.3)",
};

const selectStyles = {
  ...inputStyles,
  sx: {
    "& option": {
      bg: "gray.800",
      color: "white",
    },
  },
};

const CreateVoteModal = ({
  isOpen,
  onClose,
  proposal,
  handleInputChange,
  handleOptionChange,
  addOption,
  removeOption,
  handleProposalTypeChange,
  handleTransferAddressChange,
  handleTransferAmountChange,
  handleRestrictedToggle,
  toggleRestrictedRole,
  handleSetterChange,
  handlePollCreated,
  loadingSubmit,
  allProjects = [],
  roleNames = {},
  projectNames = {},
  votingClasses = [],
  leaderboardData = [],
}) => {
  const { allRoles } = useRoleNames();
  const { orgChainId } = usePOContext();
  const orgNetwork = getNetworkByChainId(orgChainId);
  const nativeCurrencySymbol = orgNetwork?.nativeCurrency?.symbol || 'ETH';

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
          Create a Vote
        </ModalHeader>
        <ModalCloseButton color="white" />

        <ModalBody pb={6}>
          <VStack spacing={6} align="stretch">
            {/* Vote Details Section */}
            <Box>
              <Text
                fontSize="xs"
                fontWeight="bold"
                color="purple.300"
                mb={3}
                textTransform="uppercase"
                letterSpacing="wide"
              >
                Vote Details
              </Text>
              <VStack spacing={4} align="stretch">
                <FormControl>
                  <FormLabel color="gray.200" fontSize="sm">
                    Vote Title
                  </FormLabel>
                  <Input
                    placeholder="Enter title"
                    name="name"
                    value={proposal.name}
                    onChange={handleInputChange}
                    {...inputStyles}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel color="gray.200" fontSize="sm">
                    Description
                  </FormLabel>
                  <Textarea
                    placeholder="Enter description"
                    name="description"
                    value={proposal.description}
                    onChange={handleInputChange}
                    h="120px"
                    {...inputStyles}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel color="gray.200" fontSize="sm">
                    Vote Duration (minutes)
                  </FormLabel>
                  <Input
                    placeholder="Enter time in minutes"
                    name="time"
                    type="number"
                    value={proposal.time}
                    onChange={handleInputChange}
                    {...inputStyles}
                  />
                </FormControl>
              </VStack>
            </Box>

            {/* Vote Configuration Section */}
            <Box>
              <Text
                fontSize="xs"
                fontWeight="bold"
                color="purple.300"
                mb={3}
                textTransform="uppercase"
                letterSpacing="wide"
              >
                Vote Configuration
              </Text>
              <VStack spacing={4} align="stretch">
                <FormControl>
                  <FormLabel color="gray.200" fontSize="sm">
                    Vote Type
                  </FormLabel>
                  <Select
                    placeholder="Select vote type"
                    name="type"
                    value={proposal.type}
                    onChange={handleProposalTypeChange}
                    {...selectStyles}
                  >
                    <option value="normal">Standard Poll</option>
                    <option value="election">Election (assign role to winner)</option>
                    <option value="transferFunds">Transfer Funds</option>
                    <option value="setter">Change Contract Settings</option>
                  </Select>
                </FormControl>

                {proposal.type === "normal" && (
                  <FormControl>
                    <FormLabel color="gray.200" fontSize="sm">
                      Voting Options
                    </FormLabel>
                    <VStack spacing={2} align="stretch">
                      {proposal.options.map((option, index) => (
                        <HStack key={index} spacing={2}>
                          <Input
                            placeholder={`Option ${index + 1}`}
                            value={option}
                            onChange={(e) => handleOptionChange(index, e.target.value)}
                            {...inputStyles}
                          />
                          <IconButton
                            aria-label="Remove option"
                            icon={<CloseIcon boxSize={2.5} />}
                            size="sm"
                            variant="ghost"
                            color="gray.400"
                            _hover={{ color: "red.300", bg: "whiteAlpha.100" }}
                            onClick={() => removeOption(index)}
                            isDisabled={proposal.options.length <= 2}
                          />
                        </HStack>
                      ))}
                      <Button
                        leftIcon={<AddIcon boxSize={3} />}
                        size="sm"
                        variant="ghost"
                        color="purple.300"
                        _hover={{ bg: "whiteAlpha.100" }}
                        onClick={addOption}
                        alignSelf="flex-start"
                      >
                        Add Option
                      </Button>
                    </VStack>
                  </FormControl>
                )}

                {proposal.type === "election" && (
                  <ElectionConfigurator
                    proposal={proposal}
                    onChange={handleSetterChange}
                    allRoles={allRoles}
                    leaderboardData={leaderboardData}
                  />
                )}

                {proposal.type === "transferFunds" && (
                  <>
                    <FormControl>
                      <FormLabel color="gray.200" fontSize="sm">
                        Recipient Address
                      </FormLabel>
                      <Input
                        placeholder="0x..."
                        value={proposal.transferAddress}
                        onChange={handleTransferAddressChange}
                        {...inputStyles}
                      />
                    </FormControl>

                    <FormControl>
                      <FormLabel color="gray.200" fontSize="sm">
                        Amount ({nativeCurrencySymbol})
                      </FormLabel>
                      <Input
                        placeholder={`Amount in ${nativeCurrencySymbol}`}
                        value={proposal.transferAmount}
                        onChange={handleTransferAmountChange}
                        type="number"
                        step="0.001"
                        min="0"
                        {...inputStyles}
                      />
                    </FormControl>

                    <Box
                      bg="whiteAlpha.50"
                      borderRadius="md"
                      p={3}
                      border="1px solid rgba(148, 115, 220, 0.3)"
                    >
                      <Text fontSize="sm" color="gray.300" fontWeight="medium" mb={2}>
                        Voting Options:
                      </Text>
                      <VStack align="start" spacing={1} pl={2}>
                        <Text fontSize="sm" color="green.300">✓ Yes - Execute transfer</Text>
                        <Text fontSize="sm" color="red.300">✗ No - Reject transfer</Text>
                      </VStack>
                    </Box>

                    <Alert status="info" borderRadius="md" bg="rgba(66, 153, 225, 0.15)">
                      <AlertIcon color="blue.300" />
                      <Text fontSize="sm" color="gray.300">
                        This creates a Yes/No vote. If "Yes" wins, the transfer executes automatically from the organization's treasury.
                      </Text>
                    </Alert>
                  </>
                )}

                {proposal.type === "setter" && (
                  <SetterActionSelector
                    proposal={proposal}
                    onChange={handleSetterChange}
                    allRoles={allRoles}
                    allProjects={allProjects}
                    roleNames={roleNames}
                    votingClasses={votingClasses}
                    projectNames={projectNames}
                  />
                )}
              </VStack>
            </Box>

            {/* Voting Restrictions Section */}
            <Box>
              <Text
                fontSize="xs"
                fontWeight="bold"
                color="purple.300"
                mb={3}
                textTransform="uppercase"
                letterSpacing="wide"
              >
                Voting Restrictions
              </Text>
              <VStack spacing={4} align="stretch">
                <FormControl display="flex" alignItems="center">
                  <HStack flex="1">
                    <FormLabel htmlFor="restricted-voting" mb="0" color="gray.200" fontSize="sm">
                      Restrict who can vote
                    </FormLabel>
                    <Tooltip
                      label="Limit voting to specific roles instead of all members"
                      placement="top"
                      hasArrow
                      bg="gray.700"
                    >
                      <InfoOutlineIcon boxSize={3} color="gray.400" cursor="help" />
                    </Tooltip>
                  </HStack>
                  <Switch
                    id="restricted-voting"
                    isChecked={proposal.isRestricted}
                    onChange={(e) => handleRestrictedToggle(e.target.checked)}
                    colorScheme="purple"
                  />
                </FormControl>

                {proposal.isRestricted && (
                  <Box
                    p={4}
                    bg="whiteAlpha.50"
                    borderRadius="md"
                    border="1px solid rgba(148, 115, 220, 0.3)"
                  >
                    <Text fontSize="sm" color="gray.300" fontWeight="medium" mb={3}>
                      Select which roles can vote:
                    </Text>
                    <Wrap spacing={2}>
                      {allRoles?.map((role) => (
                        <WrapItem key={role.hatId}>
                          <Checkbox
                            isChecked={proposal.restrictedHatIds?.includes(role.hatId)}
                            onChange={() => toggleRestrictedRole(role.hatId)}
                            colorScheme="purple"
                            size="md"
                          >
                            <Text fontSize="sm" color="white">{role.name}</Text>
                          </Checkbox>
                        </WrapItem>
                      ))}
                    </Wrap>
                    {proposal.restrictedHatIds?.length === 0 && (
                      <Text fontSize="xs" color="orange.300" mt={2}>
                        Please select at least one role
                      </Text>
                    )}
                  </Box>
                )}
              </VStack>
            </Box>
          </VStack>
        </ModalBody>

        <ModalFooter borderTop="1px solid" borderColor="whiteAlpha.200" pt={4}>
          <HStack spacing={3} w="100%" justify="flex-end">
            <Button
              variant="ghost"
              onClick={onClose}
              color="gray.400"
              _hover={{ bg: "whiteAlpha.100", color: "white" }}
            >
              Cancel
            </Button>
            <Button
              colorScheme="purple"
              onClick={handlePollCreated}
              isLoading={loadingSubmit}
              loadingText="Creating..."
            >
              Create Vote
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default CreateVoteModal;