/**
 * PaymasterConfigSection - Optional gas sponsorship configuration
 *
 * Configures how the org sponsors gas for member transactions:
 * - Auto-whitelist deployed contracts
 * - Operator role selection
 * - ETH funding deposit
 * - Budget limits per role per epoch
 * - Advanced gas caps
 */

import React, { useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Switch,
  FormControl,
  FormLabel,
  FormHelperText,
  Select,
  Input,
  InputGroup,
  InputRightAddon,
  Icon,
  Collapse,
  useColorModeValue,
  Badge,
  Tooltip,
  SimpleGrid,
} from '@chakra-ui/react';
import { InfoIcon } from '@chakra-ui/icons';
import { PiGasPump, PiShieldCheck, PiGear } from 'react-icons/pi';
import { useDeployer } from '../../context/DeployerContext';

export function PaymasterConfigSection() {
  const { state, actions } = useDeployer();
  const { paymaster, roles } = state;
  const [showBudget, setShowBudget] = useState(false);
  const [showGasLimits, setShowGasLimits] = useState(false);

  const cardBg = useColorModeValue('rgba(255, 255, 255, 0.8)', 'rgba(51, 48, 44, 0.8)');
  const borderColor = useColorModeValue('warmGray.200', 'warmGray.600');
  const helperColor = useColorModeValue('warmGray.500', 'warmGray.400');
  const sectionBg = useColorModeValue('warmGray.50', 'warmGray.700');

  const handleToggle = (checked) => {
    actions.togglePaymaster(checked);
  };

  const handleUpdate = (field, value) => {
    actions.updatePaymaster({ [field]: value });
  };

  // Check if budget fields have values (to auto-expand)
  const hasBudgetValues = paymaster.budgetCapEth || paymaster.budgetEpochValue;
  const hasGasLimitValues = paymaster.maxFeePerGas || paymaster.maxPriorityFeePerGas ||
    paymaster.maxCallGas || paymaster.maxVerificationGas || paymaster.maxPreVerificationGas;

  return (
    <Box
      bg={cardBg}
      p={6}
      borderRadius="xl"
      border="1px solid"
      borderColor={borderColor}
      backdropFilter="blur(16px)"
      boxShadow="0 4px 24px rgba(0, 0, 0, 0.06)"
    >
      {/* Header with toggle */}
      <HStack justify="space-between" mb={paymaster.enabled ? 5 : 0}>
        <HStack spacing={3}>
          <Icon as={PiGasPump} boxSize={5} color="amethyst.500" />
          <VStack align="start" spacing={0}>
            <Heading size="sm">Gas Sponsorship</Heading>
            <Text fontSize="xs" color={helperColor}>
              Sponsor gas fees for your members' transactions
            </Text>
          </VStack>
        </HStack>
        <HStack spacing={2}>
          <Badge
            colorScheme={paymaster.enabled ? 'green' : 'gray'}
            fontSize="xs"
            variant="subtle"
          >
            {paymaster.enabled ? 'Enabled' : 'Optional'}
          </Badge>
          <Switch
            isChecked={paymaster.enabled}
            onChange={(e) => handleToggle(e.target.checked)}
            colorScheme="purple"
            size="md"
          />
        </HStack>
      </HStack>

      <Collapse in={paymaster.enabled} animateOpacity>
        <VStack spacing={5} align="stretch">
          {/* Auto-whitelist contracts */}
          <Box
            p={4}
            bg={sectionBg}
            borderRadius="lg"
            border="1px solid"
            borderColor="warmGray.100"
          >
            <HStack justify="space-between">
              <HStack spacing={3}>
                <Icon as={PiShieldCheck} color="green.500" boxSize={5} />
                <VStack align="start" spacing={0}>
                  <Text fontWeight="600" fontSize="sm">
                    Auto-whitelist contracts
                  </Text>
                  <Text fontSize="xs" color={helperColor}>
                    Automatically sponsor gas for your org's core operations (voting, tasks, joining)
                  </Text>
                </VStack>
              </HStack>
              <Switch
                isChecked={paymaster.autoWhitelistContracts}
                onChange={(e) => handleUpdate('autoWhitelistContracts', e.target.checked)}
                colorScheme="green"
                size="md"
              />
            </HStack>
          </Box>

          {/* Operator role */}
          <FormControl>
            <FormLabel fontSize="sm" fontWeight="600">
              Operator Role
              <Tooltip
                label="This role can manage gas sponsorship rules after deployment. Select 'None' to restrict management to the top hat admin only."
                placement="top"
                hasArrow
              >
                <InfoIcon ml={2} boxSize={3} color={helperColor} />
              </Tooltip>
            </FormLabel>
            <Select
              value={paymaster.operatorRoleIndex === null ? '' : paymaster.operatorRoleIndex}
              onChange={(e) => {
                const val = e.target.value;
                handleUpdate('operatorRoleIndex', val === '' ? null : Number(val));
              }}
              size="sm"
              borderRadius="md"
            >
              <option value="">None (top hat only)</option>
              {roles.map((role, idx) => (
                <option key={idx} value={idx}>
                  {role.name}
                </option>
              ))}
            </Select>
            <FormHelperText fontSize="xs">
              Which role can manage sponsorship rules after deployment
            </FormHelperText>
          </FormControl>

          {/* ETH Funding */}
          <FormControl>
            <FormLabel fontSize="sm" fontWeight="600">
              Initial ETH Funding
            </FormLabel>
            <InputGroup size="sm">
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0"
                value={paymaster.fundingAmountEth}
                onChange={(e) => handleUpdate('fundingAmountEth', e.target.value)}
                borderRadius="md"
              />
              <InputRightAddon>ETH</InputRightAddon>
            </InputGroup>
            <FormHelperText fontSize="xs">
              ETH deposited to your org's sponsorship pool. Members' gas fees are paid from this balance.
            </FormHelperText>
          </FormControl>

          {/* Budget Limits (collapsible) */}
          <Box>
            <HStack
              cursor="pointer"
              onClick={() => setShowBudget(!showBudget)}
              py={1}
            >
              <Icon as={PiGear} boxSize={4} color={helperColor} />
              <Text fontSize="sm" fontWeight="600" color={helperColor}>
                Budget Limits
              </Text>
              <Badge fontSize="xs" colorScheme="gray" variant="subtle">
                {hasBudgetValues ? 'configured' : 'optional'}
              </Badge>
            </HStack>
            <Collapse in={showBudget || !!hasBudgetValues} animateOpacity>
              <Box
                mt={2}
                p={4}
                bg={sectionBg}
                borderRadius="lg"
                border="1px solid"
                borderColor="warmGray.100"
              >
                <VStack spacing={4} align="stretch">
                  <Text fontSize="xs" color={helperColor}>
                    Set a spending cap per role per time period. Each role gets the same default budget.
                  </Text>
                  <SimpleGrid columns={2} spacing={3}>
                    <FormControl>
                      <FormLabel fontSize="xs" fontWeight="600">Spending Cap</FormLabel>
                      <InputGroup size="sm">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0"
                          value={paymaster.budgetCapEth}
                          onChange={(e) => handleUpdate('budgetCapEth', e.target.value)}
                          borderRadius="md"
                        />
                        <InputRightAddon>ETH</InputRightAddon>
                      </InputGroup>
                    </FormControl>
                    <FormControl>
                      <FormLabel fontSize="xs" fontWeight="600">Epoch Duration</FormLabel>
                      <HStack spacing={2}>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          placeholder="0"
                          value={paymaster.budgetEpochValue}
                          onChange={(e) => handleUpdate('budgetEpochValue', e.target.value)}
                          size="sm"
                          borderRadius="md"
                          flex={1}
                        />
                        <Select
                          value={paymaster.budgetEpochUnit}
                          onChange={(e) => handleUpdate('budgetEpochUnit', e.target.value)}
                          size="sm"
                          borderRadius="md"
                          w="100px"
                        >
                          <option value="hours">hours</option>
                          <option value="days">days</option>
                          <option value="weeks">weeks</option>
                        </Select>
                      </HStack>
                    </FormControl>
                  </SimpleGrid>
                  <Text fontSize="xs" color={helperColor}>
                    Epoch must be between 1 hour and 365 days. Leave both empty to skip budget limits.
                  </Text>
                </VStack>
              </Box>
            </Collapse>
          </Box>

          {/* Advanced Gas Limits (collapsible) */}
          <Box>
            <HStack
              cursor="pointer"
              onClick={() => setShowGasLimits(!showGasLimits)}
              py={1}
            >
              <Icon as={PiGear} boxSize={4} color={helperColor} />
              <Text fontSize="sm" fontWeight="600" color={helperColor}>
                Advanced Gas Limits
              </Text>
              <Badge fontSize="xs" colorScheme="gray" variant="subtle">
                {hasGasLimitValues ? 'configured' : 'optional'}
              </Badge>
            </HStack>
            <Collapse in={showGasLimits || !!hasGasLimitValues} animateOpacity>
              <Box
                mt={2}
                p={4}
                bg={sectionBg}
                borderRadius="lg"
                border="1px solid"
                borderColor="warmGray.100"
              >
                <VStack spacing={3} align="stretch">
                  <Text fontSize="xs" color={helperColor}>
                    Cap gas parameters for sponsored transactions. Leave empty for no limit.
                  </Text>
                  <SimpleGrid columns={2} spacing={3}>
                    <FormControl>
                      <FormLabel fontSize="xs" fontWeight="600">Max Fee Per Gas</FormLabel>
                      <InputGroup size="sm">
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          placeholder="no limit"
                          value={paymaster.maxFeePerGas}
                          onChange={(e) => handleUpdate('maxFeePerGas', e.target.value)}
                          borderRadius="md"
                        />
                        <InputRightAddon>gwei</InputRightAddon>
                      </InputGroup>
                    </FormControl>
                    <FormControl>
                      <FormLabel fontSize="xs" fontWeight="600">Max Priority Fee</FormLabel>
                      <InputGroup size="sm">
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          placeholder="no limit"
                          value={paymaster.maxPriorityFeePerGas}
                          onChange={(e) => handleUpdate('maxPriorityFeePerGas', e.target.value)}
                          borderRadius="md"
                        />
                        <InputRightAddon>gwei</InputRightAddon>
                      </InputGroup>
                    </FormControl>
                    <FormControl>
                      <FormLabel fontSize="xs" fontWeight="600">Max Call Gas</FormLabel>
                      <Input
                        type="number"
                        step="1000"
                        min="0"
                        placeholder="no limit"
                        value={paymaster.maxCallGas}
                        onChange={(e) => handleUpdate('maxCallGas', e.target.value)}
                        size="sm"
                        borderRadius="md"
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel fontSize="xs" fontWeight="600">Max Verification Gas</FormLabel>
                      <Input
                        type="number"
                        step="1000"
                        min="0"
                        placeholder="no limit"
                        value={paymaster.maxVerificationGas}
                        onChange={(e) => handleUpdate('maxVerificationGas', e.target.value)}
                        size="sm"
                        borderRadius="md"
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel fontSize="xs" fontWeight="600">Max Pre-Verification Gas</FormLabel>
                      <Input
                        type="number"
                        step="1000"
                        min="0"
                        placeholder="no limit"
                        value={paymaster.maxPreVerificationGas}
                        onChange={(e) => handleUpdate('maxPreVerificationGas', e.target.value)}
                        size="sm"
                        borderRadius="md"
                      />
                    </FormControl>
                  </SimpleGrid>
                </VStack>
              </Box>
            </Collapse>
          </Box>
        </VStack>
      </Collapse>
    </Box>
  );
}

export default PaymasterConfigSection;
