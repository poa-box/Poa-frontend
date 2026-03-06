/**
 * SettingsStep - Optional features and services configuration
 *
 * This step configures optional org settings:
 * - Feature toggles (Education Hub, Election Hub)
 * - Gas sponsorship (PaymasterConfigSection)
 * - Future: pre-create projects, other settings
 */

import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Switch,
  Icon,
  useColorModeValue,
} from '@chakra-ui/react';
import { PiGraduationCap, PiHandshake } from 'react-icons/pi';
import { useDeployer } from '../context/DeployerContext';
import { StepHeader, NavigationButtons } from '../components/common';
import { PaymasterConfigSection } from '../components/paymaster/PaymasterConfigSection';

/**
 * FeatureToggle - A single feature toggle row
 */
function FeatureToggle({ icon, name, description, isEnabled, onChange }) {
  const helperColor = useColorModeValue('warmGray.500', 'warmGray.400');

  return (
    <HStack justify="space-between" py={3}>
      <HStack spacing={3}>
        <Icon as={icon} boxSize={5} color="amethyst.500" />
        <Box>
          <Text fontWeight="600" fontSize="sm">
            {name}
          </Text>
          <Text fontSize="xs" color={helperColor}>
            {description}
          </Text>
        </Box>
      </HStack>
      <Switch
        isChecked={isEnabled}
        onChange={(e) => onChange(e.target.checked)}
        colorScheme="purple"
        size="md"
      />
    </HStack>
  );
}

export function SettingsStep() {
  const { state, actions } = useDeployer();

  const cardBg = useColorModeValue('rgba(255, 255, 255, 0.8)', 'rgba(51, 48, 44, 0.8)');
  const borderColor = useColorModeValue('warmGray.200', 'warmGray.600');
  const dividerColor = useColorModeValue('warmGray.100', 'warmGray.700');

  const handleNext = () => {
    actions.nextStep();
  };

  const handleBack = () => {
    actions.prevStep();
  };

  return (
    <>
      <StepHeader
        title="Settings"
        description="Configure optional features and services for your organization."
      />

      <VStack spacing={6} align="stretch">
        {/* Feature Toggles */}
        <Box
          bg={cardBg}
          p={6}
          borderRadius="2xl"
          border="1px solid"
          borderColor={borderColor}
          backdropFilter="blur(16px)"
          boxShadow="0 4px 24px rgba(0, 0, 0, 0.06)"
        >
          <Text fontWeight="600" fontSize="md" mb={1}>
            Features
          </Text>
          <Text fontSize="xs" color="warmGray.500" mb={4}>
            Enable optional modules for your organization
          </Text>

          <VStack spacing={0} align="stretch" divider={<Box borderBottomWidth="1px" borderColor={dividerColor} />}>
            <FeatureToggle
              icon={PiGraduationCap}
              name="Education Hub"
              description="Create learning modules and onboarding resources for your community"
              isEnabled={state.features.educationHubEnabled}
              onChange={(value) => actions.toggleFeature('educationHubEnabled', value)}
            />
            <FeatureToggle
              icon={PiHandshake}
              name="Election Hub"
              description="Run elections for leadership positions within your organization"
              isEnabled={state.features.electionHubEnabled}
              onChange={(value) => actions.toggleFeature('electionHubEnabled', value)}
            />
          </VStack>
        </Box>

        {/* Gas Sponsorship */}
        <PaymasterConfigSection />

        {/* Navigation */}
        <NavigationButtons
          onBack={handleBack}
          onNext={handleNext}
          nextLabel="Review & Launch"
        />
      </VStack>
    </>
  );
}

export default SettingsStep;
